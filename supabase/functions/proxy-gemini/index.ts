import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Phase 1 fix (Audit C8): Model name allowlist
const ALLOWED_MODELS = new Set([
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-2.0-flash',
    'gemini-3-flash',
])

serve(async (req) => {
    // 1. Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. Phase 1 fix (Audit C4): Real JWT verification
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing Authorization header' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader || '' } }
        })
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized', authError: authError?.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        // 3. Parse Request Body
        const {
            systemInstruction,
            prompt,
            model = 'gemini-3-flash-preview',
            requireGroundedSearch = false,
            responseSchema
        } = await req.json()

        if (!prompt) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing prompt' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Phase 1 fix (Audit C8): Validate model name against allowlist
        if (!ALLOWED_MODELS.has(model)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid model name' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 4. Initialize clients
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

        if (!GEMINI_API_KEY) {
            console.error('[proxy-gemini] GEMINI_API_KEY secret is not set')
            return new Response(
                JSON.stringify({ success: false, error: 'Server configuration error' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
            )
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 5. Construct Gemini API call
        console.log(`[proxy-gemini] Calling ${model} (Grounded Search: ${requireGroundedSearch})`)
        const startTime = Date.now()

        const payload: any = {
            contents: [
                { role: 'user', parts: [{ text: prompt }] }
            ],
            generationConfig: {
                temperature: 0.2,
            }
        }

        if (systemInstruction) {
            payload.systemInstruction = {
                parts: [{ text: systemInstruction }]
            }
        }

        if (requireGroundedSearch) {
            payload.tools = [
                { googleSearch: {} }
            ]
        }

        if (responseSchema) {
            payload.generationConfig.responseMimeType = 'application/json'
            payload.generationConfig.responseSchema = responseSchema
        }

        // 6. Phase 1 fix (Audit C7): Move API key from URL query param to request header
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': GEMINI_API_KEY,
                },
                body: JSON.stringify(payload)
            }
        )

        if (!geminiRes.ok) {
            const errorText = await geminiRes.text()
            console.error(`Gemini API Error: ${geminiRes.status} ${errorText}`)
            // Phase 2 fix (Audit m17): Use 502 for upstream errors
            return new Response(
                JSON.stringify({ success: false, error: 'AI service returned an error' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
            )
        }

        const data = await geminiRes.json()
        const durationMs = Date.now() - startTime

        let text = ''
        if (data.candidates && data.candidates.length > 0) {
            text = data.candidates[0].content.parts[0].text
        }

        const inputTokens = data.usageMetadata?.promptTokenCount || 0
        const outputTokens = data.usageMetadata?.candidatesTokenCount || 0

        // 7. Phase 2 fix (Audit M3 detailed): Await the usage log insert instead of fire-and-forget
        const { error: logError } = await supabaseAdmin.from('api_usage').insert({
            provider: model,
            endpoint: 'generateContent',
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            grounded_search_used: requireGroundedSearch,
            latency_ms: durationMs,
            success: true,
            estimated_cost_usd: (inputTokens / 1_000_000 * 0.075) + (outputTokens / 1_000_000 * 0.30)
        })
        if (logError) console.error('[proxy-gemini] Failed to log usage:', logError)

        // 8. Return successful response
        return new Response(
            JSON.stringify({
                success: true,
                text,
                metadata: {
                    inputTokens,
                    outputTokens,
                    durationMs
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('[proxy-gemini] Error:', error.message)
        // Phase 2 fix (Audit m18): Don't leak internal error details to client
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
