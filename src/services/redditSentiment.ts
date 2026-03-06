/**
 * Sentinel — Reddit Sentiment Service
 *
 * Fetches retail sentiment from Reddit via the proxy-reddit Edge Function,
 * which uses the Reddit OAuth API (client_credentials grant) to bypass
 * datacenter IP blocks. Falls back to the .json endpoint if OAuth is unavailable.
 *
 * Caches parsed posts into the `rss_cache` table to feed the Agent Scanner pipeline.
 */

import { supabase } from '@/config/supabase';

interface RedditPost {
    id: string;
    title: string;
    selftext: string;
    author: string;
    score: number;
    num_comments: number;
    url: string;
    permalink: string;
    created_utc: number;
    subreddit: string;
    link_flair_text: string | null;
    upvote_ratio: number;
}

// Subreddits to scan for each ticker search
const SENTIMENT_SUBREDDITS = ['wallstreetbets', 'stocks', 'investing'] as const;

export class RedditSentimentService {
    /**
     * Fetch latest posts matching specific tickers from financial subreddits
     * and cache them into the rss_cache table as 'retail_sentiment'.
     *
     * @param tickers Array of tickers to search for (e.g. ['AAPL', 'NVDA'])
     */
    static async fetchAndCacheSentiment(tickers: string[]): Promise<number> {
        if (!tickers || tickers.length === 0) return 0;

        console.log(`[RedditSentiment] Fetching retail sentiment for ${tickers.length} tickers...`);
        let totalCached = 0;

        try {
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token || '';
            const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-reddit`;

            // Max 5 tickers per run to stay within rate limits
            const searchTickers = tickers.slice(0, 5);

            for (const ticker of searchTickers) {
                for (const sub of SENTIMENT_SUBREDDITS) {
                    try {
                        const res = await fetch(edgeUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                subreddit: sub,
                                query: ticker,
                                sort: 'new',
                                limit: 10,
                            })
                        });

                        if (!res.ok) {
                            console.warn(`[RedditSentiment] proxy-reddit returned ${res.status} for ${ticker} in r/${sub}`);
                            continue;
                        }

                        const data = await res.json();
                        const posts: RedditPost[] = data.posts || [];

                        if (posts.length > 0) {
                            const rows = posts.map(post => ({
                                feed_name: `r/${sub}`,
                                feed_category: 'retail_sentiment',
                                title: post.title,
                                link: post.permalink || post.url,
                                description: post.selftext.substring(0, 1500) || post.title,
                                published_at: post.created_utc
                                    ? new Date(post.created_utc * 1000).toISOString()
                                    : new Date().toISOString(),
                                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                tickers_mentioned: [ticker],
                                keywords: [
                                    ticker, 'reddit', sub,
                                    post.author,
                                    ...(post.link_flair_text ? [post.link_flair_text] : []),
                                    `score:${post.score}`,
                                    `comments:${post.num_comments}`,
                                ]
                            }));

                            // Deduplicate by link within this batch
                            const seen = new Set<string>();
                            const uniqueRows = rows.filter(r => {
                                if (seen.has(r.link)) return false;
                                seen.add(r.link);
                                return true;
                            });

                            const { error } = await supabase.from('rss_cache').upsert(
                                uniqueRows as any[],
                                { onConflict: 'link' }
                            );

                            if (error) {
                                console.error(`[RedditSentiment] DB insert error for ${ticker} r/${sub}:`, error.message);
                            } else {
                                totalCached += uniqueRows.length;
                            }
                        }

                        // Rate-limit: 2s between requests (Reddit allows 100 QPM on OAuth)
                        await new Promise(resolve => setTimeout(resolve, 2000));

                    } catch (err) {
                        console.warn(`[RedditSentiment] Failed for ${ticker} in r/${sub}:`, err);
                    }
                }
            }

            console.log(`[RedditSentiment] Cached ${totalCached} retail sentiment items.`);
            return totalCached;

        } catch (err) {
            console.error('[RedditSentiment] Fatal error:', err);
            return 0;
        }
    }

    /**
     * Fetch hot/trending posts from a subreddit (no ticker filter).
     * Useful for getting a general retail sentiment pulse.
     */
    static async fetchSubredditHot(subreddit: string, limit = 25): Promise<RedditPost[]> {
        try {
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token || '';
            const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-reddit`;

            const res = await fetch(edgeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ subreddit, sort: 'hot', limit })
            });

            if (!res.ok) {
                console.warn(`[RedditSentiment] Hot fetch failed for r/${subreddit}: ${res.status}`);
                return [];
            }

            const data = await res.json();
            return data.posts || [];
        } catch (err) {
            console.error(`[RedditSentiment] Error fetching r/${subreddit} hot:`, err);
            return [];
        }
    }
}
