// Sentinel — Index Rebalance discovery
//
// Uses grounded search (via the internal proxy-gemini function) to find recently
// announced index additions/removals for the major US indices, with effective
// dates, and upserts them into `index_rebalance_events`. Scheduled daily by
// pg_cron (see 20261016000000_index_rebalance_watch.sql); also invocable on demand.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RawEvent {
  ticker?: string
  company_name?: string
  index_name?: string
  action?: string
  announcement_date?: string
  effective_date?: string
  source_url?: string
  rationale?: string
}

function isISODate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const today = new Date().toISOString().split('T')[0]

    const prompt = `Search the web for recently ANNOUNCED changes to major US stock index membership — additions and removals — for the Nasdaq-100, S&P 500, S&P MidCap 400, and S&P SmallCap 600. Include both scheduled quarterly/annual reconstitutions and ad-hoc changes (e.g. a company added to replace one acquired or delisted).

Only include changes whose EFFECTIVE DATE is within the last 10 days or the next 45 days (today is ${today}). For each, give the exact ticker symbol, company name, the index, whether it is an "add" or "remove", the announcement date and effective date (YYYY-MM-DD), a source URL, and a one-line rationale.

Return ONLY this JSON, no markdown:
{"events":[{"ticker":"NBIS","company_name":"Nebius Group","index_name":"NASDAQ-100","action":"add","announcement_date":"2026-06-13","effective_date":"2026-06-22","source_url":"https://...","rationale":"special rebalance addition"}]}
If you find no grounded changes, return {"events":[]}.`

    // Grounded-search discovery via the internal proxy-gemini function.
    let raw: RawEvent[] = []
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/proxy-gemini`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({
          prompt,
          systemInstruction: 'You are a markets data extractor. Return ONLY valid JSON. Only include index changes you can ground in a real, current source — never invent tickers or dates.',
          requireGroundedSearch: true,
          temperature: 0.1,
          skipMasterPrompt: true,
        }),
      })
      if (res.ok) {
        const body = await res.json()
        const text = typeof body?.data === 'string' ? body.data : (body?.text ?? JSON.stringify(body?.data ?? ''))
        const m = text.match(/\{[\s\S]*"events"[\s\S]*\}/)
        if (m) {
          const parsed = JSON.parse(m[0])
          if (Array.isArray(parsed?.events)) raw = parsed.events
        }
      } else {
        console.warn(`[index-rebalance] proxy-gemini returned ${res.status}`)
      }
    } catch (e) {
      console.warn('[index-rebalance] discovery failed:', (e as Error).message)
    }

    // Validate + normalize. Drop anything without a clean ticker, index, and
    // effective date so we never persist a hallucinated row.
    const seen = new Set<string>()
    const rows = raw
      .map((e) => ({
        ticker: (e.ticker || '').toUpperCase().trim(),
        company_name: e.company_name?.trim() || null,
        index_name: (e.index_name || '').toUpperCase().replace('NASDAQ 100', 'NASDAQ-100').trim(),
        action: e.action === 'remove' ? 'remove' : 'add',
        announcement_date: isISODate(e.announcement_date) ? e.announcement_date : null,
        effective_date: isISODate(e.effective_date) ? e.effective_date : null,
        source_url: e.source_url?.trim() || null,
        rationale: e.rationale?.trim() || null,
        status: 'upcoming',
      }))
      .filter((r) => {
        if (!r.ticker || !/^[A-Z][A-Z.\-]{0,7}$/.test(r.ticker) || !r.index_name || !r.effective_date) return false
        const key = `${r.ticker}|${r.index_name}|${r.effective_date}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    let upserted = 0
    if (rows.length > 0) {
      const { error } = await supabase
        .from('index_rebalance_events')
        .upsert(rows, { onConflict: 'ticker,index_name,effective_date', ignoreDuplicates: false })
      if (error) console.error('[index-rebalance] upsert error:', error.message)
      else upserted = rows.length
    }

    // Roll statuses forward (best-effort; ignore errors).
    await supabase.from('index_rebalance_events').update({ status: 'passed' }).lt('effective_date', today).neq('status', 'passed')
    await supabase.from('index_rebalance_events').update({ status: 'effective' }).eq('effective_date', today)

    return new Response(JSON.stringify({ success: true, discovered: raw.length, upserted }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[index-rebalance] Error:', msg)
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
