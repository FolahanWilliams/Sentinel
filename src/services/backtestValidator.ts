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

interface OutcomeRecord {
    outcome: string;
    signal_id: string;
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
}
