import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Rate limiting (in-memory, per-user)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const GEMINI_RATE_LIMIT = 60 // requests per minute

function checkRateLimit(userId: string): boolean {
    const now = Date.now()
    const entry = rateLimitMap.get(userId)
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(userId, { count: 1, resetAt: now + 60_000 })
        return true
    }
    if (entry.count >= GEMINI_RATE_LIMIT) return false
    entry.count++
    return true
}

// Phase 1 fix (Audit C8): Model name allowlist
const ALLOWED_MODELS = new Set([
    'gemini-3.1-flash-lite',
    'gemini-3.1-flash-lite-preview',
    'gemini-3-flash-preview',
    'gemini-3-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
])

/**
 * Call the Gemini API with the given payload.
 * Returns { data, inputTokens, outputTokens } on success, or throws on failure.
 */
async function callGemini(
    model: string,
    payload: any,
    apiKey: string
): Promise<{ data: any; text: string; inputTokens: number; outputTokens: number }> {
    // 25s timeout per call — leaves room for a retry (25+25=50s < 60s gateway)
    // Supabase gateway kills at 60s and strips CORS headers, causing client errors
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 25_000)

    try {
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-goog-api-key': apiKey,
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            }
        )

        if (!geminiRes.ok) {
            const errorText = await geminiRes.text()
            throw new Error(`Gemini API ${geminiRes.status}: ${errorText}`)
        }

        const data = await geminiRes.json()

        let text = ''
        if (data.candidates && data.candidates.length > 0) {
            text = data.candidates[0].content?.parts?.[0]?.text || ''
        }

        const inputTokens = data.usageMetadata?.promptTokenCount || 0
        const outputTokens = data.usageMetadata?.candidatesTokenCount || 0

        return { data, text, inputTokens, outputTokens }
    } finally {
        clearTimeout(timeoutId)
    }
}

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
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized', authError: authError?.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        // Rate limit check
        if (!checkRateLimit(user.id)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Rate limit exceeded' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' }, status: 429 }
            )
        }

        // 3. Parse Request Body
        const {
            systemInstruction,
            prompt,
            messages,
            model = 'gemini-3-flash-preview',
            requireGroundedSearch = false,
            responseSchema,
            temperature,
            enableThinking = false
        } = await req.json()

        if (!prompt && (!messages || messages.length === 0)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing prompt or messages' }),
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

        // Use gemini-3-flash-preview for all calls including grounded search —
        // better reasoning and logic quality outweighs the speed difference.
        const effectiveModel = requireGroundedSearch ? 'gemini-3-flash-preview' : model

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
        // Clamp temperature to valid range (0.0-2.0), default 0.2
        const effectiveTemp = typeof temperature === 'number'
            ? Math.max(0.0, Math.min(2.0, temperature))
            : 0.2

        console.log(`[proxy-gemini] Calling ${effectiveModel} (requested=${model}, temp=${effectiveTemp}, grounded=${requireGroundedSearch}, thinking=${enableThinking})`)
        const startTime = Date.now()

        // Support both single-turn (prompt) and multi-turn (messages) calls
        const contents = messages && Array.isArray(messages) && messages.length > 0
            ? messages.map((m: any) => ({ role: m.role, parts: [{ text: m.text }] }))
            : [{ role: 'user', parts: [{ text: prompt }] }]

        const payload: any = {
            contents,
            generationConfig: {
                temperature: effectiveTemp,
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

        // Enable Gemini's native thinking mode for deeper reasoning
        if (enableThinking) {
            payload.generationConfig.thinkingConfig = {
                thinkingBudget: 2048
            }
        }

        // Controlled generation (responseSchema) is incompatible with Google Search tool
        if (responseSchema && !requireGroundedSearch) {
            payload.generationConfig.responseMimeType = 'application/json'
            payload.generationConfig.responseSchema = responseSchema
        }

        // 6. Call Gemini with auto-retry on JSON parse failure
        let result: { data: any; text: string; inputTokens: number; outputTokens: number }
        let totalInputTokens = 0
        let totalOutputTokens = 0

        try {
            result = await callGemini(effectiveModel, payload, GEMINI_API_KEY)
            totalInputTokens += result.inputTokens
            totalOutputTokens += result.outputTokens

            // If JSON is expected (schema provided AND not grounded search), verify it parses. If not, retry once.
            // Skip retry when requireGroundedSearch — no schema was sent, so JSON failure is expected.
            if (responseSchema && !requireGroundedSearch && result.text) {
                try {
                    JSON.parse(result.text)
                } catch (_parseErr) {
                    console.warn('[proxy-gemini] JSON parse failed, retrying with feedback...')
                    // Append a correction message and retry
                    const retryContents = [
                        ...contents,
                        { role: 'model', parts: [{ text: result.text }] },
                        { role: 'user', parts: [{ text: 'Your previous response was not valid JSON. Return ONLY valid JSON matching the required schema, with no markdown formatting or extra text.' }] }
                    ]
                    const retryPayload = { ...payload, contents: retryContents }
                    result = await callGemini(effectiveModel, retryPayload, GEMINI_API_KEY)
                    totalInputTokens += result.inputTokens
                    totalOutputTokens += result.outputTokens
                    console.log('[proxy-gemini] Retry succeeded')
                }
            }
        } catch (geminiError: any) {
            console.error(`[proxy-gemini] Gemini API Error for model ${effectiveModel}: ${geminiError.message}`)
            // Phase 2 fix (Audit m17): Use 502 for upstream errors
            return new Response(
                JSON.stringify({ success: false, error: 'AI service returned an error', detail: geminiError.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
            )
        }

        const durationMs = Date.now() - startTime

        // 7. Phase 2 fix (Audit M3 detailed): Await the usage log insert instead of fire-and-forget
        const { error: logError } = await supabaseAdmin.from('api_usage').insert({
            provider: effectiveModel,
            endpoint: 'generateContent',
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            grounded_search_used: requireGroundedSearch,
            latency_ms: durationMs,
            success: true,
            estimated_cost_usd: (totalInputTokens / 1_000_000 * 0.075) + (totalOutputTokens / 1_000_000 * 0.30)
        })
        if (logError) console.error('[proxy-gemini] Failed to log usage:', logError)

        // 8. Return successful response
        return new Response(
            JSON.stringify({
                success: true,
                text: result.text,
                metadata: {
                    inputTokens: totalInputTokens,
                    outputTokens: totalOutputTokens,
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
