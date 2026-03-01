/**
 * Sentinel — Market Data Service
 *
 * All external requests go through our Edge Function proxy to protect API keys.
 * Includes a simple client-side memory cache to reduce duplicate Edge Function invocations
 * during massive scans.
 */

import { supabase } from '@/config/supabase';
import type { Quote } from '@/types/market';

// Simple in-memory cache for the client session (clears on reload)
// TTL: 15 minutes for basic quotes
const CACHE_TTL_MS = 15 * 60 * 1000;

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();

export class MarketDataService {
    /**
     * Fetch a quote for a specific ticker using the Edge Function proxy.
     */
    static async getQuote(ticker: string, forceRefresh = false): Promise<Quote> {
        const cacheKey = `quote_${ticker.toUpperCase()}`;

        // 1. Check Cache
        if (!forceRefresh) {
            const cached = cache.get(cacheKey);
            if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
                console.log(`[MarketData Cache Hit] ${ticker}`);
                return cached.data as Quote;
            }
        }

        // 2. Call Edge Function 
        console.log(`[MarketData Proxy Request] Fetching quote for ${ticker}...`);

        const { data, error } = await supabase.functions.invoke('proxy-market-data', {
            body: {
                endpoint: 'quote',
                ticker: ticker.toUpperCase()
            }
        });

        if (error) {
            throw new Error(`Market Data Proxy Error: ${error.message}`);
        }

        if (!data?.success || !data?.data) {
            throw new Error(data?.error || `Failed to fetch quote for ${ticker}`);
        }

        const quoteData = data.data as Quote;

        // 3. Update Cache
        cache.set(cacheKey, {
            data: quoteData,
            timestamp: Date.now()
        });

        return quoteData;
    }

    /**
     * Batch fetch quotes for a watchlist
     * Note: Could be optimized later with a bulk endpoint in the Edge Function, 
     * but for now we just `Promise.all` the individual Edge Function calls.
     */
    static async getQuotesBulk(tickers: string[]): Promise<Record<string, Quote>> {
        const results: Record<string, Quote> = {};

        // Process in small batches to avoid slamming the Edge Function concurrently
        const batchSize = 5;
        for (let i = 0; i < tickers.length; i += batchSize) {
            const batch = tickers.slice(i, i + batchSize);
            const promises = batch.map(async (ticker) => {
                try {
                    const q = await this.getQuote(ticker);
                    results[ticker] = q;
                } catch (e) {
                    console.warn(`[MarketDataService] Failed bulk fetch for ${ticker}`, e);
                }
            });

            await Promise.all(promises);
        }

        return results;
    }
}
