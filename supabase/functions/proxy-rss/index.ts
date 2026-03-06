import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Phase 1 fix (Audit C2): URL allowlist to prevent SSRF
const ALLOWED_DOMAINS = new Set([
  'www.cnbc.com', 'search.cnbc.com', 'finance.yahoo.com', 'seekingalpha.com',
  'www.federalreserve.gov', 'www.sec.gov', 'efts.sec.gov', 'techcrunch.com',
  'hnrss.org', 'www.techmeme.com', 'venturebeat.com',
  'export.arxiv.org', 'news.crunchbase.com', 'www.coindesk.com',
  'krebsonsecurity.com', 'feeds.feedburner.com', 'www.theverge.com',
  'feeds.arstechnica.com', 'www.technologyreview.com', 'www.engadget.com',
  'a16z.com', 'www.ycombinator.com', 'stratechery.com',
  'www.semianalysis.com', 'feed.infoq.com', 'cointelegraph.com',
  'rss.politico.com', 'www.cbinsights.com', 'www.darkreading.com',
  'www.fiercepharma.com',
  'feeds.bloomberg.com', 'feeds.marketwatch.com', 'feeds.a.dj.com', 'www.ft.com',
  'www.wired.com', 'siliconangle.com',
  'www.statnews.com', 'www.fiercebiotech.com', 'www.biopharmadive.com', 'endpts.com',
  'www.tomshardware.com', 'www.eetimes.com',
  'www.securityweek.com', 'www.pymnts.com',
  'www.calculatedriskblog.com', 'wolfstreet.com',
  'www.fool.com',
  'www.earningswhispers.com', 'www.nasdaq.com'
])

function isAllowedUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    return ALLOWED_DOMAINS.has(url.hostname)
  } catch {
    return false
  }
}

/**
 * Fetch an RSS feed directly, falling back to an intermediary proxy
 * (allorigins) if the direct fetch fails (e.g. datacenter IP block).
 */
async function fetchWithFallback(feedUrl: string): Promise<string> {
  // Attempt 1: Direct fetch
  try {
    const xmlText = await directFetch(feedUrl)
    if (xmlText) return xmlText
  } catch {
    // Fall through to fallback
  }

  // Attempt 2: allorigins proxy (routes through different IPs)
  console.log(`[proxy-rss] Direct fetch failed, trying allorigins fallback for: ${feedUrl}`)
  try {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)
    try {
      const res = await fetch(proxyUrl, {
        headers: { 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
        signal: controller.signal,
      })
      if (res.ok) {
        const text = await res.text()
        if (text && (text.includes('<rss') || text.includes('<feed') || text.includes('<entry') || text.includes('<item'))) {
          console.log(`[proxy-rss] allorigins fallback succeeded for: ${feedUrl}`)
          return text
        }
      }
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    // Fall through
  }

  throw new Error(`All fetch methods failed for ${feedUrl}`)
}

async function directFetch(feedUrl: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      signal: controller.signal,
    })
    if (!response.ok) {
      console.warn(`[proxy-rss] Direct fetch returned ${response.status} for ${feedUrl}`)
      return null
    }
    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Phase 1 fix (Audit C3): Add real JWT verification
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
      global: { headers: { Authorization: authHeader || '' } }
    })
    const token = (authHeader || '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', authError: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const feedUrl = body?.feedUrl || body?.url

    if (!feedUrl) {
      return new Response(JSON.stringify({ error: 'Missing feedUrl parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Phase 1 fix (Audit C2): Validate URL against allowlist
    if (!isAllowedUrl(feedUrl)) {
      return new Response(JSON.stringify({ error: 'URL not in allowed domains' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[proxy-rss] Fetching: ${feedUrl}`)

    // Try direct fetch first, then fall back to intermediary proxy if blocked
    const xmlText = await fetchWithFallback(feedUrl)

    return new Response(xmlText, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
      },
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // Distinguish upstream failures from internal proxy errors
    if (msg.includes('All fetch methods failed')) {
      console.warn(`[proxy-rss] ${msg}`)
      return new Response(JSON.stringify({ error: 'All fetch methods failed for this feed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    console.error('[proxy-rss] Error:', error)
    // Phase 2 fix (Audit m18): Don't leak internal error details
    return new Response(JSON.stringify({ error: 'Internal proxy error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
