import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// BLS (Bureau of Labor Statistics) API v1 — completely free, no API key.
// Supports CPI, unemployment rate, employment, wages.
// v1 limits: 25 queries/day, 10 years of data, 25 series per query.
const BLS_URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/'

// Key BLS series IDs
const BLS_SERIES: Record<string, { id: string; name: string; unit: string }> = {
  cpi: { id: 'CUUR0000SA0', name: 'CPI-U (All Items)', unit: 'index' },
  unemployment: { id: 'LNS14000000', name: 'Unemployment Rate', unit: 'percent' },
  nonfarmPayrolls: { id: 'CES0000000001', name: 'Total Nonfarm Payrolls', unit: 'thousands' },
  avgHourlyEarnings: { id: 'CES0500000003', name: 'Avg Hourly Earnings (Private)', unit: 'dollars' },
  producerPrice: { id: 'WPSFD4', name: 'PPI - Final Demand', unit: 'index' },
}

// In-memory cache (1 hour TTL — BLS data is monthly)
let cached: { data: any; expiresAt: number } | null = null
const CACHE_TTL = 60 * 60 * 1000

interface EconomicDataPoint {
  seriesId: string;
  name: string;
  unit: string;
  latest: {
    value: number;
    year: string;
    period: string;
    periodName: string;
  };
  previous: {
    value: number;
    year: string;
    period: string;
    periodName: string;
  } | null;
  change: number | null;
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

    const seriesIds = Object.values(BLS_SERIES).map(s => s.id)

    // BLS API v1 uses POST with JSON body
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    try {
      const res = await fetch(BLS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify({
          seriesid: seriesIds,
          startyear: String(new Date().getFullYear() - 2),
          endyear: String(new Date().getFullYear()),
        }),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        throw new Error(`BLS API returned ${res.status}`)
      }

      const data = await res.json()

      if (data.status !== 'REQUEST_SUCCEEDED') {
        throw new Error(`BLS API error: ${data.message?.[0] || 'Unknown error'}`)
      }

      const indicators: EconomicDataPoint[] = []

      for (const series of data.Results?.series || []) {
        const seriesId = series.seriesID
        const meta = Object.entries(BLS_SERIES).find(([, v]) => v.id === seriesId)
        if (!meta) continue

        const [, seriesMeta] = meta
        const dataPoints = series.data || []

        // BLS returns data newest first
        const latest = dataPoints[0]
        const previous = dataPoints[1] || null

        if (latest) {
          const latestVal = parseFloat(latest.value) || 0
          const prevVal = previous ? parseFloat(previous.value) || 0 : null

          indicators.push({
            seriesId,
            name: seriesMeta.name,
            unit: seriesMeta.unit,
            latest: {
              value: latestVal,
              year: latest.year,
              period: latest.period,
              periodName: latest.periodName,
            },
            previous: previous ? {
              value: prevVal!,
              year: previous.year,
              period: previous.period,
              periodName: previous.periodName,
            } : null,
            change: prevVal !== null ? latestVal - prevVal : null,
          })
        }
      }

      const result = {
        success: true,
        data: indicators,
        source: 'bls-gov',
        lastUpdated: new Date().toISOString(),
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
    console.error('[proxy-economic] Error:', msg)

    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch economic data' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
