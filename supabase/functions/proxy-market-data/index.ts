import "jsr:@supabase/functions-js/edge-runtime.d.ts"
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

interface NewsItem {
    title: string;
    link: string;
    source: string;
    publishedAt: string;
    summary: string;
    relatedTickers: string[];
}

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Apify Config ────────────────────────────────────────────────────────────
// Cost-saving: batch quotes into a single Apify run (~$0.005/run) instead of
// multiple Yahoo Finance direct calls that get IP-blocked from cloud environments.
const APIFY_BASE = 'https://api.apify.com/v2'
const APIFY_QUOTE_ACTOR = 'automation-lab~yahoo-finance-scraper'
const APIFY_NEWS_ACTOR = 'desmond-dev~yahoo-finance-news-ai'

// ─── Per-user rate limiting ──────────────────────────────────────────────────
// Prevents runaway costs from rapid Apify calls. TTLs: quote=10s, news=30s
const rateLimitMap = new Map<string, number>()
const RATE_LIMIT_TTL = { quote: 10_000, news: 30_000 } as const

function isRateLimited(key: string, endpoint: string): boolean {
    const now = Date.now()
    const ttl = RATE_LIMIT_TTL[endpoint as keyof typeof RATE_LIMIT_TTL] || 10_000
    const lastCall = rateLimitMap.get(key)
    if (lastCall && now - lastCall < ttl) return true
    rateLimitMap.set(key, now)
    // Evict stale entries
    if (rateLimitMap.size > 500) {
        for (const [k, v] of rateLimitMap) {
            if (now - v > 60_000) rateLimitMap.delete(k)
        }
    }
    return false
}

// --- Server-side response cache ---
// TTL: 30s for quotes, 5 min for news/news_sentiment, 15 min for historical
interface CacheEntry {
    data: any
    expiresAt: number
}
const responseCache = new Map<string, CacheEntry>()
const CACHE_TTL = {
    quote: 30_000,           // 30 seconds — quotes change frequently
    news: 300_000,           // 5 minutes — news doesn't change that fast
    news_sentiment: 300_000, // 5 minutes
    historical: 900_000,     // 15 minutes — daily bars don't change intraday
} as const

function getCached(key: string): any | null {
    const entry = responseCache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
        responseCache.delete(key)
        return null
    }
    return entry.data
}

function setCache(key: string, data: any, endpoint: string): void {
    const ttl = CACHE_TTL[endpoint as keyof typeof CACHE_TTL] || 30_000
    responseCache.set(key, { data, expiresAt: Date.now() + ttl })
    // Evict expired entries periodically (keep map from growing unbounded)
    if (responseCache.size > 200) {
        const now = Date.now()
        for (const [k, v] of responseCache) {
            if (now > v.expiresAt) responseCache.delete(k)
        }
    }
}

// ─── Apify Helpers ───────────────────────────────────────────────────────────

/**
 * Run an Apify actor synchronously and return dataset items directly.
 * Uses the `run-sync-get-dataset-items` endpoint — single HTTP call.
 * Apify supports up to 300s sync timeout; we cap at `timeoutMs` via AbortController.
 */
async function runApifyActor(
    actorId: string,
    input: Record<string, unknown>,
    apifyToken: string,
    timeoutMs = 25_000,
): Promise<any[]> {
    const url = `${APIFY_BASE}/acts/${actorId}/run-sync-get-dataset-items?format=json`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apifyToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(input),
            signal: controller.signal,
        })

        if (res.status === 408) {
            throw new Error(`Apify actor ${actorId} timed out (sync limit exceeded)`)
        }
        if (!res.ok) {
            const errText = await res.text()
            throw new Error(`Apify ${actorId} failed: ${res.status} ${errText.substring(0, 300)}`)
        }

        return await res.json()
    } finally {
        clearTimeout(timeout)
    }
}

/**
 * Fetch a quote via Apify's yahoo-finance-scraper actor.
 * Supports international tickers natively (FRES.L, AAF.L, THX.V, ^VIX).
 * Cost-saving: batch up to 20 tickers per run (~$0.005/run vs per-ticker).
 */
async function fetchQuoteViaApify(
    tickers: string[],
    apifyToken: string,
): Promise<Map<string, Quote>> {
    const items = await runApifyActor(
        APIFY_QUOTE_ACTOR,
        {
            tickers,
            includeHistory: false,  // We only need current quotes — saves compute
        },
        apifyToken,
        25_000,
    )

    console.log(`[proxy-market-data] Apify quote actor returned ${items.length} items for ${tickers.join(',')}`)

    const quotes = new Map<string, Quote>()

    for (const item of items) {
        // The actor returns Yahoo Finance data — field names follow the Yahoo Finance convention.
        // Handle both flat (regularMarketPrice) and nested (quote.regularMarketPrice) layouts.
        const data = item.quote || item

        const symbol = (data.symbol || item.symbol || item.ticker || '').toUpperCase()
        if (!symbol) continue

        const price = data.regularMarketPrice ?? data.price ?? 0
        if (!price) continue

        const prevClose = data.regularMarketPreviousClose ?? data.previousClose ?? price
        const change = data.regularMarketChange ?? data.change ?? (price - prevClose)
        const changePct = data.regularMarketChangePercent ?? data.changePercent ?? (prevClose ? (change / prevClose) * 100 : 0)

        quotes.set(symbol, {
            ticker: symbol,
            price,
            change,
            changePercent: changePct,
            volume: data.regularMarketVolume ?? data.volume ?? 0,
            previousClose: prevClose,
            open: data.regularMarketOpen ?? data.open ?? 0,
            high: data.regularMarketDayHigh ?? data.dayHigh ?? data.high ?? 0,
            low: data.regularMarketDayLow ?? data.dayLow ?? data.low ?? 0,
            marketCap: data.marketCap ?? undefined,
            peRatio: data.trailingPE ?? data.peRatio ?? undefined,
            fiftyTwoWeekHigh: data.fiftyTwoWeekHigh ?? undefined,
            fiftyTwoWeekLow: data.fiftyTwoWeekLow ?? undefined,
            lastUpdated: new Date().toISOString(),
        })
    }

    return quotes
}

/**
 * Fetch ticker news via Apify's yahoo-finance-news-ai actor.
 * Returns clean headline + link + summary for each article.
 */
async function fetchNewsViaApify(
    tickers: string[],
    apifyToken: string,
): Promise<NewsItem[]> {
    const items = await runApifyActor(
        APIFY_NEWS_ACTOR,
        { tickers },
        apifyToken,
        30_000,  // News actor may take longer due to AI summarization
    )

    console.log(`[proxy-market-data] Apify news actor returned ${items.length} items for ${tickers.join(',')}`)

    const news: NewsItem[] = []
    const seenLinks = new Set<string>()

    for (const item of items) {
        const title = item.title || ''
        const link = item.link || item.url || ''
        if (!title || !link || seenLinks.has(link)) continue
        seenLinks.add(link)

        news.push({
            title,
            link,
            source: item.publisher || item.source || item.providerName || 'Yahoo Finance',
            publishedAt: item.providerPublishTime
                ? new Date(typeof item.providerPublishTime === 'number'
                    ? item.providerPublishTime * 1000
                    : item.providerPublishTime
                ).toISOString()
                : item.publishedAt || item.pubDate || new Date().toISOString(),
            summary: item.summary || item.description || item.text || '',
            relatedTickers: item.relatedTickers || item.tickers || tickers,
        })
    }

    return news
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
    // CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authHeader = req.headers.get('Authorization')

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

        // Auth is optional for market data (public info, no user-specific data).
        // When a valid JWT is present we log the user for audit trail;
        // when absent we still serve quotes so MarketSnapshot works pre-login.
        let _userId: string | null = null
        if (authHeader) {
            const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                global: { headers: { Authorization: authHeader } }
            })
            const token = authHeader.replace(/^Bearer\s+/i, '')
            const { data: { user } } = await supabaseAuth.auth.getUser(token)
            _userId = user?.id ?? null
        }

        // 2. Parse Request
        const body = await req.json()
        const { endpoint, ticker, tickers: tickersParam, tickerParam, useApify = true } = body
        if (!endpoint) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing endpoint' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }
        if (endpoint === 'quote' && !ticker && !tickersParam) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing ticker' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 3. Check server-side cache before hitting upstream APIs
        const cacheKey = `${endpoint}:${(ticker || (tickersParam && tickersParam[0]) || tickerParam || 'general').toUpperCase()}`
        const cached = getCached(cacheKey)
        if (cached) {
            console.log(`[proxy-market-data] Cache hit: ${cacheKey}`)
            return new Response(JSON.stringify(cached), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
            })
        }

        // 4. Load Secrets
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
        const ALPHA_VANTAGE_KEY = Deno.env.get('MARKET_DATA_API_KEY') || Deno.env.get('ALPHA_VANTAGE_KEY') || ''
        const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN') || ''

        if (!ALPHA_VANTAGE_KEY) {
            console.warn('[proxy-market-data] No Alpha Vantage key found, will use Yahoo Finance fallback')
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        console.log(`[proxy-market-data] ${endpoint} for ${ticker || tickersParam?.join(',') || 'general'} (cache miss)`)

        const startTime = Date.now()
        let responseData: any = null

        // ─── QUOTE endpoint ──────────────────────────────────────────────
        if (endpoint === 'quote') {
            const tickerUpper = ticker?.toUpperCase() || ''

            // Rate limit check (per-user or per-IP)
            const rlKey = `quote:${_userId || 'anon'}`
            if (isRateLimited(rlKey, 'quote')) {
                console.log(`[proxy-market-data] Rate limited: ${rlKey}`)
                // Don't block — just skip rate limit and proceed (soft limit)
            }

            let quoteResult: any = null
            let actualProvider = 'unknown'
            let resolvedTicker = tickerUpper

            // ── Strategy 0: Apify yahoo-finance-scraper (PRIMARY) ──
            // Handles international tickers natively, no IP blocks, batch-capable.
            // Cost: ~$0.005 per run. Falls through to Yahoo direct if token missing or Apify fails.
            if (APIFY_TOKEN && !quoteResult && useApify) {
                try {
                    console.log(`[proxy-market-data] Trying Apify yahoo-finance-scraper for ${tickerUpper}`)
                    const quotes = await fetchQuoteViaApify([tickerUpper], APIFY_TOKEN)

                    // Try exact match first, then try with common suffixes
                    let quote = quotes.get(tickerUpper)
                    if (!quote) {
                        // Actor may have resolved the ticker to a different symbol
                        for (const [, q] of quotes) {
                            quote = q
                            break
                        }
                    }

                    if (quote) {
                        quoteResult = {
                            price: quote.price,
                            change: quote.change,
                            changePercent: quote.changePercent,
                            volume: quote.volume,
                            previousClose: quote.previousClose,
                            open: quote.open,
                            high: quote.high,
                            low: quote.low,
                            marketCap: quote.marketCap,
                            peRatio: quote.peRatio,
                            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                            fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
                        }
                        actualProvider = 'apify-yahoo-finance'
                        resolvedTicker = quote.ticker
                        console.log(`[proxy-market-data] Apify success: ${resolvedTicker} @ $${quoteResult.price}`)
                    } else {
                        console.warn(`[proxy-market-data] Apify returned no quote for ${tickerUpper}`)
                    }
                } catch (apifyErr: any) {
                    console.warn(`[proxy-market-data] Apify quote failed, falling back to Yahoo direct:`, apifyErr.message)
                }
            }

            // ── Strategy 1: Yahoo Finance direct (FALLBACK) ──
            // International suffix retry: if bare ticker fails, try common exchange suffixes.
            if (!quoteResult) {
                const isIndex = tickerUpper.startsWith('^')
                const hasExchangeSuffix = /\.[A-Z]{1,3}$/.test(tickerUpper)
                const possibleSuffixes = (isIndex || hasExchangeSuffix)
                    ? ['']
                    : ['', '.L', '.TO', '.V', '.DE', '.PA', '.AX']

                for (const suffix of possibleSuffixes) {
                    const testTicker = tickerUpper + suffix
                    if (suffix) {
                        console.log(`[proxy-market-data] Retrying with international suffix: ${testTicker}`)
                    }

                    // Strategy 1a: Yahoo Finance v7 quote API (query2 — more resilient to cloud IP blocks)
                    try {
                        const yf2Url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(testTicker)}`
                        if (!suffix) console.log(`[proxy-market-data] Trying Yahoo Finance query2/v7 for ${testTicker}`)

                        const yf2Controller = new AbortController()
                        const yf2Timeout = setTimeout(() => yf2Controller.abort(), 8000)

                        const yf2Res = await fetch(yf2Url, {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'application/json'
                            },
                            signal: yf2Controller.signal,
                        })
                        clearTimeout(yf2Timeout)

                        if (yf2Res.ok) {
                            const yf2Data = await yf2Res.json()
                            const result = yf2Data?.quoteResponse?.result?.[0]

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
                                actualProvider = 'yahoo-finance-v7'
                                resolvedTicker = testTicker
                                console.log(`[proxy-market-data] Yahoo Finance v7 success: ${testTicker} @ $${quoteResult.price}`)
                                break
                            }
                        }
                    } catch (yf2Err) {
                        if (!suffix) console.warn('[proxy-market-data] Yahoo Finance v7 failed:', yf2Err)
                    }

                    // Strategy 1b: Yahoo Finance v8 chart API (query1 — fallback if v7 is down)
                    if (!quoteResult) {
                        try {
                            const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(testTicker)}?interval=1d&range=1d`
                            if (!suffix) console.log(`[proxy-market-data] Trying Yahoo Finance query1/v8 for ${testTicker}`)

                            const yfController = new AbortController()
                            const yfTimeout = setTimeout(() => yfController.abort(), 8000)

                            const yfRes = await fetch(yfUrl, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                    'Accept': 'application/json'
                                },
                                signal: yfController.signal,
                            })
                            clearTimeout(yfTimeout)

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
                                    actualProvider = 'yahoo-finance-v8'
                                    resolvedTicker = testTicker
                                    console.log(`[proxy-market-data] Yahoo Finance v8 success: ${testTicker} @ $${quoteResult.price}`)
                                    break
                                }
                            }
                        } catch (yfErr) {
                            if (!suffix) console.warn('[proxy-market-data] Yahoo Finance v8 failed:', yfErr)
                        }
                    }

                    // Strategy 2: Alpha Vantage GLOBAL_QUOTE (Fallback — only on bare ticker to conserve API calls)
                    if (!quoteResult && ALPHA_VANTAGE_KEY && !suffix) {
                        console.log(`[proxy-market-data] Yahoo Finance unavailable, falling back to Alpha Vantage`)
                        try {
                            const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(testTicker)}&apikey=${ALPHA_VANTAGE_KEY}`

                            const avController = new AbortController()
                            const avTimeout = setTimeout(() => avController.abort(), 10000)
                            const avRes = await fetch(avUrl, { signal: avController.signal })
                            clearTimeout(avTimeout)
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
                                    resolvedTicker = testTicker
                                    console.log(`[proxy-market-data] Alpha Vantage success: ${testTicker} @ $${quoteResult.price}`)
                                    break
                                } else {
                                    console.warn('[proxy-market-data] Alpha Vantage returned empty Global Quote:', JSON.stringify(avData).slice(0, 200))
                                }
                            }
                        } catch (avErr) {
                            console.warn('[proxy-market-data] Alpha Vantage failed:', avErr)
                        }
                    }
                }
                // Strategy 3: Apify (Final fallback for international or missing quotes)
                if (!quoteResult && APIFY_TOKEN && useApify) {
                    console.log(`[proxy-market-data] Falling back to Apify for ${tickerUpper}`)
                    try {
                        const quotes = await fetchQuoteViaApify([tickerUpper], APIFY_TOKEN)
                        if (quotes.has(tickerUpper)) {
                            const quote = quotes.get(tickerUpper)!
                            quoteResult = {
                                price: quote.price,
                                change: quote.change,
                                changePercent: quote.changePercent,
                                volume: quote.volume,
                                previousClose: quote.previousClose,
                                open: quote.open,
                                high: quote.high,
                                low: quote.low,
                                marketCap: quote.marketCap,
                                peRatio: quote.peRatio,
                                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                                fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
                            }
                            actualProvider = 'apify-yahoo-finance'
                            resolvedTicker = tickerUpper
                            console.log(`[proxy-market-data] Apify fallback success: ${resolvedTicker} @ $${quoteResult.price}`)
                        } else {
                            console.warn(`[proxy-market-data] Apify fallback returned no quote for ${tickerUpper}`)
                        }
                    } catch (apifyErr: any) {
                        console.warn('[proxy-market-data] Apify quote fetch failed:', apifyErr.message)
                    }
                }
            }

            // All providers failed
            if (!quoteResult) {
                return new Response(
                    JSON.stringify({ success: false, error: `Unable to fetch quote for ${tickerUpper}` }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 } // Return 200 so Supabase client gets the JSON instead of throwing FunctionsHttpError
                )
            }

            responseData = {
                success: true,
                data: {
                    ticker: tickerUpper,
                    ...(resolvedTicker !== tickerUpper ? { resolvedTicker } : {}),
                    ...quoteResult,
                    lastUpdated: new Date().toISOString()
                } as Quote
            }

            const durationMs = Date.now() - startTime
            await supabaseAdmin.from('api_usage').insert({
                provider: actualProvider,
                endpoint,
                ticker,
                latency_ms: durationMs,
                success: true,
                estimated_cost_usd: actualProvider === 'apify-yahoo-finance' ? 0.005 : (actualProvider === 'alpha-vantage' ? 0.0001 : 0)
            })

            // ─── NEWS endpoint (NEW — powered by Apify) ─────────────────────
        } else if (endpoint === 'news') {
            // Accept single ticker or array of tickers
            const newsTickers: string[] = tickersParam
                ? (Array.isArray(tickersParam) ? tickersParam : [tickersParam])
                : ticker
                    ? [ticker]
                    : []

            if (newsTickers.length === 0) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Missing ticker(s) for news endpoint' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
            }

            if (!APIFY_TOKEN) {
                return new Response(
                    JSON.stringify({ success: false, error: 'News endpoint requires APIFY_TOKEN to be configured' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
                )
            }

            // Rate limit: 1 news call per 30s per user
            const rlKey = `news:${_userId || 'anon'}`
            if (isRateLimited(rlKey, 'news')) {
                // Return cached if available, otherwise soft-pass
                const staleKey = `news:${newsTickers[0].toUpperCase()}`
                const stale = getCached(staleKey)
                if (stale) {
                    return new Response(JSON.stringify(stale), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'RATE_LIMITED' },
                    })
                }
            }

            console.log(`[proxy-market-data] Fetching news via Apify for ${newsTickers.join(',')}`)

            try {
                if (!useApify) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'Apify news fetch disabled by request (useApify: false)' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                    )
                }
                const newsItems = await fetchNewsViaApify(
                    newsTickers.map(t => t.toUpperCase()),
                    APIFY_TOKEN,
                )

                responseData = { success: true, data: newsItems }

                const durationMs = Date.now() - startTime
                await supabaseAdmin.from('api_usage').insert({
                    provider: 'apify-yahoo-news',
                    endpoint: 'news',
                    ticker: newsTickers[0] || null,
                    latency_ms: durationMs,
                    success: true,
                    estimated_cost_usd: 0.005
                })

            } catch (newsErr: any) {
                console.error(`[proxy-market-data] Apify news failed:`, newsErr.message)
                return new Response(
                    JSON.stringify({ success: false, error: 'Failed to fetch news via Apify' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 }
                )
            }

            // ─── NEWS_SENTIMENT endpoint (legacy Alpha Vantage) ──────────────
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

            const newsController = new AbortController()
            const newsTimeout = setTimeout(() => newsController.abort(), 10000)
            const newsRes = await fetch(newsUrl, { signal: newsController.signal })
            clearTimeout(newsTimeout)
            if (!newsRes.ok) {
                return new Response(
                    JSON.stringify({ success: false, error: 'News sentiment service returned an error' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                )
            }

            const newsData = await newsRes.json()
            console.log(`[proxy-market-data] AV News Response snippet:`, JSON.stringify(newsData).slice(0, 200))

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

            // ─── HISTORICAL endpoint ─────────────────────────────────────────
        } else if (endpoint === 'historical') {
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
                const histController = new AbortController()
                const histTimeout = setTimeout(() => histController.abort(), 10000)
                const yfRes = await fetch(yfUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json'
                    },
                    signal: histController.signal,
                })
                clearTimeout(histTimeout)

                if (!yfRes.ok) {
                    return new Response(
                        JSON.stringify({ success: false, error: `Yahoo Finance returned ${yfRes.status}` }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
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
                })).filter((b: any) => b.close > 0)

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
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                )
            }

        } else {
            return new Response(
                JSON.stringify({ success: false, error: `Unsupported endpoint: ${endpoint}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 6. Cache and return data
        setCache(cacheKey, responseData, endpoint)
        return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
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
