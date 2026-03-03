/**
 * Sentinel — RSS Reader Service
 *
 * Fetches RSS feeds, parses them using a lightweight proxy to bypass CORS,
 * and caches the items into the Supabase 'rss_cache' table for fast agent access.
 */

import { supabase } from '@/config/supabase';
import { RSS_FEEDS } from '@/config/rssFeeds';

export class RSSReaderService {
    /**
     * Syncs all configured RSS feeds into the database cache.
     * In a true prod environment, this would run on a cron Edge Function.
     * For the web app, we can trigger it manually via the UI.
     */
    static async syncAllFeeds() {
        console.log('[RSSReader] Starting full feed sync...');
        let totalAdded = 0;

        // Process a few at a time to avoid slamming the proxy
        const batchSize = 3;
        for (let i = 0; i < RSS_FEEDS.length; i += batchSize) {
            const batch = RSS_FEEDS.slice(i, i + batchSize);

            const promises = batch.map(async (feed) => {
                try {
                    // Instead of a public CORS proxy, we use our own secure Supabase Edge Function.
                    // We use a native fetch instead of `supabase.functions.invoke` because the edge function 
                    // returns raw XML text ('application/xml'), and the helper tries to parse it as JSON.
                    const session = await supabase.auth.getSession();
                    const token = session.data.session?.access_token || '';
                    const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-rss`;

                    const res = await fetch(edgeUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ feedUrl: feed.url })
                    });

                    if (!res.ok) throw new Error(`HTTP ${res.status} from proxy-rss`);
                    const xmlText = await res.text();

                    // Very rudimentary XML regex parser (since we don't want heavy DOMParser in Edge/Workers)
                    const items = this.parseSimpleRSS(xmlText);

                    if (items.length > 0) {
                        // Upsert into our rss_cache table
                        const { error } = await supabase.from('rss_cache').upsert(
                            items.map(item => ({
                                feed_name: feed.name,
                                feed_category: feed.category,
                                title: item.title,
                                link: item.link,
                                description: item.description,
                                published_at: item.pubDate || new Date().toISOString(),
                                // Cache for 24 hours
                                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                                tickers_mentioned: [],
                                keywords: []
                            } as any)),
                            { onConflict: 'link' } // Avoid duplicate articles
                        );

                        if (error) {
                            console.error(`[RSSReader] DB insert error for ${feed.name}:`, error.message);
                        } else {
                            totalAdded += items.length;
                        }
                    }
                } catch (err) {
                    console.warn(`[RSSReader] Failed to sync ${feed.name}:`, err);
                }
            });

            await Promise.all(promises);
        }

        console.log(`[RSSReader] Sync complete. Processed ~${totalAdded} items.`);
        return totalAdded;
    }

    /**
     * Helper to extract title, link, description loosely from RSS XML
     */
    private static parseSimpleRSS(xml: string) {
        const items: Array<{ title: string, link: string, description: string, pubDate: string }> = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
            const itemXml = match[1];

            // Extract title
            const titleMatch = /<title(?:[^>]*)><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title(?:[^>]*)>([\s\S]*?)<\/title>/.exec(itemXml || '');
            const title = titleMatch ? (titleMatch[1] || titleMatch[2])?.trim() || '' : '';

            // Extract link
            const linkMatch = /<link(?:[^>]*)>([\s\S]*?)<\/link>/.exec(itemXml || '');
            const link = linkMatch && linkMatch[1] ? linkMatch[1].trim() : '';

            // Extract description
            const descMatch = /<description(?:[^>]*)><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description(?:[^>]*)>([\s\S]*?)<\/description>/.exec(itemXml || '');
            const description = descMatch ? (descMatch[1] || descMatch[2])?.trim() || '' : '';

            // Extract pubDate
            const dateMatch = /<pubDate(?:[^>]*)>([\s\S]*?)<\/pubDate>/.exec(itemXml || '');
            const pubDate = dateMatch && dateMatch[1] ? new Date(dateMatch[1].trim()).toISOString() : '';

            if (title && link) {
                // Strip HTML tags from description for cleaner DB storage
                const cleanDesc = description.replace(/<[^>]*>?/gm, '').substring(0, 1000);
                items.push({ title, link, description: cleanDesc, pubDate });
            }
        }

        return items;
    }
}
