/**
 * Sentinel — Reddit Sentiment Service
 *
 * Fetches retail sentiment from Reddit (e.g. r/wallstreetbets) using the ATOM RSS format.
 * Caches the parsed posts into the `rss_cache` table to feed the Agent Scanner pipeline.
 */

import { supabase } from '@/config/supabase';

interface RedditFeedItem {
    id: string;
    title: string;
    link: string;
    content: string;
    updated: string;
    author: string;
}

export class RedditSentimentService {
    /**
     * Fetch latest posts matching specific tickers from r/wallstreetbets
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
            const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-rss`;

            // Max 5 tickers per run to avoid spamming the proxy/Reddit
            const searchTickers = tickers.slice(0, 5);

            for (const ticker of searchTickers) {
                try {
                    // Fetch Atom feed via proxy (uses allorigins fallback if Reddit blocks direct)
                    const feedUrl = `https://www.reddit.com/r/wallstreetbets/search.rss?q=${ticker}&restrict_sr=1&sort=new`;

                    const res = await fetch(edgeUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ feedUrl })
                    });

                    if (!res.ok) {
                        console.warn(`[RedditSentiment] Proxy returned ${res.status} for ${ticker}`);
                        continue;
                    }

                    const xmlText = await res.text();
                    const items = this.parseAtomFeed(xmlText);

                    if (items.length > 0) {
                        // Transform to rss_cache format
                        const rows = items.map(item => {
                            // Strip HTML tags from content
                            const cleanContent = (item.content || '')
                                .replace(/<[^>]*>?/gm, '')
                                .substring(0, 1500);

                            return {
                                feed_name: 'r/wallstreetbets',
                                feed_category: 'retail_sentiment',
                                title: item.title,
                                link: item.link,
                                description: cleanContent,
                                published_at: item.updated || new Date().toISOString(),
                                // Cache for 24 hours
                                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                tickers_mentioned: [ticker],
                                keywords: [ticker, 'reddit', 'wallstreetbets', item.author]
                            };
                        });

                        const { error } = await supabase.from('rss_cache').upsert(
                            rows as any[],
                            { onConflict: 'link' }
                        );

                        if (error) {
                            console.error(`[RedditSentiment] DB insert error for ${ticker}:`, error.message);
                        } else {
                            totalCached += rows.length;
                        }
                    }

                    // Add a tiny delay between requests to be polite to the proxy
                    await new Promise(resolve => setTimeout(resolve, 500));

                } catch (tickerErr) {
                    console.warn(`[RedditSentiment] Failed to fetch sentiment for ${ticker}:`, tickerErr);
                }
            }

            console.log(`[RedditSentiment] Cached ${totalCached} retail sentiment items.`);
            return totalCached;

        } catch (err) {
            console.error('[RedditSentiment] Fatal error fetching sentiment:', err);
            return 0;
        }
    }

    /**
     * Helper to extract title, link, content, and updated time from Reddit's ATOM XML.
     */
    private static parseAtomFeed(xml: string): RedditFeedItem[] {
        const items: RedditFeedItem[] = [];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;

        while ((match = entryRegex.exec(xml)) !== null) {
            const entryXml = match[1];

            // Extract ID
            const idMatch = /<id(?:[^>]*)>([\s\S]*?)<\/id>/.exec(entryXml || '');
            const id = idMatch && idMatch[1] ? idMatch[1].trim() : '';

            // Extract title
            const titleMatch = /<title(?:[^>]*)>([\s\S]*?)<\/title>/.exec(entryXml || '');
            const title = titleMatch && titleMatch[1] ? titleMatch[1].trim() : '';

            // Extract link (href attribute)
            const linkMatch = /<link[^>]*href=["']([^"']+)["'][^>]*>/.exec(entryXml || '');
            const link = linkMatch && linkMatch[1] ? linkMatch[1].trim() : '';

            // Extract content
            const contentMatch = /<content(?:[^>]*)>([\s\S]*?)<\/content>/.exec(entryXml || '');
            const content = contentMatch && contentMatch[1] ? contentMatch[1].trim() : '';

            // Extract updated time
            const updatedMatch = /<updated(?:[^>]*)>([\s\S]*?)<\/updated>/.exec(entryXml || '');
            let updated = '';
            if (updatedMatch && updatedMatch[1]) {
                const d = new Date(updatedMatch[1].trim());
                updated = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
            } else {
                updated = new Date().toISOString();
            }

            // Extract author name
            let author = 'unknown';
            const authorMatch = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/.exec(entryXml || '');
            if (authorMatch && authorMatch[1]) {
                author = authorMatch[1].trim();
            }

            // Exclude empty junk entries
            if (title && link) {
                // Decode basic HTML entities that Reddit might leave in titles/content
                const decodeHtml = (text: string) => {
                    return text
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'");
                };

                items.push({
                    id,
                    title: decodeHtml(title),
                    link,
                    content: decodeHtml(content),
                    updated,
                    author
                });
            }
        }

        return items;
    }
}
