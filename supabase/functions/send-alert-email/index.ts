/**
 * Sentinel — Edge Function: send-alert-email
 *
 * Triggered by the database or client immediately after Sentinel's Red Team 
 * Agent passes a trade thesis. Sends an email via Resend to the portfolio manager.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { ticker, signalType, confidenceScore, thesis, targetPrice, stopLoss } = await req.json()

        // Auth Validation (must have service role or valid jwt)
        if (!req.headers.has('Authorization')) {
            throw new Error('Missing Authorization header')
        }

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
        const ALERT_EMAIL = Deno.env.get('ALERT_EMAIL_DESTINATION') || 'alerts@sentinel-trading.com'

        if (!RESEND_API_KEY) {
            console.warn('[send-alert-email] RESEND_API_KEY not configured. Simulating email send.')
            return new Response(JSON.stringify({ success: true, simulated: true }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
        }

        // Build the email body
        const htmlBody = `
      <h2>🚨 SENTINEL ALERT: New ${signalType.toUpperCase()} Signal</h2>
      <p><strong>Ticker:</strong> ${ticker}</p>
      <p><strong>Confidence:</strong> ${confidenceScore}/100</p>
      <p><strong>Target:</strong> $${targetPrice} | <strong>Stop Loss:</strong> $${stopLoss}</p>
      <hr />
      <h3>Thesis:</h3>
      <p>${thesis}</p>
      <br />
      <p><small>Generated entirely by Sentinel AI Agents.</small></p>
    `;

        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Sentinel Engine <sentinel@resend.dev>', // default resend test domain
                to: [ALERT_EMAIL],
                subject: `[SENTINEL ${confidenceScore}] ${ticker} - High Conviction Alert`,
                html: htmlBody,
            }),
        })

        const resData = await res.json()
        if (!res.ok) {
            throw new Error(`Resend API Error: ${resData.message}`)
        }

        return new Response(JSON.stringify({ success: true, id: resData.id }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error('[send-alert-email] Error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
