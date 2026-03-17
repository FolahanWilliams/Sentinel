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
    pegRatio?: number;
    debtToEquity?: number;
    roe?: number;
    freeCashFlow?: number;
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

// ─── Per-user rate limiting ──────────────────────────────────────────────────
// Prevents excessive API calls. TTLs: quote=10s, news=30s
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

// ─── Yahoo Finance Helpers (free, no API key required) ──────────────────────

/**
 * Yahoo crumb/cookie auth — required for V7 quote API from server IPs.
 * Mimics the approach used by the Python yfinance library.
 * Cached in-memory since crumbs are valid for ~30 minutes.
 */
let _yahooCrumb: { crumb: string; cookie: string; expiresAt: number } | null = null

async function getYahooCrumbAndCookie(): Promise<{ crumb: string; cookie: string }> {
    if (_yahooCrumb && Date.now() < _yahooCrumb.expiresAt) {
        return { crumb: _yahooCrumb.crumb, cookie: _yahooCrumb.cookie }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
        // Step 1: Hit Yahoo Finance to get a session cookie
        const initRes = await fetch('https://fc.yahoo.com/curated', {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
            redirect: 'manual',
            signal: controller.signal,
        })
        // fc.yahoo.com returns 404 but sets the A3 cookie we need
        const setCookieHeaders = initRes.headers.getSetCookie?.() || []
        let cookie = ''
        for (const sc of setCookieHeaders) {
            const match = sc.match(/^([^;]+)/)
            if (match) cookie += (cookie ? '; ' : '') + match[1]
        }

        if (!cookie) {
            // Fallback: try getting cookie from finance.yahoo.com
            const fallbackRes = await fetch('https://finance.yahoo.com/', {
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                },
                redirect: 'follow',
                signal: controller.signal,
            })
            const fb = fallbackRes.headers.getSetCookie?.() || []
            for (const sc of fb) {
                const match = sc.match(/^([^;]+)/)
                if (match) cookie += (cookie ? '; ' : '') + match[1]
            }
            // Consume body
            await fallbackRes.text().catch(() => {})
        }

        // Step 2: Use the cookie to get a crumb
        const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Cookie': cookie,
            },
            signal: controller.signal,
        })

        if (!crumbRes.ok) {
            throw new Error(`Crumb fetch failed: ${crumbRes.status}`)
        }

        const crumb = await crumbRes.text()
        if (!crumb || crumb.length > 50) {
            throw new Error('Invalid crumb response')
        }

        _yahooCrumb = { crumb, cookie, expiresAt: Date.now() + 20 * 60 * 1000 } // Cache 20min
        console.log(`[proxy-market-data] Yahoo crumb obtained successfully`)
        return { crumb, cookie }
    } finally {
        clearTimeout(timeout)
    }
}

/**
 * Fetch quotes for multiple tickers in a single Yahoo V7 API call.
 * Uses crumb/cookie auth to avoid IP blocking.
 * This is the same approach used by the Python yfinance library.
 */
async function fetchQuotesBatchYahoo(tickers: string[]): Promise<Map<string, Quote>> {
    const quotes = new Map<string, Quote>()

    // Try with crumb/cookie auth first
    try {
        const { crumb, cookie } = await getYahooCrumbAndCookie()
        const symbols = tickers.join(',')
        const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&crumb=${encodeURIComponent(crumb)}`

        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 12_000)

        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                    'Cookie': cookie,
                },
                signal: controller.signal,
            })
            clearTimeout(timeout)

            if (res.ok) {
                const data = await res.json()
                const results = data?.quoteResponse?.result || []
                console.log(`[proxy-market-data] Yahoo V7 batch returned ${results.length} results for ${tickers.length} tickers`)

                for (const result of results) {
                    if (!result.symbol || !result.regularMarketPrice) continue

                    const symbol = result.symbol.toUpperCase()
                    quotes.set(symbol, {
                        ticker: symbol,
                        price: result.regularMarketPrice,
                        change: result.regularMarketChange ?? 0,
                        changePercent: result.regularMarketChangePercent ?? 0,
                        volume: result.regularMarketVolume ?? 0,
                        previousClose: result.regularMarketPreviousClose ?? result.regularMarketPrice,
                        open: result.regularMarketOpen ?? 0,
                        high: result.regularMarketDayHigh ?? 0,
                        low: result.regularMarketDayLow ?? 0,
                        marketCap: result.marketCap ?? undefined,
                        peRatio: result.trailingPE ?? undefined,
                        pegRatio: result.pegRatio ?? result.trailingPegRatio ?? undefined,
                        debtToEquity: result.debtToEquity ?? undefined,
                        roe: result.returnOnEquity ?? undefined,
                        freeCashFlow: result.freeCashflow ?? undefined,
                        fiftyTwoWeekHigh: result.fiftyTwoWeekHigh ?? undefined,
                        fiftyTwoWeekLow: result.fiftyTwoWeekLow ?? undefined,
                        lastUpdated: new Date().toISOString(),
                    })
                }
            } else {
                console.warn(`[proxy-market-data] Yahoo V7 batch returned ${res.status}, invalidating crumb`)
                _yahooCrumb = null // Force crumb refresh on next call
            }
        } finally {
            clearTimeout(timeout)
        }
    } catch (err: any) {
        console.warn(`[proxy-market-data] Yahoo V7 batch with crumb failed:`, err.message)
        _yahooCrumb = null
    }

    // Fallback: try without crumb (works for some server IPs)
    if (quotes.size === 0) {
        try {
            const symbols = tickers.join(',')
            const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`

            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 10_000)

            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                },
                signal: controller.signal,
            })
            clearTimeout(timeout)

            if (res.ok) {
                const data = await res.json()
                const results = data?.quoteResponse?.result || []
                console.log(`[proxy-market-data] Yahoo V7 batch (no crumb) returned ${results.length} results`)

                for (const result of results) {
                    if (!result.symbol || !result.regularMarketPrice) continue

                    const symbol = result.symbol.toUpperCase()
                    quotes.set(symbol, {
                        ticker: symbol,
                        price: result.regularMarketPrice,
                        change: result.regularMarketChange ?? 0,
                        changePercent: result.regularMarketChangePercent ?? 0,
                        volume: result.regularMarketVolume ?? 0,
                        previousClose: result.regularMarketPreviousClose ?? result.regularMarketPrice,
                        open: result.regularMarketOpen ?? 0,
                        high: result.regularMarketDayHigh ?? 0,
                        low: result.regularMarketDayLow ?? 0,
                        lastUpdated: new Date().toISOString(),
                    })
                }
            }
        } catch (err: any) {
            console.warn(`[proxy-market-data] Yahoo V7 batch (no crumb) failed:`, err.message)
        }
    }

    return quotes
}

/**
 * Fetch ticker news via Yahoo Finance RSS feeds (free, no API key needed).
 * Returns headlines from Yahoo's RSS feed for each ticker.
 */
async function fetchNewsViaYahooRSS(tickers: string[]): Promise<NewsItem[]> {
    const news: NewsItem[] = []
    const seenLinks = new Set<string>()

    for (const ticker of tickers.slice(0, 5)) { // Cap at 5 tickers
        try {
            const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 8_000)

            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/xml, text/xml',
                },
                signal: controller.signal,
            })
            clearTimeout(timeout)

            if (!res.ok) continue

            const xml = await res.text()

            // Simple XML parsing — extract <item> elements
            const itemRegex = /<item>([\s\S]*?)<\/item>/g
            let match
            while ((match = itemRegex.exec(xml)) !== null) {
                const itemXml = match[1]
                const title = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1]
                    || itemXml.match(/<title>(.*?)<\/title>/)?.[1] || ''
                const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || ''
                const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || ''
                const description = itemXml.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/)?.[1]
                    || itemXml.match(/<description>(.*?)<\/description>/)?.[1] || ''

                if (!title || !link || seenLinks.has(link)) continue
                seenLinks.add(link)

                news.push({
                    title,
                    link,
                    source: 'Yahoo Finance',
                    publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                    summary: description.replace(/<[^>]*>/g, '').substring(0, 500),
                    relatedTickers: [ticker],
                })
            }
        } catch (err: any) {
            console.warn(`[proxy-market-data] Yahoo RSS failed for ${ticker}:`, err.message)
        }
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
        const { endpoint, ticker, tickers: tickersParam, tickerParam } = body
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
        const cacheKey = `${endpoint}:${(ticker || (tickersParam && tickersParam.sort().join(',')) || tickerParam || 'general').toUpperCase()}`
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
        const TIINGO_KEY = Deno.env.get('TIINGO_API_KEY') || ''

        if (!ALPHA_VANTAGE_KEY) {
            console.warn('[proxy-market-data] No Alpha Vantage key found, will use Yahoo Finance fallback')
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        console.log(`[proxy-market-data] ${endpoint} for ${ticker || tickersParam?.join(',') || 'general'} (cache miss)`)

        const startTime = Date.now()
        let responseData: any = null

        // ─── BULK QUOTE endpoint ─────────────────────────────────────────
        // Accepts an array of tickers, returns all quotes in a single response.
        // Reduces N edge-function invocations to 1 from the client.
        if (endpoint === 'bulk_quote') {
            const bulkTickers: string[] = (tickersParam || [])
                .map((t: string) => (t || '').toUpperCase())
                .filter((t: string) => t.length > 0)
                .slice(0, 30) // cap at 30 to prevent abuse

            if (bulkTickers.length === 0) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Missing tickers array for bulk_quote' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
            }

            // Check per-ticker cache, collect misses
            const results: Record<string, any> = {}
            const cacheMisses: string[] = []

            for (const t of bulkTickers) {
                const ck = `quote:${t}`
                const hit = getCached(ck)
                if (hit) {
                    results[t] = hit.data || hit
                } else {
                    cacheMisses.push(t)
                }
            }

            console.log(`[proxy-market-data] bulk_quote: ${bulkTickers.length} requested, ${cacheMisses.length} cache misses`)

            // Fetch all misses in a single Yahoo Finance batch call (free, no API key)
            if (cacheMisses.length > 0) {
                try {
                    const quotes = await fetchQuotesBatchYahoo(cacheMisses)

                    for (const t of cacheMisses) {
                        // Try exact match, then any key that starts with the base ticker
                        let quote = quotes.get(t)
                        if (!quote) {
                            for (const [resolvedKey, q] of quotes) {
                                if (resolvedKey.startsWith(t.replace(/\.[A-Z]+$/, ''))) {
                                    quote = q
                                    break
                                }
                            }
                        }
                        if (quote) {
                            const quoteData = {
                                ticker: t,
                                ...(quote.ticker !== t ? { resolvedTicker: quote.ticker } : {}),
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
                                pegRatio: quote.pegRatio,
                                debtToEquity: quote.debtToEquity,
                                roe: quote.roe,
                                freeCashFlow: quote.freeCashFlow,
                                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                                fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
                                lastUpdated: new Date().toISOString(),
                            }
                            results[t] = quoteData
                            setCache(`quote:${t}`, { success: true, data: quoteData }, 'quote')
                        }
                    }
                } catch (batchErr: any) {
                    console.warn(`[proxy-market-data] Yahoo batch quote failed, falling back to sequential:`, batchErr.message)
                }
            }

            // For any remaining misses, try Yahoo direct sequentially
            const stillMissing = cacheMisses.filter(t => !results[t])
            for (const t of stillMissing) {
                try {
                    const suffixes = /\.[A-Z]{1,3}$/.test(t) || t.startsWith('^')
                        ? ['']
                        : ['', '.L', '.TO', '.V', '.DE', '.PA', '.AX']

                    for (const suffix of suffixes) {
                        const testTicker = t + suffix
                        try {
                            const yf2Url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(testTicker)}`
                            const yf2Controller = new AbortController()
                            const yf2Timeout = setTimeout(() => yf2Controller.abort(), 8000)
                            const yf2Res = await fetch(yf2Url, {
                                headers: {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                    'Accept': 'application/json'
                                },
                                signal: yf2Controller.signal,
                            })
                            clearTimeout(yf2Timeout)
                            if (yf2Res.ok) {
                                const yf2Data = await yf2Res.json()
                                const result = yf2Data?.quoteResponse?.result?.[0]
                                if (result && result.regularMarketPrice) {
                                    const quoteData = {
                                        ticker: t,
                                        ...(testTicker !== t ? { resolvedTicker: testTicker } : {}),
                                        price: result.regularMarketPrice || 0,
                                        change: result.regularMarketChange || 0,
                                        changePercent: result.regularMarketChangePercent || 0,
                                        volume: result.regularMarketVolume || 0,
                                        previousClose: result.regularMarketPreviousClose || 0,
                                        open: result.regularMarketOpen || 0,
                                        high: result.regularMarketDayHigh || 0,
                                        low: result.regularMarketDayLow || 0,
                                        lastUpdated: new Date().toISOString(),
                                    }
                                    results[t] = quoteData
                                    setCache(`quote:${t}`, { success: true, data: quoteData }, 'quote')
                                    break
                                }
                            }
                        } catch { /* try next suffix */ }
                    }
                } catch { /* skip this ticker */ }
            }

            responseData = { success: true, data: results }

            const durationMs = Date.now() - startTime
            await supabaseAdmin.from('api_usage').insert({
                provider: 'yahoo-finance-v7',
                endpoint: 'bulk_quote',
                ticker: bulkTickers.join(',').substring(0, 50),
                latency_ms: durationMs,
                success: true,
                estimated_cost_usd: 0
            })

        // ─── QUOTE endpoint (single ticker) ─────────────────────────────
        } else if (endpoint === 'quote') {
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

            // ── Strategy 0: Yahoo Finance V7 batch with crumb/cookie auth (PRIMARY) ──
            // Uses the same approach as Python's yfinance library. Free, no API key.
            if (!quoteResult) {
                try {
                    console.log(`[proxy-market-data] Trying Yahoo V7 batch with crumb for ${tickerUpper}`)
                    const quotes = await fetchQuotesBatchYahoo([tickerUpper])

                    let quote = quotes.get(tickerUpper)
                    if (!quote) {
                        // May have resolved to a different symbol
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
                            pegRatio: quote.pegRatio,
                            debtToEquity: quote.debtToEquity,
                            roe: quote.roe,
                            freeCashFlow: quote.freeCashFlow,
                            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                            fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
                        }
                        actualProvider = 'yahoo-finance-v7-crumb'
                        resolvedTicker = quote.ticker
                        console.log(`[proxy-market-data] Yahoo V7 crumb success: ${resolvedTicker} @ $${quoteResult.price}`)
                    } else {
                        console.warn(`[proxy-market-data] Yahoo V7 crumb returned no quote for ${tickerUpper}`)
                    }
                } catch (crumbErr: any) {
                    console.warn(`[proxy-market-data] Yahoo V7 crumb quote failed, falling back to direct:`, crumbErr.message)
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
                // Strategy 3: Yahoo V7 batch with crumb (final fallback)
                if (!quoteResult) {
                    console.log(`[proxy-market-data] Falling back to Yahoo V7 batch for ${tickerUpper}`)
                    try {
                        const quotes = await fetchQuotesBatchYahoo([tickerUpper])
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
                                pegRatio: quote.pegRatio,
                                debtToEquity: quote.debtToEquity,
                                roe: quote.roe,
                                freeCashFlow: quote.freeCashFlow,
                                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                                fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
                            }
                            actualProvider = 'yahoo-finance-v7'
                            resolvedTicker = tickerUpper
                            console.log(`[proxy-market-data] Yahoo V7 fallback success: ${resolvedTicker} @ $${quoteResult.price}`)
                        } else {
                            console.warn(`[proxy-market-data] Yahoo V7 fallback returned no quote for ${tickerUpper}`)
                        }
                    } catch (yahooErr: any) {
                        console.warn('[proxy-market-data] Yahoo V7 quote fetch failed:', yahooErr.message)
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
                estimated_cost_usd: actualProvider === 'alpha-vantage' ? 0.0001 : 0
            })

            // ─── NEWS endpoint (Yahoo RSS — free) ─────────────────────────
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

            console.log(`[proxy-market-data] Fetching news via Yahoo RSS for ${newsTickers.join(',')}`)

            try {
                const newsItems = await fetchNewsViaYahooRSS(
                    newsTickers.map(t => t.toUpperCase()),
                )

                responseData = { success: true, data: newsItems }

                const durationMs = Date.now() - startTime
                await supabaseAdmin.from('api_usage').insert({
                    provider: 'yahoo-finance-rss',
                    endpoint: 'news',
                    ticker: newsTickers[0] || null,
                    latency_ms: durationMs,
                    success: true,
                    estimated_cost_usd: 0
                })

            } catch (newsErr: any) {
                console.error(`[proxy-market-data] Yahoo RSS news failed:`, newsErr.message)
                return new Response(
                    JSON.stringify({ success: false, error: 'Failed to fetch news via Yahoo RSS' }),
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

            const MIN_BARS = 50

            // International exchange suffixes to try when bare US ticker fails
            const EXCHANGE_SUFFIXES = ['.TO', '.V', '.L', '.AX', '.DE', '.PA', '.MI', '.HK', '.SI', '.NS']
            let resolvedTicker = tickerUpper // may get updated with suffix

            // Helper: fetch with timeout
            async function fetchWithTimeout(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
                const ctrl = new AbortController()
                const timer = setTimeout(() => ctrl.abort(), timeoutMs)
                try {
                    const res = await fetch(url, { headers, signal: ctrl.signal })
                    return res
                } finally {
                    clearTimeout(timer)
                }
            }

            // Source 1: Yahoo Finance (free, no key) — tries international suffixes if bare ticker fails
            async function fetchYahoo(): Promise<{ bars: any[]; provider: string } | null> {
                const yfHeaders = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                }

                async function tryYahooTicker(t: string): Promise<any[] | null> {
                    try {
                        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t)}?range=2y&interval=1d`
                        const res = await fetchWithTimeout(url, yfHeaders, 10000)
                        if (!res.ok) return null
                        const data = await res.json()
                        const result = data?.chart?.result?.[0]
                        const timestamps = result?.timestamp || []
                        const quote = result?.indicators?.quote?.[0] || {}
                        return timestamps.map((ts: number, i: number) => ({
                            date: new Date(ts * 1000).toISOString().split('T')[0],
                            open: quote.open?.[i] ?? 0,
                            high: quote.high?.[i] ?? 0,
                            low: quote.low?.[i] ?? 0,
                            close: quote.close?.[i] ?? 0,
                            volume: quote.volume?.[i] ?? 0,
                        })).filter((b: any) => b.close > 0)
                    } catch { return null }
                }

                // Try bare ticker first (US exchanges)
                const bars = await tryYahooTicker(tickerUpper)
                if (bars && bars.length >= MIN_BARS) {
                    console.log(`[historical] Yahoo: ${tickerUpper} — ${bars.length} bars`)
                    return { bars, provider: 'yahoo-finance' }
                }

                // If bare ticker has no dot (not already exchange-qualified), try international suffixes
                if (!tickerUpper.includes('.')) {
                    console.log(`[historical] Yahoo: ${tickerUpper} returned ${bars?.length ?? 0} bars, trying international exchanges...`)
                    for (const suffix of EXCHANGE_SUFFIXES) {
                        const intlTicker = tickerUpper + suffix
                        const intlBars = await tryYahooTicker(intlTicker)
                        if (intlBars && intlBars.length >= MIN_BARS) {
                            console.log(`[historical] Yahoo: found ${intlTicker} — ${intlBars.length} bars`)
                            resolvedTicker = intlTicker
                            return { bars: intlBars, provider: 'yahoo-finance' }
                        }
                    }
                }

                console.warn(`[historical] Yahoo: no data for ${tickerUpper} (including international)`)
                return null
            }

            // Source 2: Alpha Vantage TIME_SERIES_DAILY (free key)
            async function fetchAlphaVantage(): Promise<{ bars: any[]; provider: string } | null> {
                if (!ALPHA_VANTAGE_KEY) return null
                try {
                    // Alpha Vantage uses .TRT for Toronto, .LON for London etc. — try bare ticker + resolvedTicker
                    const avSymbol = resolvedTicker !== tickerUpper ? resolvedTicker : tickerUpper
                    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(avSymbol)}&outputsize=full&apikey=${ALPHA_VANTAGE_KEY}`
                    const res = await fetchWithTimeout(url, { 'Accept': 'application/json' }, 12000)
                    const data = await res.json()
                    const timeSeries = data?.['Time Series (Daily)']
                    if (!timeSeries || Object.keys(timeSeries).length === 0) {
                        console.warn('[historical] Alpha Vantage: no time series data')
                        return null
                    }
                    const bars = Object.entries(timeSeries)
                        .map(([dateStr, vals]: [string, any]) => ({
                            date: dateStr,
                            open: parseFloat(vals['1. open']) || 0,
                            high: parseFloat(vals['2. high']) || 0,
                            low: parseFloat(vals['3. low']) || 0,
                            close: parseFloat(vals['4. close']) || 0,
                            volume: parseInt(vals['5. volume'], 10) || 0,
                        }))
                        .filter((b: any) => b.close > 0)
                        .sort((a: any, b: any) => a.date.localeCompare(b.date))
                        .slice(-504) // ~2 years of trading days
                    console.log(`[historical] Alpha Vantage: ${tickerUpper} — ${bars.length} bars`)
                    return bars.length >= MIN_BARS ? { bars, provider: 'alpha-vantage' } : null
                } catch (err: any) {
                    console.warn(`[historical] Alpha Vantage failed: ${err.message}`)
                    return null
                }
            }

            // Source 3: Tiingo (free key, 1000 req/day)
            async function fetchTiingo(): Promise<{ bars: any[]; provider: string } | null> {
                if (!TIINGO_KEY) return null
                try {
                    const twoYearsAgo = new Date(Date.now() - 730 * 86400000).toISOString().split('T')[0]
                    const url = `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(tickerUpper)}/prices?startDate=${twoYearsAgo}&token=${TIINGO_KEY}`
                    const res = await fetchWithTimeout(url, {
                        'Content-Type': 'application/json',
                        'Authorization': `Token ${TIINGO_KEY}`,
                    }, 12000)
                    if (!res.ok) { console.warn(`[historical] Tiingo returned ${res.status}`); return null }
                    const data = await res.json()
                    if (!Array.isArray(data) || data.length === 0) {
                        console.warn('[historical] Tiingo: empty response')
                        return null
                    }
                    const bars = data.map((d: any) => ({
                        date: (d.date || '').split('T')[0],
                        open: d.adjOpen ?? d.open ?? 0,
                        high: d.adjHigh ?? d.high ?? 0,
                        low: d.adjLow ?? d.low ?? 0,
                        close: d.adjClose ?? d.close ?? 0,
                        volume: d.adjVolume ?? d.volume ?? 0,
                    })).filter((b: any) => b.close > 0 && b.date)
                    console.log(`[historical] Tiingo: ${tickerUpper} — ${bars.length} bars`)
                    return bars.length >= MIN_BARS ? { bars, provider: 'tiingo' } : null
                } catch (err: any) {
                    console.warn(`[historical] Tiingo failed: ${err.message}`)
                    return null
                }
            }

            // Waterfall: Yahoo → Alpha Vantage → Tiingo
            const sources = [fetchYahoo, fetchAlphaVantage, fetchTiingo]
            let histResult: { bars: any[]; provider: string } | null = null

            for (const fetchFn of sources) {
                histResult = await fetchFn()
                if (histResult) break
            }

            if (histResult) {
                responseData = { success: true, data: histResult.bars }
                const durationMs = Date.now() - startTime
                await supabaseAdmin.from('api_usage').insert({
                    provider: histResult.provider,
                    endpoint: 'historical',
                    ticker: tickerUpper,
                    latency_ms: durationMs,
                    success: true,
                    estimated_cost_usd: histResult.provider === 'yahoo-finance' ? 0 : 0.0001,
                })
            } else {
                return new Response(
                    JSON.stringify({ success: false, error: 'Failed to fetch historical data from all sources' }),
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
