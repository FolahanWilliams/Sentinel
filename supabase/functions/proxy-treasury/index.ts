import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// U.S. Treasury Fiscal Data API — completely free, no API key required.
// https://fiscaldata.treasury.gov/api-documentation/
const TREASURY_BASE = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service'

// In-memory cache (30-minute TTL — treasury data updates daily/monthly)
let cachedRates: { data: any; expiresAt: number } | null = null
let cachedDebt: { data: any; expiresAt: number } | null = null
const CACHE_TTL = 30 * 60 * 1000

interface TreasuryRate {
  securityType: string
  securityDescription: string
  averageInterestRate: number
  recordDate: string
}

interface DebtSummary {
  totalPublicDebtOutstanding: number
  governmentAccountSeries: number
  recordDate: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    let endpoint = 'rates' // default
    try {
      const body = await req.json()
      if (body?.endpoint) endpoint = body.endpoint
    } catch { /* use defaults */ }

    if (endpoint === 'rates') {
      // Check cache
      if (cachedRates && Date.now() < cachedRates.expiresAt) {
        return new Response(JSON.stringify(cachedRates.data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12_000)

      try {
        // Fetch average interest rates on Treasury securities
        const url = `${TREASURY_BASE}/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=100&filter=security_type_desc:in:(Treasury Bills,Treasury Notes,Treasury Bonds,Treasury Inflation-Protected Securities (TIPS),Floating Rate Notes (FRN))`

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`Treasury API returned ${res.status}`)
        }

        const data = await res.json()
        const records = data?.data || []

        // Get the most recent date's records
        const latestDate = records[0]?.record_date || ''
        const latestRecords = records.filter((r: any) => r.record_date === latestDate)

        const rates: TreasuryRate[] = latestRecords.map((r: any) => ({
          securityType: r.security_type_desc || '',
          securityDescription: r.security_desc || '',
          averageInterestRate: parseFloat(r.avg_interest_rate_amt) || 0,
          recordDate: r.record_date || '',
        }))

        const result = {
          success: true,
          data: rates,
          recordDate: latestDate,
          lastUpdated: new Date().toISOString(),
        }

        cachedRates = { data: result, expiresAt: Date.now() + CACHE_TTL }

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } finally {
        clearTimeout(timeout)
      }

    } else if (endpoint === 'debt') {
      // Check cache
      if (cachedDebt && Date.now() < cachedDebt.expiresAt) {
        return new Response(JSON.stringify(cachedDebt.data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        })
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 12_000)

      try {
        // Fetch national debt data
        const url = `${TREASURY_BASE}/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=30`

        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        })

        if (!res.ok) {
          throw new Error(`Treasury debt API returned ${res.status}`)
        }

        const data = await res.json()
        const records = data?.data || []

        const debtHistory: DebtSummary[] = records.map((r: any) => ({
          totalPublicDebtOutstanding: parseFloat(r.tot_pub_debt_out_amt) || 0,
          governmentAccountSeries: parseFloat(r.govt_account_series_debt_out_amt) || 0,
          recordDate: r.record_date || '',
        }))

        const result = {
          success: true,
          data: debtHistory,
          lastUpdated: new Date().toISOString(),
        }

        cachedDebt = { data: result, expiresAt: Date.now() + CACHE_TTL }

        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } finally {
        clearTimeout(timeout)
      }

    } else {
      return new Response(JSON.stringify({ success: false, error: `Unknown endpoint: ${endpoint}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[proxy-treasury] Error:', msg)

    return new Response(JSON.stringify({ success: false, error: 'Failed to fetch treasury data' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
