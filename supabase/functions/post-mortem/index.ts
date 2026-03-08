import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Post-Mortem Edge Function
 *
 * Called after a trade is closed (via HL CSV import or manual close).
 * Uses Gemini to extract a Buffett/Lynch lesson from the outcome,
 * then stores it in signal_lessons for future prompt injection.
 *
 * Input: { signal_id, ticker, outcome, return_pct, conviction_score, moat_rating, lynch_category, thesis }
 */
serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing Authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        })
        const token = authHeader.replace(/^Bearer\s+/i, '')
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const body = await req.json()
        const {
            signal_id,
            ticker,
            outcome,
            return_pct,
            conviction_score,
            moat_rating,
            lynch_category,
            thesis,
        } = body

        if (!ticker || !outcome) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: ticker, outcome' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || ''
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

        if (!GEMINI_API_KEY) {
            return new Response(
                JSON.stringify({ error: 'Server configuration error' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // Build the post-mortem prompt
        const outcomeStr = return_pct !== undefined
            ? `${outcome} (${return_pct > 0 ? '+' : ''}${return_pct.toFixed(1)}%)`
            : outcome

        const prompt = `You are a trading coach who applies Warren Buffett and Peter Lynch principles to swing trading.

Analyze this completed trade and extract ONE actionable lesson:

TRADE DETAILS:
- Ticker: ${ticker}
- Outcome: ${outcomeStr}
- Conviction Score: ${conviction_score ?? 'N/A'}/100
- Moat Rating: ${moat_rating ?? 'N/A'}/10
- Lynch Category: ${lynch_category ?? 'N/A'}
- Original Thesis: ${thesis ?? 'N/A'}

Generate a JSON response with:
{
  "lesson_text": "One clear, actionable rule (max 100 chars). Use format: 'Do X when Y' or 'Avoid X because Y'",
  "category": "moat|growth|value|risk_management|timing|sector",
  "outcome_impact": "${outcomeStr}"
}

Focus on:
- If WIN: What Buffett/Lynch principle validated? (e.g. "Strong moat + catalyst = reliable 2R setup")
- If LOSS: What quality filter would have prevented entry? (e.g. "Skip cyclicals with PEG >1.5 near sector top")
- Be specific and reference the actual trade context, not generic advice.

Return ONLY valid JSON.`

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 15_000)

        let lessonData: any = null

        try {
            const geminiRes = await fetch(
                'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': GEMINI_API_KEY,
                    },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.2,
                        },
                    }),
                    signal: controller.signal,
                }
            )

            if (!geminiRes.ok) {
                throw new Error(`Gemini error: ${geminiRes.status}`)
            }

            const data = await geminiRes.json()
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) {
                lessonData = JSON.parse(text)
            }
        } catch (e: any) {
            console.error('[post-mortem] Gemini call failed:', e.message)
            // Fallback: create a basic lesson without AI
            lessonData = {
                lesson_text: return_pct && return_pct > 0
                    ? `${ticker}: conviction ${conviction_score ?? '?'} trade won ${return_pct.toFixed(1)}%`
                    : `${ticker}: review entry criteria — ${outcome}`,
                category: 'risk_management',
                outcome_impact: outcomeStr,
            }
        } finally {
            clearTimeout(timeout)
        }

        // Store the lesson
        const { error: insertError } = await supabase.from('signal_lessons').insert({
            ticker,
            category: lessonData.category || 'risk_management',
            conviction_score: conviction_score ?? null,
            lesson_text: (lessonData.lesson_text || '').slice(0, 500),
            outcome_impact: lessonData.outcome_impact || outcomeStr,
            trade_return_pct: return_pct ?? null,
            lynch_category: lynch_category ?? null,
            moat_rating: moat_rating ?? null,
            signal_id: signal_id ?? null,
        })

        if (insertError) {
            console.error('[post-mortem] Failed to insert lesson:', insertError.message)
            return new Response(
                JSON.stringify({ error: 'Failed to store lesson' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({
                success: true,
                lesson: lessonData,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: any) {
        console.error('[post-mortem] Fatal error:', error.message)
        return new Response(
            JSON.stringify({ error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
