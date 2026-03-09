import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// FloatRates — completely free, no API key, no auth required.
// Updated daily. Returns JSON with exchange rates for 150+ currencies.
// Fallback: open.er-api.com (also free, no key)
const FLOATRATES_URL = 'https://www.floatrates.com/daily/usd.json'
const FALLBACK_URL = 'https://open.er-api.com/v6/latest/USD'

// In-memory cache (15-minute TTL — forex rates update daily on FloatRates)
let cached: { data: any; expiresAt: number } | null = null
const CACHE_TTL = 15 * 60 * 1000

// Major currency pairs we care about for trading intelligence
const MAJOR_CURRENCIES = ['eur', 'gbp', 'jpy', 'cad', 'aud', 'chf', 'cny', 'inr', 'krw', 'brl', 'mxn', 'sgd', 'hkd', 'nzd', 'sek']

interface ForexRate {
  code: string
  name: string
  rate: number
  inverseRate: number
  date: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check cache
    if (cached && Date.now() < cached.expiresAt) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      })
    }

    let rates: ForexRate[] = []
    let source = 'floatrates'

    // Primary: FloatRates
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      const res = await fetch(FLOATRATES_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (res.ok) {
        const data = await res.json()

        for (const key of MAJOR_CURRENCIES) {
          const entry = data[key]
          if (entry) {
            rates.push({
              code: entry.code || key.toUpperCase(),
              name: entry.name || key.toUpperCase(),
              rate: entry.rate ?? 0,
              inverseRate: entry.inverseRate ?? 0,
              date: entry.date || new Date().toISOString(),
            })
          }
        }
      }
    } catch (err: any) {
      clearTimeout(timeout)
      console.warn('[proxy-forex] FloatRates failed:', err.message)
    }

    // Fallback: open.er-api.com
    if (rates.length === 0) {
      source = 'open-er-api'
      const fallbackController = new AbortController()
      const fallbackTimeout = setTimeout(() => fallbackController.abort(), 10_000)

      try {
        const res = await fetch(FALLBACK_URL, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          signal: fallbackController.signal,
        })
        clearTimeout(fallbackTimeout)

        if (res.ok) {
          const data = await res.json()
          const rateMap = data?.rates || {}

          const nameMap: Record<string, string> = {
            EUR: 'Euro', GBP: 'British Pound', JPY: 'Japanese Yen',
            CAD: 'Canadian Dollar', AUD: 'Australian Dollar', CHF: 'Swiss Franc',
            CNY: 'Chinese Yuan', INR: 'Indian Rupee', KRW: 'South Korean Won',
            BRL: 'Brazilian Real', MXN: 'Mexican Peso', SGD: 'Singapore Dollar',
            HKD: 'Hong Kong Dollar', NZD: 'New Zealand Dollar', SEK: 'Swedish Krona',
          }

          for (const key of MAJOR_CURRENCIES) {
            const code = key.toUpperCase()
            const rate = rateMap[code]
            if (rate) {
              rates.push({
                code,
                name: nameMap[code] || code,
                rate,
                inverseRate: rate ? 1 / rate : 0,
                date: data.time_last_update_utc || new Date().toISOString(),
              })
            }
          }
        }
      } catch (err: any) {
        clearTimeout(fallbackTimeout)
        console.warn('[proxy-forex] Fallback API failed:', err.message)
      }
    }

    if (rates.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'All forex data sources unavailable' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Calculate DXY approximation (simplified Dollar Index)
    // DXY weights: EUR 57.6%, JPY 13.6%, GBP 11.9%, CAD 9.1%, SEK 4.2%, CHF 3.6%
    const eurRate = rates.find(r => r.code === 'EUR')?.rate || 1
    const jpyRate = rates.find(r => r.code === 'JPY')?.rate || 1
    const gbpRate = rates.find(r => r.code === 'GBP')?.rate || 1
    const cadRate = rates.find(r => r.code === 'CAD')?.rate || 1
    const sekRate = rates.find(r => r.code === 'SEK')?.rate || 1
    const chfRate = rates.find(r => r.code === 'CHF')?.rate || 1

    // DXY ≈ 50.14348112 × EUR^-0.576 × JPY^0.136 × GBP^-0.119 × CAD^0.091 × SEK^0.042 × CHF^0.036
    const dxyApprox = 50.14348112
      * Math.pow(eurRate, -0.576)
      * Math.pow(jpyRate, 0.136)
      * Math.pow(gbpRate, -0.119)
      * Math.pow(cadRate, 0.091)
      * Math.pow(sekRate, 0.042)
      * Math.pow(chfRate, 0.036)

    const result = {
      success: true,
      base: 'USD',
      rates,
      dxyApprox: Math.round(dxyApprox * 100) / 100,
      source,
      lastUpdated: new Date().toISOString(),
    }

    cached = { data: result, expiresAt: Date.now() + CACHE_TTL }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[proxy-forex] Error:', msg)

    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch forex data' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
