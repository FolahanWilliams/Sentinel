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
 * Run the Apify Reddit Scraper actor synchronously and return results.
 *
 * Uses Apify's `waitForFinish` parameter to block until the actor completes
 * (up to 40s, well within the Supabase Edge Function 60s timeout).
 *
 * Flow:
 *   1. POST /acts/{actorId}/runs?waitForFinish=40  → starts run & waits
 *   2. GET  /datasets/{datasetId}/items             → retrieves scraped data
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
  // The trudax/reddit-scraper accepts startUrls or searches
  const input: Record<string, unknown> = {
    maxItems: limit,
    maxPostCount: limit,
    maxComments: 0,         // We only need posts, not comment threads
    proxy: { useApifyProxy: true },
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

  // ── Step 1: Start actor run and wait for completion ──
  const runUrl = `${APIFY_BASE}/acts/${APIFY_REDDIT_ACTOR}/runs?waitForFinish=40`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)

  let datasetId: string
  try {
    const runRes = await fetch(runUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apifyToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    })

    if (!runRes.ok) {
      const errText = await runRes.text()
      throw new Error(`Apify actor run failed: ${runRes.status} ${errText.substring(0, 300)}`)
    }

    const runData = await runRes.json()
    const status = runData?.data?.status

    if (status !== 'SUCCEEDED') {
      throw new Error(`Apify actor run did not succeed: status=${status}`)
    }

    datasetId = runData?.data?.defaultDatasetId
    if (!datasetId) {
      throw new Error('Apify run completed but no datasetId returned')
    }
  } finally {
    clearTimeout(timeout)
  }

  // ── Step 2: Fetch results from the dataset ──
  const datasetUrl = `${APIFY_BASE}/datasets/${datasetId}/items?format=json&limit=${limit}`

  const dsController = new AbortController()
  const dsTimeout = setTimeout(() => dsController.abort(), 10_000)

  try {
    const dsRes = await fetch(datasetUrl, {
      headers: { 'Authorization': `Bearer ${apifyToken}` },
      signal: dsController.signal,
    })

    if (!dsRes.ok) {
      throw new Error(`Apify dataset fetch failed: ${dsRes.status}`)
    }

    const items: any[] = await dsRes.json()
    return normalizeApifyItems(items, subreddit)
  } finally {
    clearTimeout(dsTimeout)
  }
}

/**
 * Normalize Apify Reddit Scraper output into our standard RedditPost shape.
 * The scraper returns fields like: id, title, body, username, upVotes,
 * numberOfComments, url, createdAt, communityName, etc.
 */
function normalizeApifyItems(items: any[], fallbackSubreddit: string): RedditPost[] {
  const posts: RedditPost[] = []
  const seenIds = new Set<string>()

  for (const item of items) {
    const id = item.id || item.dataId || ''
    if (!id || seenIds.has(id)) continue
    seenIds.add(id)

    // Apify fields vary slightly by actor version; handle common variants
    const title = item.title || ''
    const selftext = (item.body || item.selftext || item.text || '').substring(0, 2000)
    const author = item.username || item.author || item.parsedUser?.name || '[deleted]'
    const score = item.upVotes ?? item.score ?? item.ups ?? 0
    const numComments = item.numberOfComments ?? item.num_comments ?? item.numComments ?? 0
    const postUrl = item.url || ''
    const permalink = item.url?.startsWith('https://www.reddit.com')
      ? item.url
      : postUrl
    const createdAt = item.createdAt || item.created_utc || item.scrapedAt || ''
    const createdUtc = typeof createdAt === 'number'
      ? createdAt
      : Math.floor(new Date(createdAt).getTime() / 1000) || 0
    const subreddit = item.communityName || item.subreddit || fallbackSubreddit
    const flair = item.flair || item.link_flair_text || null
    const upvoteRatio = item.upvoteRatio ?? item.upVoteRatio ?? 0

    if (title) {
      posts.push({
        id,
        title,
        selftext,
        author,
        score,
        num_comments: numComments,
        url: postUrl,
        permalink,
        created_utc: createdUtc,
        subreddit,
        link_flair_text: flair,
        upvote_ratio: upvoteRatio,
      })
    }
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
