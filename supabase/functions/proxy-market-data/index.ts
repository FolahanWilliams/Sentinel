import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Interface shared with the client
interface Quote {
    ticker: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    previousClose: number;
    open: number;
    high: number;
    low: number;
    marketCap?: number;
    peRatio?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    lastUpdated: string;
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Verify Auth
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Missing Authorization header')
        }

        // 2. Parse Request
        const { endpoint, ticker, timeframe = 'day', limit = 100 } = await req.json()
        if (!endpoint) throw new Error('Missing endpoint')

        // 3. Load Secrets from the secure Edge Function environment
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

        // Choose between Polygon or AlphaVantage based on provider secret
        const PROVIDER = Deno.env.get('MARKET_DATA_PROVIDER') || 'polygon'
        const API_KEY = Deno.env.get('MARKET_DATA_API_KEY')

        if (!API_KEY) throw new Error('MARKET_DATA_API_KEY secret is not set')

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        console.log(`[proxy-market-data] ${endpoint} for ${ticker} via ${PROVIDER}`)

        const startTime = Date.now()
        let rawData: any = null
        let responseData: any = null

        // 4. Route Provider
        if (PROVIDER === 'polygon') {
            if (endpoint === 'quote') {
                // e.g. https://api.polygon.io/v2/aggs/ticker/AAPL/prev?adjusted=true&apiKey=YOUR_API_KEY
                if (!ticker) throw new Error('Missing ticker')
                const tickerUpper = ticker.toUpperCase()

                const res = await fetch(`https://api.polygon.io/v2/aggs/ticker/${tickerUpper}/prev?adjusted=true&apiKey=${API_KEY}`)
                if (!res.ok) throw new Error(`Polygon API Error: ${res.status}`)

                rawData = await res.json()

                if (rawData.results && rawData.results.length > 0) {
                    const r = rawData.results[0]
                    // Polygon's prev day aggs: c = close, o = open, h = high, l = low, v = volume
                    // We return a simplified stub mapped to our Quote type.
                    responseData = {
                        success: true,
                        data: {
                            ticker: tickerUpper,
                            price: r.c,
                            change: r.c - r.o,
                            changePercent: ((r.c - r.o) / r.o) * 100,
                            volume: r.v,
                            previousClose: r.c, // Stub mapping 
                            open: r.o,
                            high: r.h,
                            low: r.l,
                            lastUpdated: new Date().toISOString()
                        } as Quote
                    }
                } else {
                    throw new Error(`Polygon API Error: No data for ${tickerUpper}`)
                }
            }
            else {
                throw new Error(`Unsupported endpoint: ${endpoint} for provider ${PROVIDER}`)
            }

        } else if (PROVIDER === 'alphavantage') {
            if (endpoint === 'quote') {
                // https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=demo
                if (!ticker) throw new Error('Missing ticker')
                const tickerUpper = ticker.toUpperCase()

                const res = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${tickerUpper}&apikey=${API_KEY}`)
                if (!res.ok) throw new Error(`AlphaVantage API Error: ${res.status}`)

                rawData = await res.json()

                const q = rawData['Global Quote']
                if (q && q['05. price']) {
                    responseData = {
                        success: true,
                        data: {
                            ticker: tickerUpper,
                            price: parseFloat(q['05. price']),
                            change: parseFloat(q['09. change']),
                            changePercent: parseFloat(q['10. change percent'].replace('%', '')),
                            volume: parseInt(q['06. volume'], 10),
                            previousClose: parseFloat(q['08. previous close']),
                            open: parseFloat(q['02. open']),
                            high: parseFloat(q['03. high']),
                            low: parseFloat(q['04. low']),
                            lastUpdated: new Date().toISOString()
                        } as Quote
                    }
                } else {
                    throw new Error(`AlphaVantage API Error: Rate limit or invalid ticker ${tickerUpper}`)
                }
            }
            // Add other endpoints (bars, technicals) here later
            else {
                throw new Error(`Unsupported endpoint: ${endpoint} for provider ${PROVIDER}`)
            }
        } else {
            throw new Error(`Unknown MARKET_DATA_PROVIDER config: ${PROVIDER}`)
        }

        const durationMs = Date.now() - startTime

        // 5. Log API Usage (for tracking costs/rate limits)
        // Bypassing RLS using Service Role Key
        await supabaseAdmin.from('api_usage').insert({
            provider: PROVIDER,
            endpoint,
            ticker,
            latency_ms: durationMs,
            success: true,
            // Very rough estimate cost
            estimated_cost_usd: PROVIDER === 'polygon' ? 0.0001 : 0.005
        })

        // 6. Return Data
        return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error(`[proxy-market-data] Error:`, error.message)
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
