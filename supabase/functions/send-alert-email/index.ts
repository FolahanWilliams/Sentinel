/**
 * Sentinel — Edge Function: send-alert-email
 *
 * Triggered by the database or client immediately after Sentinel's Red Team
 * Agent passes a trade thesis. Sends an email via Resend to the portfolio manager.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Phase 1 fix (Audit C6): HTML entity escaping to prevent XSS
function escapeHtml(str: unknown): string {
    const s = String(str ?? '')
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Phase 1 fix (Audit C4): Real JWT verification
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: 'Missing Authorization header' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        })
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Invalid or expired token' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        const body = await req.json()
        const { ticker, signalType, confidenceScore, thesis, targetPrice, stopLoss } = body

        // Phase 2 fix (Audit m27): Input validation
        if (!ticker || typeof ticker !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Missing or invalid ticker' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }
        if (!signalType || typeof signalType !== 'string') {
            return new Response(
                JSON.stringify({ error: 'Missing or invalid signalType' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
        const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL_DESTINATION') || 'alerts@sentinel-trading.com'

        if (!RESEND_API_KEY) {
            console.warn('[send-alert-email] RESEND_API_KEY not configured. Simulating email send.')
            return new Response(JSON.stringify({ success: true, simulated: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Phase 1 fix (Audit C6): All values are HTML-escaped to prevent XSS
        const htmlBody = `
      <h2>SENTINEL ALERT: New ${escapeHtml(signalType).toUpperCase()} Signal</h2>
      <p><strong>Ticker:</strong> ${escapeHtml(ticker)}</p>
      <p><strong>Confidence:</strong> ${escapeHtml(confidenceScore)}/100</p>
      <p><strong>Target:</strong> $${escapeHtml(targetPrice)} | <strong>Stop Loss:</strong> $${escapeHtml(stopLoss)}</p>
      <hr />
      <h3>Thesis:</h3>
      <p>${escapeHtml(thesis)}</p>
      <br />
      <p><small>Generated entirely by Sentinel AI Agents.</small></p>
    `

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Sentinel Engine <sentinel@resend.dev>',
                to: [ALERT_EMAIL],
                subject: `[SENTINEL ${escapeHtml(confidenceScore)}] ${escapeHtml(ticker)} - High Conviction Alert`,
                html: htmlBody,
            }),
        })

        const resData = await res.json()
        if (!res.ok) {
            console.error('[send-alert-email] Resend API Error:', resData.message)
            return new Response(
                JSON.stringify({ error: 'Email delivery failed' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
            )
        }

        return new Response(JSON.stringify({ success: true, id: resData.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('[send-alert-email] Error:', error.message)
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
