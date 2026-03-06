import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Reddit OAuth Token Cache ────────────────────────────────────────────────
// Persists across invocations within the same Deno isolate (~5min on Supabase).
let cachedToken: string | null = null
let tokenExpiresAt = 0

/**
 * Obtain a Reddit OAuth token using the client_credentials grant.
 * This is a "script" / "application-only" flow — no user login needed.
 * Datacenter IPs are explicitly allowed by Reddit for OAuth API access.
 */
async function getRedditToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken
  }

  const clientId = Deno.env.get('REDDIT_CLIENT_ID') || ''
  const clientSecret = Deno.env.get('REDDIT_CLIENT_SECRET') || ''

  if (!clientId || !clientSecret) {
    throw new Error('REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET must be set')
  }

  const basicAuth = btoa(`${clientId}:${clientSecret}`)

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Sentinel/1.0 (by /u/SentinelTrading)',
    },
    body: 'grant_type=client_credentials',
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Reddit token request failed: ${res.status} ${text}`)
  }

  const data = await res.json()
  cachedToken = data.access_token
  // Expire 60s early to avoid edge-case failures
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000

  console.log('[proxy-reddit] OAuth token acquired successfully')
  return cachedToken!
}

// ─── Allowed subreddits (SSRF prevention) ────────────────────────────────────
const ALLOWED_SUBREDDITS = new Set([
  'wallstreetbets', 'stocks', 'investing', 'options',
  'stockmarket', 'pennystocks', 'SecurityAnalysis',
  'ValueInvesting', 'Daytrading', 'thetagang',
])

// ─── Allowed sort modes ──────────────────────────────────────────────────────
const ALLOWED_SORTS = new Set(['hot', 'new', 'top', 'rising'])

interface RedditPost {
  id: string
  title: string
  selftext: string
  author: string
  score: number
  num_comments: number
  url: string
  permalink: string
  created_utc: number
  subreddit: string
  link_flair_text: string | null
  upvote_ratio: number
}

/**
 * Method 1 (Primary): Fetch via Reddit OAuth API (oauth.reddit.com)
 * Works from datacenter IPs because it's the official authenticated API.
 */
async function fetchViaOAuth(
  subreddit: string,
  sort: string,
  limit: number,
  query?: string
): Promise<RedditPost[]> {
  const token = await getRedditToken()

  let url: string
  if (query) {
    // Search within subreddit
    url = `https://oauth.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=${limit}`
  } else {
    // Browse subreddit listings
    url = `https://oauth.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Sentinel/1.0 (by /u/SentinelTrading)',
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Reddit OAuth API returned ${res.status}: ${text.substring(0, 200)}`)
    }

    const json = await res.json()
    return extractPosts(json)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Method 3 (Fallback): Fetch via Reddit's native .json endpoint
 * Lighter weight, no auth needed, but may be blocked from some datacenter IPs.
 */
async function fetchViaJsonEndpoint(
  subreddit: string,
  sort: string,
  limit: number,
  query?: string
): Promise<RedditPost[]> {
  let url: string
  if (query) {
    url = `https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&limit=${limit}`
  } else {
    url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}`
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Sentinel/1.0 (by /u/SentinelTrading)',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Reddit .json endpoint returned ${res.status}`)
    }

    const json = await res.json()
    return extractPosts(json)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Extract posts from Reddit's listing JSON structure.
 * Works for both OAuth and .json endpoint responses.
 */
function extractPosts(json: any): RedditPost[] {
  const listing = json?.data?.children || []
  const posts: RedditPost[] = []
  const seenIds = new Set<string>()

  for (const child of listing) {
    const d = child?.data
    if (!d || !d.id) continue

    // Deduplicate by post ID
    if (seenIds.has(d.id)) continue
    seenIds.add(d.id)

    posts.push({
      id: d.id,
      title: d.title || '',
      selftext: (d.selftext || '').substring(0, 2000),
      author: d.author || '[deleted]',
      score: d.score || 0,
      num_comments: d.num_comments || 0,
      url: d.url || '',
      permalink: d.permalink ? `https://www.reddit.com${d.permalink}` : '',
      created_utc: d.created_utc || 0,
      subreddit: d.subreddit || subreddit,
      link_flair_text: d.link_flair_text || null,
      upvote_ratio: d.upvote_ratio || 0,
    })
  }

  return posts
}

// ─── Main Handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth: verify Supabase JWT ──
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

    // ── Parse request body ──
    const body = await req.json()
    const subreddit = body?.subreddit || 'wallstreetbets'
    const sort = body?.sort || 'hot'
    const limit = Math.min(body?.limit || 25, 100) // Cap at 100
    const query: string | undefined = body?.query

    // ── Validate inputs ──
    if (!ALLOWED_SUBREDDITS.has(subreddit)) {
      return new Response(JSON.stringify({ error: `Subreddit '${subreddit}' not in allowlist` }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!ALLOWED_SORTS.has(sort)) {
      return new Response(JSON.stringify({ error: `Sort '${sort}' not allowed` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[proxy-reddit] Fetching r/${subreddit}/${sort} (limit=${limit}${query ? `, q=${query}` : ''})`)

    // ── Try OAuth first, fall back to .json endpoint ──
    let posts: RedditPost[]
    try {
      posts = await fetchViaOAuth(subreddit, sort, limit, query)
      console.log(`[proxy-reddit] OAuth succeeded: ${posts.length} posts from r/${subreddit}`)
    } catch (oauthErr) {
      console.warn(`[proxy-reddit] OAuth failed: ${oauthErr instanceof Error ? oauthErr.message : oauthErr}`)
      console.log('[proxy-reddit] Falling back to .json endpoint...')

      try {
        posts = await fetchViaJsonEndpoint(subreddit, sort, limit, query)
        console.log(`[proxy-reddit] .json fallback succeeded: ${posts.length} posts from r/${subreddit}`)
      } catch (jsonErr) {
        console.error(`[proxy-reddit] .json fallback also failed: ${jsonErr instanceof Error ? jsonErr.message : jsonErr}`)
        return new Response(JSON.stringify({ error: 'All Reddit fetch methods failed' }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    return new Response(JSON.stringify({ posts, count: posts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[proxy-reddit] Error:', error)
    return new Response(JSON.stringify({ error: 'Internal proxy error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
