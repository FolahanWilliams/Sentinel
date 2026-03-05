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
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing Authorization header' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

        // This creates a client with the user's JWT
        const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        })

        // Check if the user is authenticated *if* the gateway let them through but we want to be sure
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token)
        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized', authError: authError?.message }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        // 2. Parse Request
        const { endpoint, ticker, tickerParam } = await req.json()
        if (!endpoint) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing endpoint' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }
        if (endpoint === 'quote' && !ticker) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing ticker' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 3. Load Secrets
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const ALPHA_VANTAGE_KEY = Deno.env.get('MARKET_DATA_API_KEY') || Deno.env.get('ALPHA_VANTAGE_KEY') || ''

        if (!ALPHA_VANTAGE_KEY) {
            console.warn('[proxy-market-data] No Alpha Vantage key found, will use Yahoo Finance fallback')
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        console.log(`[proxy-market-data] ${endpoint} for ${ticker || 'general'}`)

        const startTime = Date.now()
        let responseData: any = null

        // 4. Route Provider
        if (endpoint === 'quote') {
            const tickerUpper = ticker.toUpperCase()
            let quoteResult: any = null
            let actualProvider = 'unknown'

            // Strategy 1: Yahoo Finance JSON API (Primary)
            try {
                const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerUpper)}?interval=1d&range=1d`
                console.log(`[proxy-market-data] Trying Yahoo Finance for ${tickerUpper}`)

                const yfRes = await fetch(yfUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                })

                if (yfRes.ok) {
                    const yfData = await yfRes.json()
                    const meta = yfData?.chart?.result?.[0]?.meta

                    if (meta && meta.regularMarketPrice) {
                        const change = meta.regularMarketPrice - (meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice)
                        const prevClose = meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice || 1
                        const changePct = (change / prevClose) * 100

                        quoteResult = {
                            price: meta.regularMarketPrice || 0,
                            change: change,
                            changePercent: changePct,
                            volume: meta.regularMarketVolume || 0,
                            previousClose: prevClose,
                            open: meta.regularMarketPrice || 0,
                            high: meta.regularMarketDayHigh || 0,
                            low: meta.regularMarketDayLow || 0,
                        }
                        actualProvider = 'yahoo-finance'
                        console.log(`[proxy-market-data] Yahoo Finance success: ${tickerUpper} @ $${quoteResult.price}`)
                    } else {
                        console.warn('[proxy-market-data] Yahoo Finance returned empty or invalid result:', JSON.stringify(yfData).slice(0, 200))
                    }
                } else {
                    console.warn(`[proxy-market-data] Yahoo Finance returned status ${yfRes.status}`)
                }
            } catch (yfErr) {
                console.warn('[proxy-market-data] Yahoo Finance failed:', yfErr)
            }

            // Strategy 2: Alpha Vantage GLOBAL_QUOTE (Fallback)
            if (!quoteResult && ALPHA_VANTAGE_KEY) {
                console.log(`[proxy-market-data] Yahoo Finance unavailable, falling back to Alpha Vantage`)
                try {
                    const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(tickerUpper)}&apikey=${ALPHA_VANTAGE_KEY}`

                    const avRes = await fetch(avUrl)
                    if (avRes.ok) {
                        const avData = await avRes.json()
                        const gq = avData['Global Quote']

                        if (gq && gq['05. price']) {
                            quoteResult = {
                                price: parseFloat(gq['05. price']) || 0,
                                change: parseFloat(gq['09. change']) || 0,
                                changePercent: parseFloat((gq['10. change percent'] || '').replace('%', '')) || 0,
                                volume: parseInt(gq['06. volume']) || 0,
                                previousClose: parseFloat(gq['08. previous close']) || 0,
                                open: parseFloat(gq['02. open']) || 0,
                                high: parseFloat(gq['03. high']) || 0,
                                low: parseFloat(gq['04. low']) || 0,
                            }
                            actualProvider = 'alpha-vantage'
                            console.log(`[proxy-market-data] Alpha Vantage success: ${tickerUpper} @ $${quoteResult.price}`)
                        } else {
                            console.warn('[proxy-market-data] Alpha Vantage returned empty Global Quote:', JSON.stringify(avData).slice(0, 200))
                        }
                    }
                } catch (avErr) {
                    console.warn('[proxy-market-data] Alpha Vantage failed:', avErr)
                }
            }

            // Phase 2 fix (Audit M12): Return success: false when all providers fail
            if (!quoteResult) {
                return new Response(
                    JSON.stringify({ success: false, error: `Unable to fetch quote for ${tickerUpper}` }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
                )
            }

            responseData = {
                success: true,
                data: {
                    ticker: tickerUpper,
                    ...quoteResult,
                    lastUpdated: new Date().toISOString()
                } as Quote
            }

            const durationMs = Date.now() - startTime

            // 5. Phase 2 fix (Audit M10): Log actual provider, not hardcoded 'alpha-vantage'
            await supabaseAdmin.from('api_usage').insert({
                provider: actualProvider,
                endpoint,
                ticker,
                latency_ms: durationMs,
                success: true,
                estimated_cost_usd: actualProvider === 'alpha-vantage' ? 0.0001 : 0
            })

        } else if (endpoint === 'news_sentiment') {
            if (!ALPHA_VANTAGE_KEY) {
                return new Response(
                    JSON.stringify({ success: false, error: 'No Alpha Vantage API key configured for news sentiment' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
                )
            }

            // Phase 2 fix (Audit m15): Validate tickerParam — only allow &tickers= parameter
            let extraParams = '&topics=financial_markets,earnings,technology'
            if (tickerParam && typeof tickerParam === 'string') {
                // Only allow alphanumeric ticker references, strip anything else
                const sanitized = tickerParam.replace(/[^a-zA-Z0-9,&=_]/g, '')
                if (sanitized.startsWith('&tickers=')) {
                    extraParams = sanitized
                }
            }

            const newsUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT${extraParams}&apikey=${ALPHA_VANTAGE_KEY}&sort=LATEST&limit=50`
            console.log(`[proxy-market-data] Fetching AV News Sentiment`)

            const newsRes = await fetch(newsUrl)
            if (!newsRes.ok) {
                return new Response(
                    JSON.stringify({ success: false, error: 'News sentiment service returned an error' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
                )
            }

            const newsData = await newsRes.json()
            console.log(`[proxy-market-data] AV News Response snippet:`, JSON.stringify(newsData).slice(0, 200))

            // Phase 2 fix (Audit M11): Wrap in consistent response format
            responseData = { success: true, data: newsData }

            const durationMs = Date.now() - startTime
            await supabaseAdmin.from('api_usage').insert({
                provider: 'alpha-vantage',
                endpoint,
                ticker: ticker || null,
                latency_ms: durationMs,
                success: true,
                estimated_cost_usd: 0.0001
            })
        } else if (endpoint === 'historical') {
            // Historical OHLCV bars for technical analysis (Yahoo Finance chart API)
            if (!ticker) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Missing ticker for historical endpoint' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
            }

            const tickerUpper = ticker.toUpperCase()
            console.log(`[proxy-market-data] Fetching historical bars for ${tickerUpper}`)

            try {
                const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(tickerUpper)}?range=1y&interval=1d`
                const yfRes = await fetch(yfUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    }
                })

                if (!yfRes.ok) {
                    return new Response(
                        JSON.stringify({ success: false, error: `Yahoo Finance returned ${yfRes.status}` }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
                    )
                }

                const yfData = await yfRes.json()
                const result = yfData?.chart?.result?.[0]
                const timestamps = result?.timestamp || []
                const quote = result?.indicators?.quote?.[0] || {}

                const bars = timestamps.map((ts: number, i: number) => ({
                    date: new Date(ts * 1000).toISOString().split('T')[0],
                    open: quote.open?.[i] ?? 0,
                    high: quote.high?.[i] ?? 0,
                    low: quote.low?.[i] ?? 0,
                    close: quote.close?.[i] ?? 0,
                    volume: quote.volume?.[i] ?? 0,
                })).filter((b: any) => b.close > 0) // Filter out null/zero bars

                console.log(`[proxy-market-data] Historical: ${tickerUpper} — ${bars.length} bars`)
                responseData = { success: true, data: bars }

                const durationMs = Date.now() - startTime
                await supabaseAdmin.from('api_usage').insert({
                    provider: 'yahoo-finance',
                    endpoint: 'historical',
                    ticker: tickerUpper,
                    latency_ms: durationMs,
                    success: true,
                    estimated_cost_usd: 0
                })

            } catch (histErr: any) {
                console.error('[proxy-market-data] Historical fetch failed:', histErr.message)
                return new Response(
                    JSON.stringify({ success: false, error: 'Failed to fetch historical data' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
                )
            }

        } else {
            return new Response(
                JSON.stringify({ success: false, error: `Unsupported endpoint: ${endpoint}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 6. Return Data
        return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error(`[proxy-market-data] Error:`, error.message)
        // Phase 2 fix (Audit m18): Don't leak internal error details
        return new Response(
            JSON.stringify({ success: false, error: 'Internal server error' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
