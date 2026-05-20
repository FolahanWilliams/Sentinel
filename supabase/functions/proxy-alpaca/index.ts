/**
 * Sentinel — Alpaca Paper Trading Proxy
 *
 * Server-side proxy for Alpaca Markets paper-trading API. Keeps the
 * APCA-API-KEY-ID / APCA-API-SECRET-KEY out of the client bundle.
 *
 * Required env (set as Supabase secrets):
 *   ALPACA_API_KEY      — paper-trading key id
 *   ALPACA_SECRET_KEY   — paper-trading secret
 *   SUPABASE_URL        — auto-injected
 *   SUPABASE_ANON_KEY   — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected (for api_usage logging)
 *
 * Actions:
 *   { action: 'account' }
 *   { action: 'submit_order', payload: { ticker, shares, side, limit_price, target_price?, stop_loss? } }
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALPACA_API_ENDPOINT = 'https://paper-api.alpaca.markets/v2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Per-user rate limiting (10 requests / min) ─────────────────────────────
const rateLimitMap = new Map<string, number[]>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10

function checkRateLimit(userId: string): boolean {
    const now = Date.now()
    const calls = (rateLimitMap.get(userId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS)
    if (calls.length >= RATE_LIMIT_MAX) {
        rateLimitMap.set(userId, calls)
        return false
    }
    calls.push(now)
    rateLimitMap.set(userId, calls)
    if (rateLimitMap.size > 500) {
        for (const [k, v] of rateLimitMap) {
            if (v.every(t => now - t > RATE_LIMIT_WINDOW_MS)) rateLimitMap.delete(k)
        }
    }
    return true
}

// ─── Input validation ───────────────────────────────────────────────────────
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/
const MAX_SHARES = 10_000
const MAX_PRICE = 1_000_000

interface OrderPayload {
    ticker: string
    shares: number
    side: 'buy' | 'sell'
    limit_price: number
    target_price?: number | null
    stop_loss?: number | null
}

function validateOrder(p: any): { ok: true; order: OrderPayload } | { ok: false; error: string } {
    if (!p || typeof p !== 'object') return { ok: false, error: 'Missing order payload' }

    const ticker = String(p.ticker || '').toUpperCase().trim()
    if (!TICKER_RE.test(ticker)) return { ok: false, error: 'Invalid ticker format' }

    const shares = Number(p.shares)
    if (!Number.isFinite(shares) || shares <= 0 || shares > MAX_SHARES || !Number.isInteger(shares)) {
        return { ok: false, error: `shares must be an integer between 1 and ${MAX_SHARES}` }
    }

    const side = p.side
    if (side !== 'buy' && side !== 'sell') return { ok: false, error: 'side must be "buy" or "sell"' }

    const limit_price = Number(p.limit_price)
    if (!Number.isFinite(limit_price) || limit_price <= 0 || limit_price > MAX_PRICE) {
        return { ok: false, error: 'limit_price must be > 0' }
    }

    const target_price = p.target_price == null ? null : Number(p.target_price)
    if (target_price != null && (!Number.isFinite(target_price) || target_price <= 0 || target_price > MAX_PRICE)) {
        return { ok: false, error: 'target_price must be > 0 when provided' }
    }

    const stop_loss = p.stop_loss == null ? null : Number(p.stop_loss)
    if (stop_loss != null && (!Number.isFinite(stop_loss) || stop_loss <= 0 || stop_loss > MAX_PRICE)) {
        return { ok: false, error: 'stop_loss must be > 0 when provided' }
    }

    // Directional sanity checks (long: tp > entry > sl; short: tp < entry < sl)
    if (side === 'buy') {
        if (target_price != null && target_price <= limit_price) {
            return { ok: false, error: 'target_price must be above limit_price for buy orders' }
        }
        if (stop_loss != null && stop_loss >= limit_price) {
            return { ok: false, error: 'stop_loss must be below limit_price for buy orders' }
        }
    } else {
        if (target_price != null && target_price >= limit_price) {
            return { ok: false, error: 'target_price must be below limit_price for sell orders' }
        }
        if (stop_loss != null && stop_loss <= limit_price) {
            return { ok: false, error: 'stop_loss must be above limit_price for sell orders' }
        }
    }

    return { ok: true, order: { ticker, shares, side, limit_price, target_price, stop_loss } }
}

// ─── Alpaca API helpers ─────────────────────────────────────────────────────

function alpacaHeaders(): Record<string, string> {
    const apiKey = Deno.env.get('ALPACA_API_KEY') || ''
    const secretKey = Deno.env.get('ALPACA_SECRET_KEY') || ''
    return {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
    }
}

async function callAlpaca(path: string, init: RequestInit = {}): Promise<{ status: number; body: any }> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    try {
        const res = await fetch(`${ALPACA_API_ENDPOINT}${path}`, {
            ...init,
            headers: { ...alpacaHeaders(), ...(init.headers || {}) },
            signal: controller.signal,
        })
        const text = await res.text()
        let body: any
        try { body = text ? JSON.parse(text) : {} } catch { body = { raw: text } }
        return { status: res.status, body }
    } finally {
        clearTimeout(timer)
    }
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        // 1. JWT auth (required — privileged action)
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing Authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        })
        const token = authHeader.replace(/^Bearer\s+/i, '')
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Rate limit
        if (!checkRateLimit(user.id)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Rate limit exceeded' }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Retry-After': '60' } }
            )
        }

        // 3. Secret presence check
        if (!Deno.env.get('ALPACA_API_KEY') || !Deno.env.get('ALPACA_SECRET_KEY')) {
            console.error('[proxy-alpaca] Missing ALPACA_API_KEY / ALPACA_SECRET_KEY secrets')
            return new Response(
                JSON.stringify({ success: false, error: 'Trading not configured' }),
                { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 4. Parse + dispatch
        const body = await req.json().catch(() => ({}))
        const action = body?.action

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        const startMs = Date.now()

        if (action === 'account') {
            const { status, body: data } = await callAlpaca('/account', { method: 'GET' })
            const ok = status >= 200 && status < 300

            await supabaseAdmin.from('api_usage').insert({
                provider: 'alpaca-paper',
                endpoint: 'account',
                ticker: null,
                latency_ms: Date.now() - startMs,
                success: ok,
                estimated_cost_usd: 0,
            }).select()

            if (!ok) {
                console.warn(`[proxy-alpaca] account fetch failed (${status})`)
                return new Response(
                    JSON.stringify({ success: false, error: 'Alpaca account fetch failed' }),
                    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            return new Response(
                JSON.stringify({ success: true, data }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (action === 'submit_order') {
            const validation = validateOrder(body?.payload)
            if (!validation.ok) {
                return new Response(
                    JSON.stringify({ success: false, error: validation.error }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            const o = validation.order
            const alpacaPayload: Record<string, unknown> = {
                symbol: o.ticker,
                qty: o.shares,
                side: o.side,
                type: 'limit',
                time_in_force: 'gtc',
                limit_price: Number(o.limit_price.toFixed(2)),
                extended_hours: false,
            }

            if (o.target_price != null || o.stop_loss != null) {
                alpacaPayload.order_class = 'bracket'
                if (o.target_price != null) {
                    alpacaPayload.take_profit = { limit_price: Number(o.target_price.toFixed(2)) }
                }
                if (o.stop_loss != null) {
                    alpacaPayload.stop_loss = { stop_price: Number(o.stop_loss.toFixed(2)) }
                }
            }

            const { status, body: data } = await callAlpaca('/orders', {
                method: 'POST',
                body: JSON.stringify(alpacaPayload),
            })
            const ok = status >= 200 && status < 300

            await supabaseAdmin.from('api_usage').insert({
                provider: 'alpaca-paper',
                endpoint: 'submit_order',
                ticker: o.ticker,
                latency_ms: Date.now() - startMs,
                success: ok,
                estimated_cost_usd: 0,
            }).select()

            if (!ok) {
                console.warn(`[proxy-alpaca] order rejected (${status}) for ${o.ticker}`)
                return new Response(
                    JSON.stringify({ success: false, error: 'Order rejected by Alpaca' }),
                    { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }

            console.log(`[proxy-alpaca] Routed ${alpacaPayload.order_class || 'simple'} order for ${o.shares}x ${o.ticker}`)
            return new Response(
                JSON.stringify({ success: true, data }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        return new Response(
            JSON.stringify({ success: false, error: `Unsupported action: ${action}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (err: any) {
        console.error('[proxy-alpaca] Internal error:', err?.message)
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
