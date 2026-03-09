import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// CoinGecko free API — no key required for /simple/price on the public endpoint.
// Rate limit: ~10-30 calls/min. We cache aggressively to stay well under.
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

// Default coins to track — covers major cryptos relevant to trading intelligence
const DEFAULT_COINS = [
  'bitcoin', 'ethereum', 'solana', 'ripple', 'cardano',
  'dogecoin', 'chainlink', 'avalanche-2', 'polygon-ecosystem-token', 'litecoin',
]

// In-memory cache (2-minute TTL — CoinGecko updates every 1-5 min)
let cached: { data: any; expiresAt: number } | null = null
const CACHE_TTL = 2 * 60 * 1000

interface CoinPrice {
  id: string
  symbol: string
  price: number
  change24h: number
  marketCap: number
  volume24h: number
  lastUpdated: string
}

interface CryptoGlobal {
  totalMarketCap: number
  totalVolume24h: number
  btcDominance: number
  ethDominance: number
  activeCryptos: number
  marketCapChangePercent24h: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse optional body for custom coin list
    let coins = DEFAULT_COINS
    let includeGlobal = true
    try {
      const body = await req.json()
      if (body?.coins && Array.isArray(body.coins)) {
        coins = body.coins.slice(0, 20) // Cap at 20
      }
      if (body?.includeGlobal === false) includeGlobal = false
    } catch { /* No body or invalid JSON — use defaults */ }

    // Check cache
    const cacheKey = coins.sort().join(',')
    if (cached && Date.now() < cached.expiresAt && cached.data._cacheKey === cacheKey) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)

    try {
      // Fetch prices for all coins in one call
      const priceUrl = `${COINGECKO_BASE}/simple/price?ids=${coins.join(',')}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true&include_last_updated_at=true`

      const priceRes = await fetch(priceUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })

      if (!priceRes.ok) {
        throw new Error(`CoinGecko prices returned ${priceRes.status}`)
      }

      const priceData = await priceRes.json()

      // Map CoinGecko IDs to symbols for display
      const symbolMap: Record<string, string> = {
        'bitcoin': 'BTC', 'ethereum': 'ETH', 'solana': 'SOL',
        'ripple': 'XRP', 'cardano': 'ADA', 'dogecoin': 'DOGE',
        'chainlink': 'LINK', 'avalanche-2': 'AVAX',
        'polygon-ecosystem-token': 'POL', 'litecoin': 'LTC',
      }

      const prices: CoinPrice[] = []
      for (const [id, data] of Object.entries(priceData)) {
        const d = data as any
        prices.push({
          id,
          symbol: symbolMap[id] || id.toUpperCase(),
          price: d.usd ?? 0,
          change24h: d.usd_24h_change ?? 0,
          marketCap: d.usd_market_cap ?? 0,
          volume24h: d.usd_24h_vol ?? 0,
          lastUpdated: d.last_updated_at
            ? new Date(d.last_updated_at * 1000).toISOString()
            : new Date().toISOString(),
        })
      }

      // Sort by market cap descending
      prices.sort((a, b) => b.marketCap - a.marketCap)

      // Optionally fetch global market data
      let global: CryptoGlobal | null = null
      if (includeGlobal) {
        try {
          const globalRes = await fetch(`${COINGECKO_BASE}/global`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json',
            },
            signal: controller.signal,
          })
          if (globalRes.ok) {
            const gd = await globalRes.json()
            const g = gd?.data
            if (g) {
              global = {
                totalMarketCap: g.total_market_cap?.usd ?? 0,
                totalVolume24h: g.total_volume?.usd ?? 0,
                btcDominance: g.market_cap_percentage?.btc ?? 0,
                ethDominance: g.market_cap_percentage?.eth ?? 0,
                activeCryptos: g.active_cryptocurrencies ?? 0,
                marketCapChangePercent24h: g.market_cap_change_percentage_24h_usd ?? 0,
              }
            }
          }
        } catch {
          // Global data is optional — continue without it
        }
      }

      // Fetch crypto-specific Fear & Greed index from Alternative.me (free, no key)
      let cryptoFearGreed: { score: number; classification: string; timestamp: string } | null = null
      try {
        const fngRes = await fetch('https://api.alternative.me/fng/?limit=1&format=json', {
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        })
        if (fngRes.ok) {
          const fngData = await fngRes.json()
          const entry = fngData?.data?.[0]
          if (entry) {
            cryptoFearGreed = {
              score: parseInt(entry.value) || 50,
              classification: entry.value_classification || 'Neutral',
              timestamp: entry.timestamp
                ? new Date(parseInt(entry.timestamp) * 1000).toISOString()
                : new Date().toISOString(),
            }
          }
        }
      } catch {
        // Crypto Fear & Greed is optional
      }

      const result = {
        success: true,
        prices,
        global,
        cryptoFearGreed,
        lastUpdated: new Date().toISOString(),
        _cacheKey: cacheKey,
      }

      cached = { data: result, expiresAt: Date.now() + CACHE_TTL }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[proxy-crypto] Error:', msg)

    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch crypto data' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
