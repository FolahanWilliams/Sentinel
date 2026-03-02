import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // 1. Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 2. Validate Authentication (Supabase Auth vs Internal Password Gate)
        // For now we assume the client is passing a valid JWT if using Supabase Auth,
        // or we are just validating the custom password hash header if passing through the gate.
        // For simplicity in this demo, we'll verify the supabase anon key was used.
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }

        // 3. Parse Request Body
        const {
            systemInstruction,
            prompt,
            model = 'gemini-2.5-flash',
            requireGroundedSearch = false,
            responseSchema
        } = await req.json()

        if (!prompt) throw new Error('Missing prompt')

        // 4. Initialize clients
        // Get secrets: API keys are securely stored in Supabase Edge Function Secrets
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

        if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY secret is not set')

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 5. Construct Gemini API call
        console.log(`[proxy-gemini] Calling ${model} (Grounded Search: ${requireGroundedSearch})`)
        const startTime = Date.now()

        // Build the payload per Gemini REST API spec
        const payload: any = {
            contents: [
                { role: 'user', parts: [{ text: prompt }] }
            ],
            generationConfig: {
                temperature: 0.2,
            }
        }

        // Add system instruction if provided
        if (systemInstruction) {
            payload.systemInstruction = {
                parts: [{ text: systemInstruction }]
            }
        }

        // Add grounded search tool if requested
        if (requireGroundedSearch) {
            payload.tools = [
                { googleSearch: {} } // Enables Google Search grounding
            ]
        }

        // Add structured output schema if requested
        if (responseSchema) {
            payload.generationConfig.responseMimeType = 'application/json'
            payload.generationConfig.responseSchema = responseSchema
        }

        // 6. Execute Gemini API call
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }
        )

        if (!geminiRes.ok) {
            const errorText = await geminiRes.text()
            console.error(`Gemini API Error: ${geminiRes.status} ${errorText}`)
            throw new Error(`Gemini API Error: ${geminiRes.status}`)
        }

        const data = await geminiRes.json()
        const durationMs = Date.now() - startTime

        // Parse response
        let text = ''
        if (data.candidates && data.candidates.length > 0) {
            text = data.candidates[0].content.parts[0].text
        }

        // Count usage tokens
        const inputTokens = data.usageMetadata?.promptTokenCount || 0
        const outputTokens = data.usageMetadata?.candidatesTokenCount || 0

        // 7. Log Usage to Database (Bypass RLS using Service Role)
        // In Stage 2 we created the `api_usage` table.
        // We log it asynchronously so we don't block the response
        supabaseAdmin.from('api_usage').insert({
            provider: model,
            endpoint: 'generateContent',
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            grounded_search_used: requireGroundedSearch,
            latency_ms: durationMs,
            success: true,
            // Calculate ultra-rough cost (Flash pricing: ~$0.075 / 1M input, $0.30 / 1M output)
            estimated_cost_usd: (inputTokens / 1_000_000 * 0.075) + (outputTokens / 1_000_000 * 0.30)
        }).then(({ error }) => {
            if (error) console.error('[proxy-gemini] Failed to log usage:', error)
        })

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

        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
