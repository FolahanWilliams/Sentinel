import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

// In-memory cache for Reddit responses (edge functions are short-lived)
let cachedReddit: { key: string; data: RedditPost[]; expiresAt: number } | null = null
const CACHE_TTL = 2 * 60 * 1000 // 2 minutes

/**
 * Fetch posts from Reddit's public JSON API.
 * Reddit exposes .json endpoints for all pages — no API key needed.
 * Uses a browser User-Agent to avoid 429s from datacenter IPs.
 */
async function fetchFromRedditJSON(
  subreddit: string,
  sort: string,
  limit: number,
  query?: string,
  queries?: string[],
): Promise<RedditPost[]> {
  const allPosts: RedditPost[] = []
  const seenIds = new Set<string>()

  // Build list of URLs to fetch
  const urls: string[] = []

  if (queries && queries.length > 0) {
    // Batch search mode: one URL per query
    for (const q of queries.slice(0, 5)) {
      urls.push(`https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=${sort}&t=day&limit=${limit}`)
    }
  } else if (query) {
    urls.push(`https://www.reddit.com/r/${subreddit}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=${sort}&t=day&limit=${limit}`)
  } else {
    urls.push(`https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&t=day`)
  }

  for (const url of urls) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)

    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        console.warn(`[proxy-reddit] Reddit JSON API returned ${res.status} for ${url}`)
        continue
      }

      const data = await res.json()
      const children = data?.data?.children || []

      for (const child of children) {
        const post = child?.data
        if (!post || child.kind !== 't3') continue // t3 = link/post

        const id = post.id || ''
        if (!id || seenIds.has(id)) continue
        seenIds.add(id)

        if (!post.title) continue
        if (post.is_self === false && post.is_video) continue // Skip video-only posts

        allPosts.push({
          id,
          title: post.title || '',
          selftext: (post.selftext || '').substring(0, 2000),
          author: post.author || '[deleted]',
          score: post.score ?? 0,
          num_comments: post.num_comments ?? 0,
          url: post.url || '',
          permalink: post.permalink ? `https://www.reddit.com${post.permalink}` : post.url || '',
          created_utc: post.created_utc ?? 0,
          subreddit: post.subreddit || subreddit,
          link_flair_text: post.link_flair_text || null,
          upvote_ratio: post.upvote_ratio ?? 0,
        })
      }
    } catch (err: any) {
      clearTimeout(timeout)
      console.warn(`[proxy-reddit] Fetch failed for ${url}:`, err.message)
    }
  }

  return allPosts
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
    const queries: string[] | undefined = body?.queries

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

    // ── Check in-memory cache ──
    const cacheKey = `${subreddit}:${sort}:${query || ''}:${queries?.join(',') || ''}`
    if (cachedReddit && cachedReddit.key === cacheKey && Date.now() < cachedReddit.expiresAt) {
      console.log(`[proxy-reddit] Cache hit for ${cacheKey}`)
      return new Response(JSON.stringify({ posts: cachedReddit.data, count: cachedReddit.data.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
      })
    }

    const logParams = query ? `, q=${query}` : (queries ? `, qs=${queries.join(',')}` : '')
    console.log(`[proxy-reddit] Reddit JSON API: r/${subreddit}/${sort} (limit=${limit}${logParams})`)

    const posts = await fetchFromRedditJSON(subreddit, sort, limit, query, queries)

    console.log(`[proxy-reddit] Reddit returned ${posts.length} posts from r/${subreddit}`)

    // Cache the result
    cachedReddit = { key: cacheKey, data: posts, expiresAt: Date.now() + CACHE_TTL }

    return new Response(JSON.stringify({ posts, count: posts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[proxy-reddit] Error:', msg)

    return new Response(JSON.stringify({ error: 'Internal proxy error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
