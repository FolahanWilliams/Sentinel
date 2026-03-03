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
        const { endpoint, ticker, tickerParam } = await req.json()
        if (!endpoint) throw new Error('Missing endpoint')
        // ticker is required for 'quote' but optional for 'news_sentiment'
        if (endpoint === 'quote' && !ticker) throw new Error('Missing ticker')

        // 3. Load Secrets
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const ALPHA_VANTAGE_KEY = Deno.env.get('MARKET_DATA_API_KEY') || Deno.env.get('ALPHA_VANTAGE_KEY') || ''
        const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')

        if (!ALPHA_VANTAGE_KEY) {
            console.warn('[proxy-market-data] No Alpha Vantage key found, will use Gemini scraping fallback')
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        console.log(`[proxy-market-data] ${endpoint} for ${ticker || 'general'}`)

        const startTime = Date.now()
        let responseData: any = null

        // 4. Route Provider
        if (endpoint === 'quote') {
            const tickerUpper = ticker.toUpperCase()
            let quoteResult: any = null

            // ── Strategy 1: Alpha Vantage GLOBAL_QUOTE (reliable JSON API) ──
            if (ALPHA_VANTAGE_KEY) {
                try {
                    const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${tickerUpper}&apikey=${ALPHA_VANTAGE_KEY}`
                    console.log(`[proxy-market-data] Trying Alpha Vantage GLOBAL_QUOTE for ${tickerUpper}`)

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
                            console.log(`[proxy-market-data] Alpha Vantage success: ${tickerUpper} @ $${quoteResult.price}`)
                        } else {
                            console.warn('[proxy-market-data] Alpha Vantage returned empty Global Quote:', JSON.stringify(avData).slice(0, 200))
                        }
                    }
                } catch (avErr) {
                    console.warn('[proxy-market-data] Alpha Vantage failed:', avErr)
                }
            }

            // ── Strategy 2: Yahoo Finance Internal JSON API (Robust Fallback) ──
            if (!quoteResult) {
                console.log(`[proxy-market-data] Alpha Vantage unavailable, falling back to Yahoo Finance JSON API`);

                try {
                    // query2 is generally more resilient to cookie checks than query1
                    const yfUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${tickerUpper}`;
                    console.log(`[proxy-market-data] Fetching JSON from ${yfUrl}`);

                    const yfRes = await fetch(yfUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'application/json'
                        }
                    });

                    if (yfRes.ok) {
                        const yfData = await yfRes.json();
                        const result = yfData?.quoteResponse?.result?.[0];

                        if (result && result.regularMarketPrice) {
                            quoteResult = {
                                price: result.regularMarketPrice || 0,
                                change: result.regularMarketChange || 0,
                                changePercent: result.regularMarketChangePercent || 0,
                                volume: result.regularMarketVolume || 0,
                                previousClose: result.regularMarketPreviousClose || 0,
                                open: result.regularMarketOpen || 0,
                                high: result.regularMarketDayHigh || 0,
                                low: result.regularMarketDayLow || 0,
                            }
                            console.log(`[proxy-market-data] Yahoo Finance success: ${tickerUpper} @ $${quoteResult.price}`);
                        } else {
                            console.warn('[proxy-market-data] Yahoo Finance returned empty or invalid result:', JSON.stringify(yfData).slice(0, 200));
                        }
                    } else {
                        console.warn(`[proxy-market-data] Yahoo Finance JSON API returned status ${yfRes.status}`);
                    }
                } catch (yfErr) {
                    console.warn('[proxy-market-data] Yahoo Finance JSON API failed:', yfErr);
                }
            }

            // Default to zeros if everything failed
            if (!quoteResult) {
                quoteResult = { price: 0, change: 0, changePercent: 0, volume: 0, previousClose: 0, open: 0, high: 0, low: 0 };
            }

            responseData = {
                success: true,
                data: {
                    ticker: tickerUpper,
                    ...quoteResult,
                    lastUpdated: new Date().toISOString()
                } as Quote
            }
        } else if (endpoint === 'news_sentiment') {
            // ── Alpha Vantage NEWS_SENTIMENT endpoint ──
            if (!ALPHA_VANTAGE_KEY) {
                throw new Error('No Alpha Vantage API key configured for news sentiment')
            }

            // Build the API URL with optional ticker/topic parameters
            const extraParams = tickerParam || '&topics=financial_markets,earnings,technology'
            const newsUrl = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT${extraParams}&apikey=${ALPHA_VANTAGE_KEY}&sort=LATEST&limit=50`
            console.log(`[proxy-market-data] Fetching AV News Sentiment`)

            const newsRes = await fetch(newsUrl)
            if (!newsRes.ok) {
                throw new Error(`Alpha Vantage NEWS_SENTIMENT returned ${newsRes.status}`)
            }

            const newsData = await newsRes.json()
            responseData = newsData  // Return the raw AV response (contains .feed array)
        } else {
            throw new Error(`Unsupported endpoint: ${endpoint}`)
        }

        const durationMs = Date.now() - startTime

        // 5. Log API Usage
        await supabaseAdmin.from('api_usage').insert({
            provider: 'alpha-vantage',
            endpoint,
            ticker,
            latency_ms: durationMs,
            success: true,
            estimated_cost_usd: 0.0001
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
