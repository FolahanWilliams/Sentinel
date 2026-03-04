/**
 * Sentinel — Google News Service (via Gemini Grounded Search)
 *
 * Replaces the Alpha Vantage News Sentiment API with Gemini's Google Search
 * grounding. No external API key needed — uses the existing Gemini API key.
 * Results are cached into the `rss_cache` table alongside RSS feed articles.
 */

import { supabase } from '@/config/supabase';
import { GeminiService } from './gemini';

interface GoogleNewsArticle {
    title: string;
    url: string;
    summary: string;
    source: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    tickers_mentioned: string[];
}

const GOOGLE_NEWS_SCHEMA = {
    type: "object",
    properties: {
        articles: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    title: { type: "string", description: "Article headline" },
                    url: { type: "string", description: "Source URL" },
                    summary: { type: "string", description: "2-3 sentence summary of the article" },
                    source: { type: "string", description: "Publication name (e.g. Reuters, CNBC)" },
                    sentiment: { type: "string", enum: ["bullish", "bearish", "neutral"], description: "Overall market sentiment" },
                    tickers_mentioned: {
                        type: "array",
                        items: { type: "string" },
                        description: "Stock tickers mentioned (e.g. AAPL, NVDA)"
                    }
                },
                required: ["title", "url", "summary", "source", "sentiment", "tickers_mentioned"]
            }
        }
    },
    required: ["articles"]
};

export class GoogleNewsService {
    /**
     * Fetch latest market news using Gemini with Google Search grounding
     * and cache them into the rss_cache table.
     *
     * @param tickers Optional array of tickers to focus on (e.g. ['AAPL', 'NVDA'])
     */
    static async fetchAndCacheNews(tickers?: string[]): Promise<number> {
        console.log('[GoogleNews] Fetching market news via Gemini Grounded Search...');

        try {
            const tickerFocus = tickers && tickers.length > 0
                ? `Focus especially on news about these tickers: ${tickers.slice(0, 5).join(', ')}.`
                : '';

            const prompt = `Search for the most recent, significant stock market news from the last 24 hours. 
Find 10-20 articles about individual companies or sectors that could move stock prices. 
Include: earnings reports, analyst upgrades/downgrades, product launches, M&A activity, 
regulatory decisions, management changes, government contracts, tariffs, supply chain disruptions, 
activist investor activity, and any unusual price movements.
${tickerFocus}

For each article, provide the title, source URL, a 2-3 sentence summary, the publication name, 
overall market sentiment (bullish/bearish/neutral), and any stock tickers mentioned.
Exclude generic market commentary, daily recaps, and opinion pieces.`;

            const result = await GeminiService.generate<{ articles: GoogleNewsArticle[] }>({
                prompt,
                systemInstruction: 'You are a financial news aggregator. Return structured JSON with the latest market-moving news articles. Be specific and factual.',
                requireGroundedSearch: true,
                responseSchema: GOOGLE_NEWS_SCHEMA,
            });

            if (!result.success || !result.data?.articles || !Array.isArray(result.data.articles)) {
                console.warn('[GoogleNews] No news articles returned. Error:', result.error);
                return 0;
            }

            const articles = result.data.articles;

            // Transform to rss_cache format and upsert
            const rows = articles.map((article) => {
                const keywords = [
                    article.sentiment,
                    article.source,
                    ...article.tickers_mentioned,
                ].filter(Boolean);

                return {
                    feed_name: `Google: ${article.source || 'News'}`,
                    feed_category: 'market_moving',
                    title: article.title,
                    link: article.url || `https://news.google.com/search?q=${encodeURIComponent(article.title)}`,
                    description: (article.summary || '').substring(0, 1000),
                    published_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    tickers_mentioned: article.tickers_mentioned || [],
                    keywords,
                };
            });

            if (rows.length > 0) {
                const { error } = await supabase.from('rss_cache').upsert(
                    rows as any[],
                    { onConflict: 'link' }
                );

                if (error) {
                    console.error('[GoogleNews] DB insert error:', error.message);
                    return 0;
                }
            }

            console.log(`[GoogleNews] Cached ${rows.length} news articles via Google Search.`);
            return rows.length;
        } catch (err) {
            console.warn('[GoogleNews] Failed to fetch news:', err);
            return 0;
        }
    }
}
