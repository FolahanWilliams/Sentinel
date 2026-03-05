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
// TTL: 15 minutes for basic quotes
const CACHE_TTL_MS = 15 * 60 * 1000;

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
     * Batch fetch quotes for a watchlist
     * Note: Changed to process sequentially with throttling to prevent 502s
     * from upstream rate limiting.
     */
    static async getQuotesBulk(tickers: string[]): Promise<Record<string, Quote>> {
        const results: Record<string, Quote> = {};

        // Process sequentially to be gentle on the proxy and upstream providers
        for (const ticker of tickers) {
            try {
                const q = await this.getQuote(ticker);
                results[ticker] = q;
            } catch (e) {
                console.warn(`[MarketDataService] Failed bulk fetch for ${ticker}`, e);
            }
        }

        return results;
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
