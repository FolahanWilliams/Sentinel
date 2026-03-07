/**
 * Sentinel — Price Correlation Matrix
 *
 * Adds cross-signal price correlation analysis on top of the sector-level
 * concentration checks in CorrelationGuard.  Uses rolling Pearson correlation
 * coefficients computed from 1-month historical closing prices to detect
 * hidden concentration risk between tickers that may belong to different
 * sectors but still move together.
 *
 * Integration point: call PriceCorrelationMatrix.check(ticker) before
 * accepting a new signal.  The returned confidencePenalty (0 to -15) should
 * be added to the signal's confidence score.
 *
 * The correlation matrix is cached in memory and refreshed every 30 minutes.
 */

import { supabase } from '@/config/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorrelationCheckResult {
    highlyCorrelatedTickers: Array<{ ticker: string; correlation: number }>;
    maxCorrelation: number;
    confidencePenalty: number; // 0 to -15
    reason: string;
}

interface HistoricalPrice {
    date: string;
    close: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class PriceCorrelationMatrix {
    // Correlation matrix cache: outer key = ticker A, inner key = ticker B
    private static correlationCache: Map<string, Map<string, number>> | null = null;
    private static cacheTimestamp = 0;
    private static readonly CACHE_TTL = 30 * 60 * 1000; // 30 min

    // Correlation threshold above which we consider tickers "highly correlated"
    private static readonly CORRELATION_THRESHOLD = 0.8;

    // Maximum confidence penalty applied when correlation is very high
    private static readonly MAX_PENALTY = -15;

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Build (or return cached) correlation matrix for the given tickers.
     *
     * For N tickers this fetches N historical price series and computes the
     * N x N pairwise Pearson correlation matrix.  Results are cached for
     * CACHE_TTL milliseconds.
     */
    static async buildMatrix(
        tickers: string[],
    ): Promise<Map<string, Map<string, number>>> {
        // Return cache if still valid and covers the requested tickers
        if (
            this.correlationCache &&
            Date.now() - this.cacheTimestamp < this.CACHE_TTL &&
            tickers.every(t => this.correlationCache!.has(t.toUpperCase()))
        ) {
            return this.correlationCache;
        }

        const normalized = [...new Set(tickers.map(t => t.toUpperCase()))];

        // Fetch historical prices in parallel
        const priceMap = new Map<string, number[]>();
        const results = await Promise.allSettled(
            normalized.map(async ticker => {
                const prices = await this.fetchHistoricalPrices(ticker);
                return { ticker, prices };
            }),
        );

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.prices.length > 0) {
                priceMap.set(result.value.ticker, result.value.prices);
            }
        }

        // Build the N x N matrix
        const matrix = new Map<string, Map<string, number>>();
        const available = [...priceMap.keys()];

        for (const a of available) {
            const row = new Map<string, number>();
            const pricesA = priceMap.get(a)!;

            for (const b of available) {
                if (a === b) {
                    row.set(b, 1);
                    continue;
                }

                const pricesB = priceMap.get(b)!;
                // Align series to the shorter length (most recent N days)
                const len = Math.min(pricesA.length, pricesB.length);
                if (len < 5) {
                    // Not enough data points for a meaningful correlation
                    row.set(b, 0);
                    continue;
                }

                const sliceA = pricesA.slice(pricesA.length - len);
                const sliceB = pricesB.slice(pricesB.length - len);
                row.set(b, this.pearsonCorrelation(sliceA, sliceB));
            }

            matrix.set(a, row);
        }

        // Update cache
        this.correlationCache = matrix;
        this.cacheTimestamp = Date.now();

        console.log(
            `[PriceCorrelationMatrix] Built ${available.length}x${available.length} matrix`,
        );

        return matrix;
    }

    /**
     * Check a proposed signal ticker against all currently active signal
     * tickers.  Returns the list of highly-correlated tickers and a
     * confidence penalty.
     */
    static async check(ticker: string): Promise<CorrelationCheckResult> {
        const upperTicker = ticker.toUpperCase();

        try {
            // 1. Fetch active signal tickers from the database
            const { data: activeSignals } = await supabase
                .from('signals')
                .select('ticker')
                .eq('status', 'active');

            const activeTickers = [
                ...new Set(
                    (activeSignals || [])
                        .map(s => (s.ticker as string).toUpperCase())
                        .filter(t => t !== upperTicker),
                ),
            ];

            if (activeTickers.length === 0) {
                return {
                    highlyCorrelatedTickers: [],
                    maxCorrelation: 0,
                    confidencePenalty: 0,
                    reason: 'No other active signals to correlate against.',
                };
            }

            // 2. Build / refresh the correlation matrix including the new ticker
            const allTickers = [...activeTickers, upperTicker];
            const matrix = await this.buildMatrix(allTickers);

            // 3. Look up correlations for the proposed ticker
            const row = matrix.get(upperTicker);
            if (!row) {
                return {
                    highlyCorrelatedTickers: [],
                    maxCorrelation: 0,
                    confidencePenalty: 0,
                    reason: `No historical price data available for ${upperTicker}.`,
                };
            }

            const highlyCorrelated: Array<{ ticker: string; correlation: number }> = [];
            let maxCorrelation = 0;

            for (const other of activeTickers) {
                const corr = row.get(other);
                if (corr === undefined) continue;
                const absCorr = Math.abs(corr);
                if (absCorr > maxCorrelation) maxCorrelation = absCorr;
                if (absCorr > this.CORRELATION_THRESHOLD) {
                    highlyCorrelated.push({
                        ticker: other,
                        correlation: parseFloat(corr.toFixed(4)),
                    });
                }
            }

            // Sort by absolute correlation descending
            highlyCorrelated.sort(
                (a, b) => Math.abs(b.correlation) - Math.abs(a.correlation),
            );

            // 4. Compute penalty
            const penalty = this.computePenalty(highlyCorrelated, maxCorrelation);

            // 5. Build reason string
            let reason: string;
            if (highlyCorrelated.length === 0) {
                reason = `${upperTicker} has low price correlation with active signals (max r=${maxCorrelation.toFixed(2)}). No hidden concentration risk.`;
            } else {
                const pairs = highlyCorrelated
                    .map(h => `${h.ticker} (r=${h.correlation})`)
                    .join(', ');
                reason = `${upperTicker} is highly correlated with active signal(s): ${pairs}. Applying ${penalty} confidence penalty for hidden concentration risk.`;
            }

            return {
                highlyCorrelatedTickers: highlyCorrelated,
                maxCorrelation: parseFloat(maxCorrelation.toFixed(4)),
                confidencePenalty: penalty,
                reason,
            };
        } catch (err) {
            console.error('[PriceCorrelationMatrix] Check failed:', err);
            // Fail open — don't block signals if correlation check errors out
            return {
                highlyCorrelatedTickers: [],
                maxCorrelation: 0,
                confidencePenalty: 0,
                reason: 'Price correlation check failed — skipping.',
            };
        }
    }

    /**
     * Invalidate the cached correlation matrix (e.g. when watchlist changes).
     */
    static invalidateCache(): void {
        this.correlationCache = null;
        this.cacheTimestamp = 0;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Pearson correlation coefficient between two equal-length numeric arrays.
     *
     * r = Σ((xi - x̄)(yi - ȳ)) / √(Σ(xi - x̄)² · Σ(yi - ȳ)²)
     *
     * Returns 0 if standard deviation of either series is 0 (constant prices).
     */
    private static pearsonCorrelation(x: number[], y: number[]): number {
        const n = x.length;
        if (n === 0) return 0;

        // Means
        let sumX = 0;
        let sumY = 0;
        for (let i = 0; i < n; i++) {
            sumX += x[i]!;
            sumY += y[i]!;
        }
        const meanX = sumX / n;
        const meanY = sumY / n;

        // Covariance and standard deviations
        let cov = 0;
        let varX = 0;
        let varY = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i]! - meanX;
            const dy = y[i]! - meanY;
            cov += dx * dy;
            varX += dx * dx;
            varY += dy * dy;
        }

        const denom = Math.sqrt(varX * varY);
        if (denom === 0) return 0;

        return cov / denom;
    }

    /**
     * Fetch historical daily closing prices for a ticker via the
     * proxy-market-data Edge Function.  Returns an array of closing prices
     * ordered oldest-to-newest.
     */
    private static async fetchHistoricalPrices(
        ticker: string,
    ): Promise<number[]> {
        try {
            const { data, error } = await supabase.functions.invoke(
                'proxy-market-data',
                {
                    body: {
                        endpoint: 'historical',
                        ticker: ticker.toUpperCase(),
                        range: '1mo',
                    },
                },
            );

            if (error || !data?.success || !data?.data) {
                console.warn(
                    `[PriceCorrelationMatrix] Historical price fetch failed for ${ticker}:`,
                    error || data?.error,
                );
                return [];
            }

            // Expect data.data to be an array of { date, close, ... } objects
            const prices: HistoricalPrice[] = data.data;
            if (!Array.isArray(prices)) {
                console.warn(
                    `[PriceCorrelationMatrix] Unexpected historical data format for ${ticker}`,
                );
                return [];
            }

            // Sort by date ascending and extract closing prices
            return prices
                .filter(p => p.close != null && !isNaN(p.close))
                .sort((a, b) => a.date.localeCompare(b.date))
                .map(p => p.close);
        } catch (err) {
            console.error(
                `[PriceCorrelationMatrix] Error fetching historical prices for ${ticker}:`,
                err,
            );
            return [];
        }
    }

    /**
     * Compute a confidence penalty (0 to -15) based on how many active
     * signals are highly correlated and how strong the correlations are.
     *
     * Scale:
     * - 1 highly correlated ticker, r ~ 0.8:  -5
     * - 1 highly correlated ticker, r ~ 0.95: -10
     * - 2+ highly correlated tickers:         -10 to -15
     */
    private static computePenalty(
        highlyCorrelated: Array<{ ticker: string; correlation: number }>,
        maxCorrelation: number,
    ): number {
        if (highlyCorrelated.length === 0) return 0;

        // Base penalty scaled by correlation strength above threshold
        // Maps correlation 0.8 -> 0, 1.0 -> 1.0
        const strengthFactor = Math.min(
            1,
            (maxCorrelation - this.CORRELATION_THRESHOLD) /
                (1 - this.CORRELATION_THRESHOLD),
        );

        // Base penalty: -5 to -10 based on strength
        let penalty = -5 - Math.round(strengthFactor * 5);

        // Additional penalty for multiple highly correlated positions
        if (highlyCorrelated.length >= 3) {
            penalty -= 5;
        } else if (highlyCorrelated.length >= 2) {
            penalty -= 3;
        }

        // Clamp to max penalty
        return Math.max(this.MAX_PENALTY, penalty);
    }
}
