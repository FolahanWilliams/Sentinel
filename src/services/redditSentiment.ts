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
    static async fetchAndCacheSentiment(_tickers: string[]): Promise<number> {
        // Reddit aggressively blocks all datacenter/server IPs, so proxy-rss
        // always gets 502. Skip entirely to avoid noisy errors in the scan.
        // Retail sentiment is covered by Hacker News + Techmeme RSS feeds
        // and the Gemini Grounded Search (GoogleNewsService) instead.
        console.log('[RedditSentiment] Skipped — Reddit blocks server-side fetches.');
        return 0;
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
