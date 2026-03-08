import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const CNN_API_URL = 'https://production.dataviz.cnn.io/index/fearandgreed/graphdata'

// In-memory cache (edge functions are short-lived, but helps within a single instance)
let cachedResponse: { data: any; expiresAt: number } | null = null
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface FearGreedIndicator {
  score: number
  rating: string
  timestamp: string
}

interface FearGreedResponse {
  score: number
  rating: string
  previousClose: number
  previousWeek: number
  previousMonth: number
  previousYear: number
  indicators: {
    marketMomentum: FearGreedIndicator
    stockPriceStrength: FearGreedIndicator
    stockPriceBreadth: FearGreedIndicator
    putCallOptions: FearGreedIndicator
    marketVolatility: FearGreedIndicator
    junkBondDemand: FearGreedIndicator
    safeHavenDemand: FearGreedIndicator
  }
  lastUpdated: string
}

function normalizeRating(rating: string): string {
  if (!rating) return 'Neutral'
  const r = rating.toLowerCase().trim()
  if (r.includes('extreme') && r.includes('fear')) return 'Extreme Fear'
  if (r.includes('extreme') && r.includes('greed')) return 'Extreme Greed'
  if (r.includes('fear')) return 'Fear'
  if (r.includes('greed')) return 'Greed'
  return 'Neutral'
}

function parseIndicator(obj: any): FearGreedIndicator {
  return {
    score: Number(obj?.score ?? 0),
    rating: normalizeRating(obj?.rating ?? ''),
    timestamp: obj?.timestamp ? new Date(obj.timestamp).toISOString() : new Date().toISOString(),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // JWT verification
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check in-memory cache
    if (cachedResponse && Date.now() < cachedResponse.expiresAt) {
      return new Response(JSON.stringify(cachedResponse.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch from CNN API
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    let cnnData: any
    try {
      const res = await fetch(CNN_API_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`CNN API returned ${res.status}`)
      }

      cnnData = await res.json()
    } finally {
      clearTimeout(timeout)
    }

    // Parse the response — CNN returns top-level keys for each indicator
    const fg = cnnData?.fear_and_greed
    if (!fg) {
      throw new Error('Invalid CNN API response: missing fear_and_greed')
    }

    const result: FearGreedResponse = {
      score: Number(fg.score ?? 50),
      rating: normalizeRating(fg.rating ?? 'neutral'),
      previousClose: Number(fg.previous_close ?? fg.score ?? 50),
      previousWeek: Number(fg.previous_1_week ?? fg.score ?? 50),
      previousMonth: Number(fg.previous_1_month ?? fg.score ?? 50),
      previousYear: Number(fg.previous_1_year ?? fg.score ?? 50),
      indicators: {
        marketMomentum: parseIndicator(cnnData.market_momentum_sp500),
        stockPriceStrength: parseIndicator(cnnData.stock_price_strength),
        stockPriceBreadth: parseIndicator(cnnData.stock_price_breadth),
        putCallOptions: parseIndicator(cnnData.put_call_options),
        marketVolatility: parseIndicator(cnnData.market_volatility_vix),
        junkBondDemand: parseIndicator(cnnData.junk_bond_demand),
        safeHavenDemand: parseIndicator(cnnData.safe_haven_demand),
      },
      lastUpdated: fg.timestamp ? new Date(fg.timestamp).toISOString() : new Date().toISOString(),
    }

    // Cache the result
    cachedResponse = { data: result, expiresAt: Date.now() + CACHE_TTL }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[proxy-fear-greed] Error:', msg)

    if (msg.includes('CNN API returned')) {
      return new Response(JSON.stringify({ error: 'CNN Fear & Greed API unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Internal proxy error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
