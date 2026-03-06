/**
 * Sentinel — Reddit Sentiment Service
 *
 * Fetches retail sentiment from Reddit via the proxy-reddit Edge Function,
 * which uses the Apify Reddit Scraper actor to bypass datacenter IP blocks.
 * Apify handles proxy rotation and browser emulation internally.
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

// Primary subreddit for ticker-specific searches (highest retail volume).
// Each Apify run takes 10-30s and costs compute credits, so we limit to
// the single most impactful sub for searches. Hot-listing still supports all.
const SEARCH_SUBREDDIT = 'wallstreetbets';

export class RedditSentimentService {
    /**
     * Fetch latest posts matching specific tickers from r/wallstreetbets
     * and cache them into the rss_cache table as 'retail_sentiment'.
     *
     * BATCHED: Sends up to 5 tickers in a single Apify run to save costs (~$0.02 vs ~$0.005).
     *
     * @param tickers Array of tickers to search for (e.g. ['AAPL', 'NVDA'])
     */
    static async fetchAndCacheSentiment(tickers: string[]): Promise<number> {
        if (!tickers || tickers.length === 0) return 0;

        const searchTickers = tickers.slice(0, 5).map(t => t.toUpperCase());
        console.log(`[RedditSentiment] Fetching batched sentiment for: ${searchTickers.join(', ')}`);

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
                body: JSON.stringify({
                    subreddit: SEARCH_SUBREDDIT,
                    queries: searchTickers, // Using the new batched queries param
                    sort: 'new',
                    limit: 50, // Higher limit for batched requests
                })
            });

            if (!res.ok) {
                console.warn(`[RedditSentiment] proxy-reddit batched request failed: ${res.status}`);
                return 0;
            }

            const data = await res.json();
            const posts: RedditPost[] = data.posts || [];

            if (posts.length === 0) return 0;

            // Attribute posts to tickers (since Apify returns a mixed list)
            const rows: any[] = [];
            const seenLinks = new Set<string>();

            for (const post of posts) {
                if (seenLinks.has(post.permalink)) continue;
                seenLinks.add(post.permalink);

                // Find which tickers are mentioned in this specific post
                const content = `${post.title} ${post.selftext}`.toUpperCase();
                const matchedTickers = searchTickers.filter(t => {
                    // Match boundary: $TICKER or TICKER with spaces
                    const regex = new RegExp(`(\\$\\b${t}\\b|\\b${t}\\b)`, 'i');
                    return regex.test(content);
                });

                // If no tickers matched from our search list (rare for search results but possible), 
                // skip or attribute to the first ticker as a fallback.
                if (matchedTickers.length === 0) continue;

                rows.push({
                    feed_name: `r/${post.subreddit || SEARCH_SUBREDDIT}`,
                    feed_category: 'retail_sentiment',
                    title: post.title,
                    link: post.permalink || post.url,
                    description: post.selftext.substring(0, 1500) || post.title,
                    published_at: post.created_utc
                        ? new Date(post.created_utc * 1000).toISOString()
                        : new Date().toISOString(),
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    tickers_mentioned: matchedTickers,
                    keywords: [
                        ...matchedTickers, 'reddit', post.subreddit || SEARCH_SUBREDDIT,
                        post.author,
                        `score:${post.score}`,
                        `comments:${post.num_comments}`,
                    ]
                });
            }

            if (rows.length === 0) return 0;

            console.log(`[RedditSentiment] Requesting Gemini sentiment for ${rows.length} posts...`);

            // Limit to 20 posts max for Gemini to avoid massive prompts/timeouts in a single batched call
            const postsToScore = rows.slice(0, 20);

            const prompt = `
Analyze the financial sentiment of the following Reddit posts.
For each post, provide a sentiment score and a brief reasoning.
- sentiment_score: Number from -1.0 (extremely bearish/negative) to 1.0 (extremely bullish/positive). 0.0 is neutral.
- sentiment_reasoning: 1-2 succinct sentences explaining why, referencing the specific tickers mentioned.

Posts:
${postsToScore.map((r, i) => `[Post ${i}] Title: ${r.title}\nContent: ${r.description.substring(0, 300)}`).join('\n\n')}
`;

            const { GeminiService } = await import('@/services/gemini');

            const geminiRes = await GeminiService.generate({
                prompt,
                systemInstruction: "You are a specialized retail sentiment analyzer. Output a JSON array with exactly as many items as the input posts, in the exact same order.",
                model: 'gemini-2.5-flash',
                temperature: 0.1,
                responseSchema: {
                    type: "ARRAY",
                    description: "An array of sentiment analyses, one for each post in order.",
                    items: {
                        type: "OBJECT",
                        properties: {
                            sentiment_score: { type: "NUMBER", description: "Score from -1.0 to 1.0" },
                            sentiment_reasoning: { type: "STRING", description: "1-2 sentence reasoning" }
                        },
                        required: ["sentiment_score", "sentiment_reasoning"]
                    }
                }
            });

            if (geminiRes.success && Array.isArray(geminiRes.data)) {
                const scores = geminiRes.data;
                // Apply scores back to the rows
                for (let i = 0; i < scores.length && i < postsToScore.length; i++) {
                    const analysis = scores[i];
                    postsToScore[i].sentiment_score = analysis.sentiment_score || 0;
                    postsToScore[i].sentiment_reasoning = analysis.sentiment_reasoning || 'No reasoning provided.';
                }
            } else {
                console.warn(`[RedditSentiment] Gemini scoring failed, proceeding without scores. Error:`, geminiRes.error);
            }

            const { error } = await supabase.from('rss_cache').upsert(
                postsToScore, // Only insert the scored ones to keep db lean
                { onConflict: 'link' }
            );

            if (error) {
                console.error(`[RedditSentiment] DB insert error for batched run:`, error.message);
                return 0;
            }

            return postsToScore.length;

        } catch (err) {
            console.error('[RedditSentiment] Fatal batched error:', err);
            return 0;
        }
    }

    /**
     * Fetch hot/trending posts from a subreddit (no ticker filter).
     * Useful for getting a general retail sentiment pulse.
     */
}
