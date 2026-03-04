/**
 * Sentinel — Alpha Vantage News Sentiment Service
 *
 * Fetches market news with pre-computed sentiment scores from Alpha Vantage.
 * Uses the same API key already configured for stock quotes (MARKET_DATA_API_KEY).
 * Results are cached into the `rss_cache` table alongside RSS feed articles.
 */

import { supabase } from '@/config/supabase';

interface AVNewsFeedItem {
    title: string;
    url: string;
    summary: string;
    source: string;
    time_published: string; // "20260303T120000"
    overall_sentiment_score: number;
    overall_sentiment_label: string;
    ticker_sentiment?: Array<{
        ticker: string;
        relevance_score: string;
        ticker_sentiment_score: string;
        ticker_sentiment_label: string;
    }>;
}

export class AlphaVantageNewsService {
    /**
     * Fetch latest market news from Alpha Vantage News Sentiment API
     * and cache them into the rss_cache table.
     *
     * @param tickers Optional array of tickers to focus on (e.g. ['AAPL', 'NVDA'])
     */
    static async fetchAndCacheNews(tickers?: string[]): Promise<number> {
        console.log('[AVNews] Fetching news from Alpha Vantage...');

        try {
            // Call the proxy-market-data edge function which already has the API key
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token || '';
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

            // Build Alpha Vantage News Sentiment URL
            // The edge function already has MARKET_DATA_API_KEY, so we'll call AV directly
            // from the edge function by extending proxy-market-data or making a direct call
            const tickerParam = tickers && tickers.length > 0
                ? `&tickers=${tickers.slice(0, 5).join(',')}`  // AV limits to 5 tickers
                : '&topics=financial_markets,earnings,technology';

            // Use the proxy-market-data edge function to make the call (it has the API key)
            const res = await fetch(`${supabaseUrl}/functions/v1/proxy-market-data`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({
                    endpoint: 'news_sentiment',
                    tickerParam,
                }),
            });

            if (!res.ok) {
                console.warn(`[AVNews] Edge function returned ${res.status}`);
                return 0;
            }

            const data = await res.json();

            if (!data?.feed || !Array.isArray(data.feed)) {
                console.warn('[AVNews] No news feed returned from Alpha Vantage');
                return 0;
            }

            const articles: AVNewsFeedItem[] = data.feed;

            // Transform to rss_cache format and upsert
            const rows = articles.map((article) => {
                // Parse AV timestamp format: "20260303T120000" → ISO date
                let publishedAt: string;
                try {
                    const raw = article.time_published;
                    const isoStr = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`;
                    const d = new Date(isoStr);
                    publishedAt = !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
                } catch {
                    publishedAt = new Date().toISOString();
                }

                // Extract mentioned tickers
                const tickersMentioned = (article.ticker_sentiment || [])
                    .map(ts => ts.ticker)
                    .filter(t => !t.includes(':'));  // Filter out FOREX: and CRYPTO: prefixes

                // Build keywords from sentiment
                const keywords = [
                    article.overall_sentiment_label,
                    article.source,
                    ...(article.ticker_sentiment || []).map(ts => ts.ticker_sentiment_label),
                ].filter(Boolean);

                return {
                    feed_name: `AV: ${article.source}`,
                    feed_category: 'market_moving',
                    title: article.title,
                    link: article.url,
                    description: (article.summary || '').substring(0, 1000),
                    published_at: publishedAt,
                    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    tickers_mentioned: tickersMentioned,
                    keywords,
                };
            });

            if (rows.length > 0) {
                const { error } = await supabase.from('rss_cache').upsert(
                    rows as any[],
                    { onConflict: 'link' }
                );

                if (error) {
                    console.error('[AVNews] DB insert error:', error.message);
                    return 0;
                }
            }

            console.log(`[AVNews] Cached ${rows.length} news articles from Alpha Vantage.`);
            return rows.length;
        } catch (err) {
            console.warn('[AVNews] Failed to fetch news:', err);
            return 0;
        }
    }
}
