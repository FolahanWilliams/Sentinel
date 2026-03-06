import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Apify Config ────────────────────────────────────────────────────────────
const APIFY_REDDIT_ACTOR = 'trudax~reddit-scraper'
const APIFY_BASE = 'https://api.apify.com/v2'

// ─── Allowed subreddits (SSRF prevention) ────────────────────────────────────
const ALLOWED_SUBREDDITS = new Set([
  'wallstreetbets', 'stocks', 'investing', 'options',
  'stockmarket', 'pennystocks', 'SecurityAnalysis',
  'ValueInvesting', 'Daytrading', 'thetagang',
])

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
 * Run the Apify Reddit Scraper actor and return results in a single call.
 *
 * Uses the `run-sync-get-dataset-items` endpoint which:
 *   1. Starts the actor run
 *   2. Waits for completion (up to 300s max, we cap at 45s via AbortController)
 *   3. Returns the dataset items directly in the response body
 *
 * This eliminates the need for a separate dataset fetch call.
 */
async function fetchViaApify(
  subreddit: string,
  sort: string,
  limit: number,
  query?: string,
): Promise<RedditPost[]> {
  const apifyToken = Deno.env.get('APIFY_TOKEN') || ''
  if (!apifyToken) {
    throw new Error('APIFY_TOKEN environment variable is not set')
  }

  // ── Build actor input ──
  const input: Record<string, unknown> = {
    maxItems: limit,
    maxPostCount: limit,
    maxComments: 0,
    skipComments: true,
    sort,
    time: 'day',
    scrollTimeout: 40,
    proxy: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
    },
  }

  if (query) {
    // Search mode: search within the subreddit for the query term
    input.startUrls = [{
      url: `https://www.reddit.com/r/${subreddit}/search/?q=${encodeURIComponent(query)}&restrict_sr=1&sort=${sort}`
    }]
  } else {
    // Listing mode: browse the subreddit
    input.startUrls = [{
      url: `https://www.reddit.com/r/${subreddit}/${sort}/`
    }]
  }

  // ── Single call: run actor + get dataset items ──
  const url = `${APIFY_BASE}/acts/${APIFY_REDDIT_ACTOR}/run-sync-get-dataset-items?format=json`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    })

    if (res.status === 408) {
      throw new Error('Apify actor run timed out (exceeded sync limit)')
    }

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Apify run-sync failed: ${res.status} ${errText.substring(0, 300)}`)
    }

    const items: any[] = await res.json()
    return normalizeApifyItems(items, subreddit)
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Normalize Apify Reddit Scraper output into our standard RedditPost shape.
 *
 * Apify trudax/reddit-scraper returns items with dataType "post" or "comment".
 * Post fields: id, parsedId, title, body, username, communityName,
 *              parsedCommunityName, upVotes, numberOfComments, url,
 *              createdAt (ISO 8601), over18, isVideo, isAd, scrapedAt
 */
function normalizeApifyItems(items: any[], fallbackSubreddit: string): RedditPost[] {
  const posts: RedditPost[] = []
  const seenIds = new Set<string>()

  for (const item of items) {
    // Skip comments — we only want posts
    if (item.dataType === 'comment') continue

    // Skip ads
    if (item.isAd) continue

    const id = item.parsedId || item.id || ''
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)

    const title = item.title || ''
    if (!title) continue

    const selftext = (item.body || '').substring(0, 2000)
    const author = item.username || '[deleted]'
    const score = item.upVotes ?? 0
    const numComments = item.numberOfComments ?? 0
    const postUrl = item.url || ''

    // createdAt is ISO 8601 string from Apify — convert to unix timestamp
    const createdAt = item.createdAt || item.scrapedAt || ''
    const createdUtc = createdAt
      ? Math.floor(new Date(createdAt).getTime() / 1000) || 0
      : 0

    // communityName comes as "r/stocks", parsedCommunityName as "stocks"
    const subreddit = item.parsedCommunityName || item.communityName?.replace(/^r\//, '') || fallbackSubreddit

    posts.push({
      id,
      title,
      selftext,
      author,
      score,
      num_comments: numComments,
      url: postUrl,
      permalink: postUrl, // Apify url field is already the full permalink
      created_utc: createdUtc,
      subreddit,
      link_flair_text: null, // Not provided by this actor
      upvote_ratio: 0,       // Not provided by this actor
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
    const limit = Math.min(body?.limit || 25, 100)
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

    console.log(`[proxy-reddit] Apify scrape: r/${subreddit}/${sort} (limit=${limit}${query ? `, q=${query}` : ''})`)

    const posts = await fetchViaApify(subreddit, sort, limit, query)

    console.log(`[proxy-reddit] Apify returned ${posts.length} posts from r/${subreddit}`)

    return new Response(JSON.stringify({ posts, count: posts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)

    // Surface Apify-specific errors as 502 (upstream failure)
    if (msg.includes('Apify')) {
      console.warn(`[proxy-reddit] ${msg}`)
      return new Response(JSON.stringify({ error: 'Reddit scrape failed via Apify' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.error('[proxy-reddit] Error:', error)
    return new Response(JSON.stringify({ error: 'Internal proxy error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
