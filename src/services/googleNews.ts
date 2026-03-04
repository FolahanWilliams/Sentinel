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
Exclude generic market commentary, daily recaps, and opinion pieces.

Return your answer as a JSON object in this exact format (no markdown, no extra text):
{"articles": [{"title": "headline", "url": "https://...", "summary": "2-3 sentences", "source": "Publisher", "sentiment": "bullish|bearish|neutral", "tickers_mentioned": ["AAPL"]}]}`;

            // Use grounded search WITHOUT responseSchema to avoid Supabase timeout.
            // Google Search grounding + structured JSON causes double processing.
            const result = await GeminiService.generate<any>({
                prompt,
                systemInstruction: 'You are a financial news aggregator. Return structured JSON with the latest market-moving news articles. Be specific and factual. Return ONLY the JSON, no markdown.',
                requireGroundedSearch: true,
                temperature: 0.1,
                // NO responseSchema — prevents timeout with grounded search
            });

            // Parse plain text response manually
            let articles: GoogleNewsArticle[] = [];
            if (result.success && result.data) {
                try {
                    const rawText = typeof result.data === 'string'
                        ? result.data
                        : JSON.stringify(result.data);
                    const jsonMatch = rawText.match(/\{[\s\S]*"articles"[\s\S]*\}/);
                    if (jsonMatch) {
                        const parsed = JSON.parse(jsonMatch[0]);
                        if (Array.isArray(parsed.articles)) {
                            articles = parsed.articles;
                        }
                    }
                } catch (parseErr) {
                    console.warn('[GoogleNews] Failed to parse response:', parseErr);
                }
            }

            if (articles.length === 0) {
                console.warn('[GoogleNews] No news articles returned. Error:', result.error);
                return 0;
            }

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
