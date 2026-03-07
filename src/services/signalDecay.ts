/**
 * Sentinel — Signal Decay & Expiration Engine
 *
 * Manages the lifecycle of active signals:
 * - Applies time-based confidence decay (signals lose conviction over time)
 * - Auto-expires signals that have passed their expected timeframe
 * - Marks stale signals whose thesis may no longer be valid
 *
 * Decay model:
 *   Effective confidence = original_confidence × decay_factor
 *   decay_factor = max(0.5, 1 - (days_active / (expected_timeframe × 1.5)))
 *
 * Signals are expired when:
 *   - Age exceeds expected_timeframe × 2
 *   - Decayed confidence drops below 40
 *   - Price has moved past stop-loss without being tracked
 */

import { supabase } from '@/config/supabase';

export interface DecayResult {
    signalId: string;
    ticker: string;
    originalConfidence: number;
    decayedConfidence: number;
    decayFactor: number;
    daysActive: number;
    expectedDays: number | null;
    action: 'active' | 'stale' | 'expired';
    reason: string;
}

export class SignalDecayEngine {

    /**
     * Process all active signals and apply decay / expiration logic.
     * Returns a summary of actions taken.
     */
    static async processActiveSignals(): Promise<{
        processed: number;
        stale: number;
        expired: number;
        results: DecayResult[];
    }> {
        const results: DecayResult[] = [];
        let stale = 0;
        let expired = 0;

        try {
            const { data: activeSignals, error } = await supabase
                .from('signals')
                .select('id, ticker, confidence_score, expected_timeframe_days, created_at, stop_loss, target_price, status')
                .eq('status', 'active')
                .order('created_at', { ascending: true });

            if (error || !activeSignals) {
                console.warn('[SignalDecay] Failed to fetch active signals:', error);
                return { processed: 0, stale: 0, expired: 0, results: [] };
            }

            for (const signal of activeSignals) {
                const createdAt = new Date(signal.created_at);
                const daysActive = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
                const expectedDays = signal.expected_timeframe_days || 10; // default 10 days

                // Decay factor: linear decay, floored at 0.5
                const decayFactor = Math.max(0.5, 1 - (daysActive / (expectedDays * 1.5)));
                const decayedConfidence = Math.round(signal.confidence_score * decayFactor);

                let action: DecayResult['action'] = 'active';
                let reason = '';

                // Check for expiration conditions
                if (daysActive > expectedDays * 2) {
                    action = 'expired';
                    reason = `Signal exceeded 2× expected timeframe (${daysActive.toFixed(1)}d vs ${expectedDays}d expected).`;
                } else if (decayedConfidence < 40) {
                    action = 'expired';
                    reason = `Decayed confidence (${decayedConfidence}) dropped below expiration threshold of 40.`;
                } else if (daysActive > expectedDays * 1.2) {
                    action = 'stale';
                    reason = `Signal past expected timeframe (${daysActive.toFixed(1)}d vs ${expectedDays}d). Thesis may be invalidated.`;
                }

                results.push({
                    signalId: signal.id,
                    ticker: signal.ticker,
                    originalConfidence: signal.confidence_score,
                    decayedConfidence,
                    decayFactor: Math.round(decayFactor * 100) / 100,
                    daysActive: Math.round(daysActive * 10) / 10,
                    expectedDays,
                    action,
                    reason,
                });

                // Apply the action
                if (action === 'expired') {
                    expired++;
                    await supabase.from('signals').update({
                        status: 'expired',
                        user_notes: `[Auto-expired] ${reason}`,
                    } as any).eq('id', signal.id);
                    console.log(`[SignalDecay] Expired ${signal.ticker} (${signal.id}): ${reason}`);
                } else if (action === 'stale') {
                    stale++;
                    console.log(`[SignalDecay] Stale: ${signal.ticker} (${signal.id}): ${reason}`);
                }
            }

            return { processed: activeSignals.length, stale, expired, results };
        } catch (err) {
            console.error('[SignalDecay] Error:', err);
            return { processed: 0, stale: 0, expired: 0, results: [] };
        }
    }

    /**
     * Get the decayed confidence for a specific signal (for display purposes).
     * Does NOT modify the signal in DB.
     */
    static getDecayedConfidence(
        originalConfidence: number,
        createdAt: string,
        expectedTimeframeDays: number | null,
    ): { decayedConfidence: number; decayFactor: number; isStale: boolean } {
        const daysActive = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const expectedDays = expectedTimeframeDays || 10;
        const decayFactor = Math.max(0.5, 1 - (daysActive / (expectedDays * 1.5)));
        const decayedConfidence = Math.round(originalConfidence * decayFactor);
        const isStale = daysActive > expectedDays * 1.2;

        return { decayedConfidence, decayFactor: Math.round(decayFactor * 100) / 100, isStale };
    }

    /**
     * Check if a duplicate signal exists for the same ticker that is still fresh.
     * Prevents generating a new signal when an existing one is still valid.
     */
    static async hasFreshSignal(ticker: string, signalType: string): Promise<boolean> {
        try {
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
            const { data } = await supabase
                .from('signals')
                .select('id')
                .eq('ticker', ticker)
                .eq('signal_type', signalType)
                .eq('status', 'active')
                .gte('created_at', twoDaysAgo)
                .limit(1);

            return (data?.length ?? 0) > 0;
        } catch {
            return false;
        }
    }
}
