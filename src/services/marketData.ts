/**
 * Sentinel — Market Data Service
 *
 * All external requests go through our Edge Function proxy to protect API keys.
 * Includes a simple client-side memory cache to reduce duplicate Edge Function invocations
 * during massive scans.
 */

import { supabase } from '@/config/supabase';
import type { Quote, NewsItem } from '@/types/market';

// Simple in-memory cache for the client session (clears on reload)
// TTL: 2 minutes for quotes — keeps data reasonably fresh for a trading platform
const CACHE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();

export class MarketDataService {
    // Throttle: enforce minimum 500ms between Edge Function calls for market data
    private static lastScheduledTime = 0;
    private static readonly MIN_CALL_INTERVAL_MS = 500;

    /**
     * Fetch a quote for a specific ticker using the Edge Function proxy.
     */
    static async getQuote(ticker: string, forceRefresh = false, retryCount = 0): Promise<Quote> {
        const cacheKey = `quote_${ticker.toUpperCase()}`;

        // 1. Check Cache
        if (!forceRefresh) {
            const cached = cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
                console.log(`[MarketData Cache Hit] ${ticker}`);
                return cached.data as Quote;
            }
        }

        // Throttle: properly queue concurrent calls
        const now = Date.now();
        const scheduledTime = Math.max(now, this.lastScheduledTime + this.MIN_CALL_INTERVAL_MS);
        this.lastScheduledTime = scheduledTime;

        const delay = scheduledTime - now;
        if (delay > 0) {
            await new Promise(res => setTimeout(res, delay));
        }

        // 2. Call Edge Function 
        console.log(`[MarketData Proxy Request] Fetching quote for ${ticker}...`);

        try {
            const { data, error } = await supabase.functions.invoke('proxy-market-data', {
                body: {
                    endpoint: 'quote',
                    ticker: ticker.toUpperCase()
                }
            });

            if (error) {
                console.error(`[MarketData Proxy Request] Failed to invoke proxy edge function for ${ticker}:`, error);
                throw new Error(`Market Data Proxy Error: ${error.message}`);
            }

            if (!data?.success || !data?.data) {
                console.error(`[MarketData Proxy Request] Edge function returned an error for ${ticker}:`, data);
                throw new Error(data?.error || `Failed to fetch quote for ${ticker}`);
            }

            const quoteData = data.data as Quote;

            // 3. Update Cache
            cache.set(cacheKey, {
                data: quoteData,
                timestamp: Date.now()
            });

            return quoteData;
        } catch (e) {
            if (retryCount < 2) {
                console.warn(`[MarketDataService] Retrying fetch for ${ticker} (attempt ${retryCount + 1})...`);
                await new Promise(res => setTimeout(res, 1000 + retryCount * 1000)); // Exponential backoff
                return this.getQuote(ticker, forceRefresh, retryCount + 1);
            }
            // Return stale cached data if available (prevents 0-value flicker in UI)
            const stale = cache.get(cacheKey);
            if (stale) {
                console.warn(`[MarketDataService] Returning stale cache for ${ticker} after fetch failure`);
                return stale.data as Quote;
            }
            throw e;
        }
    }

    /**
     * Batch fetch quotes for multiple tickers in a single Edge Function call.
     * Uses the bulk_quote endpoint to reduce latency from N calls to 1.
     * Falls back to sequential getQuote calls if bulk fails.
     */
    static async getQuotesBulk(tickers: string[]): Promise<Record<string, Quote>> {
        if (tickers.length === 0) return {};

        // Separate cache hits from misses
        const results: Record<string, Quote> = {};
        const cacheMisses: string[] = [];

        for (const ticker of tickers) {
            const cacheKey = `quote_${ticker.toUpperCase()}`;
            const cached = cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
                results[ticker] = cached.data as Quote;
            } else {
                cacheMisses.push(ticker);
            }
        }

        if (cacheMisses.length === 0) {
            console.log(`[MarketData] Bulk quotes: all ${tickers.length} from cache`);
            return results;
        }

        console.log(`[MarketData] Bulk fetching ${cacheMisses.length} quotes (${tickers.length - cacheMisses.length} cached)`);

        try {
            const { data, error } = await supabase.functions.invoke('proxy-market-data', {
                body: {
                    endpoint: 'bulk_quote',
                    tickers: cacheMisses.map(t => t.toUpperCase()),
                }
            });

            if (error) {
                throw new Error(`Bulk quote proxy error: ${error.message}`);
            }

            if (data?.success && data?.data) {
                const bulkData = data.data as Record<string, any>;
                for (const ticker of cacheMisses) {
                    const key = ticker.toUpperCase();
                    const quoteData = bulkData[key];
                    if (quoteData && quoteData.price) {
                        const quote = quoteData as Quote;
                        results[ticker] = quote;
                        cache.set(`quote_${key}`, { data: quote, timestamp: Date.now() });
                    }
                }
            }

            return results;
        } catch (e) {
            console.warn('[MarketDataService] Bulk fetch failed, falling back to sequential:', e);

            // Fallback: sequential fetch for remaining misses
            for (const ticker of cacheMisses) {
                if (results[ticker]) continue;
                try {
                    const q = await this.getQuote(ticker);
                    results[ticker] = q;
                } catch (err) {
                    console.warn(`[MarketDataService] Sequential fallback failed for ${ticker}`, err);
                }
            }

            return results;
        }
    }

    /**
     * Fetch recent news for a ticker via the Apify yahoo-finance-news-ai actor.
     * Uses the same proxy-market-data Edge Function with endpoint='news'.
     */
    static async getTickerNews(ticker: string): Promise<NewsItem[]> {
        const cacheKey = `news_${ticker.toUpperCase()}`;

        // Check cache (5 min TTL for news)
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
            return cached.data as NewsItem[];
        }

        try {
            const { data, error } = await supabase.functions.invoke('proxy-market-data', {
                body: {
                    endpoint: 'news',
                    ticker: ticker.toUpperCase(),
                }
            });

            if (error || !data?.success) {
                console.warn(`[MarketDataService] News fetch failed for ${ticker}:`, error || data?.error);
                return [];
            }

            const newsItems: NewsItem[] = data.data || [];

            cache.set(cacheKey, { data: newsItems, timestamp: Date.now() });
            return newsItems;
        } catch (err) {
            console.error(`[MarketDataService] News error for ${ticker}:`, err);
            return [];
        }
    }
}
