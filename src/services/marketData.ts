/**
 * Sentinel — Market Data Service
 *
 * All external requests go through our Edge Function proxy to protect API keys.
 * Includes a simple client-side memory cache to reduce duplicate Edge Function invocations
 * during massive scans.
 */

import { supabase } from '@/config/supabase';
import type { Quote, NewsItem, FundamentalData } from '@/types/market';

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
    // Uses a queue promise to serialize concurrent calls and prevent thundering herd
    private static throttleQueue: Promise<void> = Promise.resolve();
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
                // Cache hit — skip network call
                return cached.data as Quote;
            }
        }

        // Throttle: chain onto queue to serialize concurrent calls
        await (this.throttleQueue = this.throttleQueue.then(
            () => new Promise(res => setTimeout(res, this.MIN_CALL_INTERVAL_MS))
        ));

        // 2. Call Edge Function 
        // Fetch quote via Edge Function proxy

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

            // Yahoo Finance returns LSE (.L) prices in GBX (pence).
            // Normalize to GBP (pounds) to match entry prices stored from HL import.
            if (ticker.toUpperCase().endsWith('.L') && quoteData.price != null) {
                quoteData.price = quoteData.price / 100;
                // Keep high/low consistent if present
                if ((quoteData as any).dayHigh != null) (quoteData as any).dayHigh /= 100;
                if ((quoteData as any).dayLow != null) (quoteData as any).dayLow /= 100;
                if ((quoteData as any).previousClose != null) (quoteData as any).previousClose /= 100;
            }

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
            // Return stale cached data if available and not too old (max 15 min)
            const stale = cache.get(cacheKey);
            const MAX_STALE_AGE_MS = 15 * 60 * 1000;
            if (stale && (Date.now() - stale.timestamp < MAX_STALE_AGE_MS)) {
                const ageMinutes = ((Date.now() - stale.timestamp) / 60000).toFixed(1);
                console.warn(`[MarketDataService] Returning stale cache for ${ticker} (age: ${ageMinutes}min) after fetch failure`);
                return stale.data as Quote;
            }
            if (stale) {
                console.warn(`[MarketDataService] Stale cache for ${ticker} too old (>${MAX_STALE_AGE_MS / 60000}min), not returning`);
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
            // All tickers served from cache
            return results;
        }

        // Fetch cache misses via bulk endpoint

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
                    if (quoteData && quoteData.price != null) {
                        const quote = quoteData as Quote;
                        // Normalize LSE pence → pounds
                        if (key.endsWith('.L') && quote.price != null) {
                            quote.price = quote.price / 100;
                            if ((quote as any).dayHigh != null) (quote as any).dayHigh /= 100;
                            if ((quote as any).dayLow != null) (quote as any).dayLow /= 100;
                            if ((quote as any).previousClose != null) (quote as any).previousClose /= 100;
                        }
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
     * Fetch fundamental data for a ticker via Gemini grounded search.
     * Returns P/E, market cap, debt/equity, revenue growth, etc.
     * Cached for 24 hours — fundamentals don't change intraday.
     */
    static async getFundamentals(ticker: string): Promise<FundamentalData | null> {
        const cacheKey = `fundamentals_${ticker.toUpperCase()}`;
        const FUNDAMENTALS_TTL = 24 * 60 * 60 * 1000; // 24 hours

        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < FUNDAMENTALS_TTL)) {
            return cached.data as FundamentalData;
        }

        try {
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    prompt: `Look up current financial fundamentals for ${ticker.toUpperCase()} as of ${today}. Return ONLY a JSON object with these fields (use null if unavailable): {"ticker": "${ticker.toUpperCase()}", "pe_ratio": number, "pe_sector_avg": number, "debt_to_equity": number, "profit_margin": number, "revenue_ttm": number, "revenue_growth_yoy": number, "eps": number, "week_52_high": number, "week_52_low": number, "avg_volume": number, "beta": number, "dividend_yield": number, "short_interest_pct": number, "institutional_ownership_pct": number, "next_earnings_date": "YYYY-MM-DD" or null}`,
                    systemInstruction: 'You are a financial data assistant. Return ONLY valid JSON with no markdown. Use real current data.',
                    requireGroundedSearch: true,
                    temperature: 0.1,
                },
            });

            if (error || !data?.text) {
                console.warn(`[MarketData] Fundamentals fetch failed for ${ticker}:`, error);
                return null;
            }

            let parsed: any;
            try {
                const jsonText = data.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText);
            } catch {
                console.warn(`[MarketData] Failed to parse fundamentals for ${ticker}`);
                return null;
            }

            const fundamentals: FundamentalData = {
                ticker: ticker.toUpperCase(),
                revenue_ttm: parsed.revenue_ttm ?? null,
                revenue_growth_yoy: parsed.revenue_growth_yoy ?? null,
                eps: parsed.eps ?? null,
                pe_ratio: parsed.pe_ratio ?? null,
                pe_sector_avg: parsed.pe_sector_avg ?? null,
                debt_to_equity: parsed.debt_to_equity ?? null,
                profit_margin: parsed.profit_margin ?? null,
                week_52_high: parsed.week_52_high ?? null,
                week_52_low: parsed.week_52_low ?? null,
                avg_volume: parsed.avg_volume ?? null,
                beta: parsed.beta ?? null,
                dividend_yield: parsed.dividend_yield ?? null,
                short_interest_pct: parsed.short_interest_pct ?? null,
                institutional_ownership_pct: parsed.institutional_ownership_pct ?? null,
                next_earnings_date: parsed.next_earnings_date ?? null,
                updated_at: new Date(),
            };



            cache.set(cacheKey, { data: fundamentals, timestamp: Date.now() });
            return fundamentals;
        } catch (err) {
            console.error(`[MarketData] Fundamentals error for ${ticker}:`, err);
            return null;
        }
    }

    /**
     * Format fundamental data as a text block for agent prompts.
     */
    static formatFundamentalsForPrompt(data: FundamentalData | null): string {
        if (!data) return '';
        const lines = ['\nFUNDAMENTAL DATA:'];
        if (data.pe_ratio != null) lines.push(`- P/E Ratio: ${data.pe_ratio}${data.pe_sector_avg != null ? ` (sector avg: ${data.pe_sector_avg})` : ''}`);
        if (data.eps != null) lines.push(`- EPS: $${data.eps}`);
        if (data.debt_to_equity != null) lines.push(`- Debt/Equity: ${data.debt_to_equity}${data.debt_to_equity > 2 ? ' ⚠ HIGH LEVERAGE' : ''}`);
        if (data.profit_margin != null) lines.push(`- Profit Margin: ${(data.profit_margin * 100).toFixed(1)}%${data.profit_margin < 0 ? ' ⚠ NEGATIVE MARGINS' : ''}`);
        if (data.revenue_growth_yoy != null) lines.push(`- Revenue Growth (YoY): ${(data.revenue_growth_yoy * 100).toFixed(1)}%`);
        if (data.beta != null) lines.push(`- Beta: ${data.beta}`);
        if (data.short_interest_pct != null) lines.push(`- Short Interest: ${data.short_interest_pct}%${data.short_interest_pct > 20 ? ' ⚠ HIGH SHORT INTEREST' : ''}`);
        if (data.institutional_ownership_pct != null) lines.push(`- Institutional Ownership: ${data.institutional_ownership_pct}%`);
        lines.push('Use fundamental data to validate signal thesis. High debt, negative margins, or extreme P/E should lower confidence.');
        return lines.join('\n');
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
