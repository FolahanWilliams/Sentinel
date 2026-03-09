import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Macro market overview — fetches indices, commodities, bonds, and VIX
// via Yahoo Finance (free, no API key). All are public ticker symbols.

const MACRO_TICKERS: Record<string, { ticker: string; name: string; category: string }> = {
  // Major indices
  'SP500':    { ticker: '^GSPC',  name: 'S&P 500',          category: 'index' },
  'NASDAQ':   { ticker: '^IXIC',  name: 'NASDAQ Composite',  category: 'index' },
  'DOW':      { ticker: '^DJI',   name: 'Dow Jones',         category: 'index' },
  'RUSSELL':  { ticker: '^RUT',   name: 'Russell 2000',      category: 'index' },
  'VIX':      { ticker: '^VIX',   name: 'CBOE Volatility',   category: 'volatility' },

  // Commodities
  'GOLD':     { ticker: 'GC=F',   name: 'Gold',              category: 'commodity' },
  'SILVER':   { ticker: 'SI=F',   name: 'Silver',            category: 'commodity' },
  'OIL':      { ticker: 'CL=F',   name: 'Crude Oil WTI',     category: 'commodity' },
  'NATGAS':   { ticker: 'NG=F',   name: 'Natural Gas',       category: 'commodity' },
  'COPPER':   { ticker: 'HG=F',   name: 'Copper',            category: 'commodity' },

  // Bonds / Yields
  'US10Y':    { ticker: '^TNX',   name: '10-Year Treasury',  category: 'bond' },
  'US2Y':     { ticker: '^IRX',   name: '13-Week T-Bill',    category: 'bond' },
  'US30Y':    { ticker: '^TYX',   name: '30-Year Treasury',  category: 'bond' },

  // Global indices
  'FTSE':     { ticker: '^FTSE',  name: 'FTSE 100',          category: 'global' },
  'NIKKEI':   { ticker: '^N225',  name: 'Nikkei 225',        category: 'global' },
  'DAX':      { ticker: '^GDAXI', name: 'DAX',               category: 'global' },

  // Sector ETFs (market breadth)
  'XLK':      { ticker: 'XLK',   name: 'Tech Sector',        category: 'sector' },
  'XLF':      { ticker: 'XLF',   name: 'Financial Sector',   category: 'sector' },
  'XLE':      { ticker: 'XLE',   name: 'Energy Sector',      category: 'sector' },
  'XLV':      { ticker: 'XLV',   name: 'Healthcare Sector',  category: 'sector' },
  'XLI':      { ticker: 'XLI',   name: 'Industrial Sector',  category: 'sector' },
  'XLRE':     { ticker: 'XLRE',  name: 'Real Estate Sector', category: 'sector' },
  'XLP':      { ticker: 'XLP',   name: 'Consumer Staples',   category: 'sector' },
  'XLY':      { ticker: 'XLY',   name: 'Consumer Discretionary', category: 'sector' },
}

// In-memory cache (2-minute TTL)
let cached: { key: string; data: any; expiresAt: number } | null = null
const CACHE_TTL = 2 * 60 * 1000

interface MacroQuote {
  key: string
  ticker: string
  name: string
  category: string
  price: number
  change: number
  changePercent: number
  lastUpdated: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Optional: filter by category
    let categories: string[] | null = null
    try {
      const body = await req.json()
      if (body?.categories && Array.isArray(body.categories)) {
        categories = body.categories
      }
    } catch { /* use all categories */ }

    // Filter tickers by requested categories
    const entries = Object.entries(MACRO_TICKERS).filter(([, v]) =>
      !categories || categories.includes(v.category)
    )
    const tickers = entries.map(([, v]) => v.ticker)
    const cacheKey = tickers.join(',')

    // Check cache
    if (cached && cached.key === cacheKey && Date.now() < cached.expiresAt) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      })
    }

    // Fetch all tickers in a single Yahoo Finance V7 batch call
    const symbols = tickers.join(',')
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        throw new Error(`Yahoo Finance returned ${res.status}`)
      }

      const data = await res.json()
      const results = data?.quoteResponse?.result || []

      // Build a lookup from ticker → Yahoo result
      const yahooMap = new Map<string, any>()
      for (const r of results) {
        if (r.symbol) yahooMap.set(r.symbol, r)
      }

      const quotes: MacroQuote[] = []
      for (const [key, meta] of entries) {
        const r = yahooMap.get(meta.ticker)
        if (!r) continue

        quotes.push({
          key,
          ticker: meta.ticker,
          name: meta.name,
          category: meta.category,
          price: r.regularMarketPrice ?? 0,
          change: r.regularMarketChange ?? 0,
          changePercent: r.regularMarketChangePercent ?? 0,
          lastUpdated: new Date().toISOString(),
        })
      }

      // Group by category for easy consumption
      const grouped: Record<string, MacroQuote[]> = {}
      for (const q of quotes) {
        if (!grouped[q.category]) grouped[q.category] = []
        grouped[q.category].push(q)
      }

      const result = {
        success: true,
        quotes,
        grouped,
        count: quotes.length,
        lastUpdated: new Date().toISOString(),
      }

      cached = { key: cacheKey, data: result, expiresAt: Date.now() + CACHE_TTL }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[proxy-macro] Error:', msg)

    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch macro data' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
