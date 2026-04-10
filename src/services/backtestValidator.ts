/**
 * Sentinel — Backtest Validation Framework
 *
 * Validates new signals against historical outcome patterns before surfacing them.
 * If a signal type has a poor track record (<40% win rate over last N outcomes),
 * it gets automatically suppressed or penalized.
 *
 * Also checks ticker-specific performance: if we've lost 3+ times on a ticker,
 * apply extra skepticism.
 *
 * Data source: signal_outcomes table (already populated by OutcomeTracker).
 *
 * Cache: Results cached for 10 minutes since outcome data changes slowly.
 *
 * DYNAMIC THRESHOLDS: This module now calibrates confidence thresholds based on
 * actual historical win rates by signal type and timeframe.
 */

import { supabase } from '@/config/supabase';

export interface BacktestResult {
    signalTypeWinRate: number | null;
    signalTypeSampleSize: number;
    tickerWinRate: number | null;
    tickerSampleSize: number;
    tickerConsecutiveLosses: number;
    confidencePenalty: number;
    shouldSuppress: boolean;
    reason: string;
}

export interface TimeframeWinRates {
    winRate5d: number | null;
    winRate10d: number | null;
    winRate30d: number | null;
    sampleSize5d: number;
    sampleSize10d: number;
    sampleSize30d: number;
}

export interface DynamicThresholds {
    recommendedMinConfidence: number;
    recommendedMinPriceDropPct: number;
    signalTypeWinRate: number | null;
    timeframeWinRates: TimeframeWinRates;
    source: 'historical' | 'default' | 'insufficient_data';
    reason: string;
}

interface OutcomeRecord {
    outcome: string;
    signal_id: string;
    return_at_5d: number | null;
    return_at_10d: number | null;
    return_at_30d: number | null;
    signals: {
        signal_type: string;
        ticker: string;
        created_at: string;
    } | null;
}

// Cache outcomes to avoid repeated DB hits during a scan cycle
let cachedOutcomes: OutcomeRecord[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export class BacktestValidator {

    /**
     * Refresh the outcome cache.
     */
    private static async getOutcomes(): Promise<OutcomeRecord[]> {
        if (cachedOutcomes && (Date.now() - cacheTimestamp) < CACHE_TTL) {
            return cachedOutcomes;
        }

        const { data } = await supabase
            .from('signal_outcomes')
            .select('outcome, signal_id, signals!inner(signal_type, ticker, created_at)')
            .neq('outcome', 'pending')
            .order('completed_at', { ascending: false })
            .limit(300);

        cachedOutcomes = (data as unknown as OutcomeRecord[]) || [];
        cacheTimestamp = Date.now();
        return cachedOutcomes;
    }

    /**
     * Validate a proposed signal against historical backtest data.
     * Returns confidence penalty and suppression recommendation.
     */
    static async validate(
        signalType: string,
        ticker: string,
    ): Promise<BacktestResult> {
        const noData: BacktestResult = {
            signalTypeWinRate: null,
            signalTypeSampleSize: 0,
            tickerWinRate: null,
            tickerSampleSize: 0,
            tickerConsecutiveLosses: 0,
            confidencePenalty: 0,
            shouldSuppress: false,
            reason: 'Insufficient historical data for backtest validation.',
        };

        try {
            const outcomes = await this.getOutcomes();
            if (outcomes.length < 5) return noData;

            let penalty = 0;
            let shouldSuppress = false;
            const reasons: string[] = [];

            // 1. Signal type win rate (last 50 outcomes of this type)
            const typeOutcomes = outcomes
                .filter(o => o.signals?.signal_type === signalType)
                .slice(0, 50);
            let signalTypeWinRate: number | null = null;

            if (typeOutcomes.length >= 5) {
                const wins = typeOutcomes.filter(o => o.outcome === 'win').length;
                signalTypeWinRate = wins / typeOutcomes.length;

                if (signalTypeWinRate < 0.3) {
                    shouldSuppress = true;
                    penalty -= 25;
                    reasons.push(`Signal type "${signalType}" has ${(signalTypeWinRate * 100).toFixed(0)}% win rate (n=${typeOutcomes.length}) — SUPPRESSED.`);
                } else if (signalTypeWinRate < 0.4) {
                    penalty -= 15;
                    reasons.push(`Signal type "${signalType}" has ${(signalTypeWinRate * 100).toFixed(0)}% win rate (n=${typeOutcomes.length}) — below 40% threshold.`);
                } else if (signalTypeWinRate >= 0.6) {
                    // Bonus for high-performing signal types
                    penalty += 5;
                    reasons.push(`Signal type "${signalType}" has ${(signalTypeWinRate * 100).toFixed(0)}% win rate (n=${typeOutcomes.length}) — above average.`);
                }
            }

            // 2. Ticker-specific performance
            const tickerOutcomes = outcomes
                .filter(o => o.signals?.ticker === ticker)
                .slice(0, 20);
            let tickerWinRate: number | null = null;
            let consecutiveLosses = 0;

            if (tickerOutcomes.length >= 3) {
                const wins = tickerOutcomes.filter(o => o.outcome === 'win').length;
                tickerWinRate = wins / tickerOutcomes.length;

                // Count consecutive recent losses
                for (const o of tickerOutcomes) {
                    if (o.outcome === 'loss') consecutiveLosses++;
                    else break;
                }

                if (consecutiveLosses >= 3) {
                    penalty -= 15;
                    reasons.push(`${ticker} has ${consecutiveLosses} consecutive losses — pattern may not work for this stock.`);
                } else if (tickerWinRate < 0.3 && tickerOutcomes.length >= 5) {
                    penalty -= 10;
                    reasons.push(`${ticker} has ${(tickerWinRate * 100).toFixed(0)}% win rate (n=${tickerOutcomes.length}).`);
                }
            }

            if (reasons.length === 0) {
                reasons.push('Backtest validation passed — no adverse patterns detected.');
            }

            return {
                signalTypeWinRate,
                signalTypeSampleSize: typeOutcomes.length,
                tickerWinRate,
                tickerSampleSize: tickerOutcomes.length,
                tickerConsecutiveLosses: consecutiveLosses,
                confidencePenalty: penalty,
                shouldSuppress,
                reason: reasons.join(' '),
            };
        } catch (err) {
            console.error('[BacktestValidator] Error:', err);
            return noData;
        }
    }

    /**
     * Invalidate cache (call after new outcomes are recorded).
     */
    static invalidateCache(): void {
        cachedOutcomes = null;
        cacheTimestamp = 0;
    }

    /**
     * Calculate timeframe-specific win rates for a signal type.
     */
    static async getTimeframeWinRates(signalType: string): Promise<TimeframeWinRates> {
        const noData: TimeframeWinRates = {
            winRate5d: null,
            winRate10d: null,
            winRate30d: null,
            sampleSize5d: 0,
            sampleSize10d: 0,
            sampleSize30d: 0,
        };

        try {
            const outcomes = await this.getOutcomes();
            const typeOutcomes = outcomes.filter(o => o.signals?.signal_type === signalType);

            if (typeOutcomes.length < 3) return noData;

            const validateReturn = (ret: number | null): boolean => ret !== null && ret > 0;

            const has5d = typeOutcomes.filter(o => o.return_at_5d !== null);
            const wins5d = has5d.filter(o => validateReturn(o.return_at_5d));
            const sampleSize5d = has5d.length;

            const has10d = typeOutcomes.filter(o => o.return_at_10d !== null);
            const wins10d = has10d.filter(o => validateReturn(o.return_at_10d));
            const sampleSize10d = has10d.length;

            const has30d = typeOutcomes.filter(o => o.return_at_30d !== null);
            const wins30d = has30d.filter(o => validateReturn(o.return_at_30d));
            const sampleSize30d = has30d.length;

            return {
                winRate5d: sampleSize5d >= 3 ? wins5d.length / sampleSize5d : null,
                winRate10d: sampleSize10d >= 3 ? wins10d.length / sampleSize10d : null,
                winRate30d: sampleSize30d >= 3 ? wins30d.length / sampleSize30d : null,
                sampleSize5d,
                sampleSize10d,
                sampleSize30d,
            };
        } catch (err) {
            console.error('[BacktestValidator] getTimeframeWinRates error:', err);
            return noData;
        }
    }

    /**
     * Calculate dynamic thresholds based on historical performance by signal type.
     *
     * Key insight: If a signal type wins 55% at 5d but only 35% at 30d,
     * we should recommend a tighter holding period and higher confidence threshold
     * for longer holds.
     */
    static async getDynamicThresholds(
        signalType: string,
        defaultMinConfidence: number = 60,
        defaultMinPriceDropPct: number = -5,
    ): Promise<DynamicThresholds> {
        const timeframeWinRates = await this.getTimeframeWinRates(signalType);

        if (
            !timeframeWinRates.winRate5d &&
            !timeframeWinRates.winRate10d &&
            !timeframeWinRates.winRate30d
        ) {
            return {
                recommendedMinConfidence: defaultMinConfidence,
                recommendedMinPriceDropPct: defaultMinPriceDropPct,
                signalTypeWinRate: null,
                timeframeWinRates,
                source: 'insufficient_data',
                reason: `Insufficient historical data for ${signalType} — using defaults.`,
            };
        }

        const wr5d = timeframeWinRates.winRate5d ?? 0.5;
        const wr10d = timeframeWinRates.winRate10d ?? 0.5;
        const wr30d = timeframeWinRates.winRate30d ?? 0.5;

        const avgWinRate = (wr5d + wr10d + wr30d) / 3;

        let recommendedMinConfidence = defaultMinConfidence;
        let recommendedMinPriceDropPct = defaultMinPriceDropPct;
        let reason = '';

        if (avgWinRate >= 0.6) {
            recommendedMinConfidence = Math.max(50, defaultMinConfidence - 5);
            recommendedMinPriceDropPct = Math.min(-3, defaultMinPriceDropPct + 1);
            reason = `High win rate (${(avgWinRate * 100).toFixed(0)}% avg) — relaxed thresholds.`;
        } else if (avgWinRate >= 0.5) {
            reason = `Moderate win rate (${(avgWinRate * 100).toFixed(0)}% avg) — using defaults.`;
        } else if (avgWinRate >= 0.4) {
            recommendedMinConfidence = Math.min(75, defaultMinConfidence + 10);
            recommendedMinPriceDropPct = Math.max(-8, defaultMinPriceDropPct - 2);
            reason = `Low win rate (${(avgWinRate * 100).toFixed(0)}% avg) — tightened thresholds.`;
        } else {
            recommendedMinConfidence = 80;
            recommendedMinPriceDropPct = -10;
            reason = `Poor win rate (${(avgWinRate * 100).toFixed(0)}% avg) — very tightened thresholds.`;
        }

        const bestTimeframe =
            (timeframeWinRates.winRate5d ?? 0) >= (timeframeWinRates.winRate10d ?? 0) &&
            (timeframeWinRates.winRate5d ?? 0) >= (timeframeWinRates.winRate30d ?? 0)
                ? '5d'
                : (timeframeWinRates.winRate10d ?? 0) >= (timeframeWinRates.winRate30d ?? 0)
                  ? '10d'
                  : '30d';

        reason += ` Best timeframe: ${bestTimeframe}.`;

        return {
            recommendedMinConfidence,
            recommendedMinPriceDropPct,
            signalTypeWinRate: avgWinRate > 0 ? avgWinRate : null,
            timeframeWinRates,
            source: 'historical',
            reason,
        };
    }
}
