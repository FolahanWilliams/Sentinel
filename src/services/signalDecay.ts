/**
 * Sentinel — Signal Decay & Expiration Engine
 *
 * Manages the lifecycle of active signals:
 * - Applies time-based confidence decay (signals lose conviction over time)
 * - Auto-expires signals that have passed their expected timeframe
 * - Marks stale signals whose thesis may no longer be valid
 *
 * Decay model (adaptive, per signal type):
 *   decay_factor = e^(-0.693 × days_active / half_life)
 *   where half_life is set per signal_type/bias_type, reflecting how quickly
 *   that type of thesis becomes stale in practice.
 *   Floor: 0.5 (a signal never loses more than 50% of its original confidence)
 *
 * Default half-lives (in days):
 *   - long_overreaction:   3  (mean-reversion resolves fast or not at all)
 *   - sector_contagion:    4  (sympathy sells unwind within a few sessions)
 *   - earnings_overreaction: 5 (guided by next earnings cycle)
 *   - bullish_catalyst:   14  (narrative catalysts take time to be fully priced)
 *   - short_overreaction:  5  (shorts decay faster in bull markets)
 *   - information:        10  (general intelligence signal)
 *
 * These defaults can be overridden via app_settings key 'signal_decay_half_lives'
 * so the auto-learning loop can tune them from outcome data.
 *
 * Signals are expired when:
 *   - Age exceeds expected_timeframe × 2
 *   - Decayed confidence drops below CONFIDENCE_EXPIRY_THRESHOLD
 *   - Price has moved past stop-loss without being tracked
 */

import { supabase } from '@/config/supabase';
import { CONFIDENCE_EXPIRY_THRESHOLD, DEFAULT_SIGNAL_TIMEFRAME_DAYS } from '@/config/constants';
import type { SignalType } from '@/types/signals';

// ── Default half-lives (days) per signal type ────────────────────────────────
// These represent how many days it takes for a signal to lose 50% of its
// original confidence under the exponential decay model.
const DEFAULT_HALF_LIVES: Record<SignalType, number> = {
    long_overreaction: 3,
    sector_contagion: 4,
    earnings_overreaction: 5,
    bullish_catalyst: 14,
    short_overreaction: 5,
    information: 10,
};

const HALF_LIVES_SETTINGS_KEY = 'signal_decay_half_lives';
const HALF_LIVES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let cachedHalfLives: Record<string, number> | null = null;
let halfLivesCacheTimestamp = 0;

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
     * Load half-life overrides from app_settings (with in-memory cache).
     * Falls back to DEFAULT_HALF_LIVES if the setting doesn't exist.
     */
    private static async getHalfLives(): Promise<Record<string, number>> {
        if (cachedHalfLives && (Date.now() - halfLivesCacheTimestamp) < HALF_LIVES_CACHE_TTL_MS) {
            return cachedHalfLives;
        }
        try {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', HALF_LIVES_SETTINGS_KEY)
                .maybeSingle();
            cachedHalfLives = (data?.value as Record<string, number> | null) ?? { ...DEFAULT_HALF_LIVES };
        } catch {
            cachedHalfLives = { ...DEFAULT_HALF_LIVES };
        }
        halfLivesCacheTimestamp = Date.now();
        return cachedHalfLives;
    }

    /**
     * Compute exponential decay factor for a signal.
     * decay_factor = e^(-0.693 × days_active / half_life), floored at 0.5.
     * Uses per-signal-type half-life so thesis staleness is modelled correctly.
     */
    static computeDecayFactor(
        daysActive: number,
        signalType: string,
        halfLives: Record<string, number>,
    ): number {
        const halfLife = halfLives[signalType] ?? DEFAULT_HALF_LIVES['long_overreaction'];
        // Exponential: decay_factor = 2^(-days/half_life)  (i.e. e^(-ln2 * days/half_life))
        const rawFactor = Math.pow(2, -daysActive / halfLife);
        return Math.max(0.5, rawFactor);
    }

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

        const halfLives = await this.getHalfLives();

        try {
            const { data: activeSignals, error } = await supabase
                .from('signals')
                .select('id, ticker, confidence_score, expected_timeframe_days, created_at, stop_loss, target_price, status, signal_type')
                .eq('status', 'active')
                .order('created_at', { ascending: true });

            if (error || !activeSignals) {
                console.warn('[SignalDecay] Failed to fetch active signals:', error);
                return { processed: 0, stale: 0, expired: 0, results: [] };
            }

            for (const signal of activeSignals) {
                const createdAt = new Date(signal.created_at);
                const daysActive = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
                const expectedDays = signal.expected_timeframe_days || DEFAULT_SIGNAL_TIMEFRAME_DAYS;

                // Adaptive exponential decay, floored at 0.5
                const decayFactor = this.computeDecayFactor(daysActive, signal.signal_type, halfLives);
                const decayedConfidence = Math.round(signal.confidence_score * decayFactor);

                let action: DecayResult['action'] = 'active';
                let reason = '';

                // Check for expiration conditions
                if (daysActive > expectedDays * 2) {
                    action = 'expired';
                    reason = `Signal exceeded 2× expected timeframe (${daysActive.toFixed(1)}d vs ${expectedDays}d expected).`;
                } else if (decayedConfidence < CONFIDENCE_EXPIRY_THRESHOLD) {
                    action = 'expired';
                    reason = `Decayed confidence (${decayedConfidence}) dropped below expiration threshold of ${CONFIDENCE_EXPIRY_THRESHOLD}.`;
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
                    }).eq('id', signal.id);
                    console.log(`[SignalDecay] Expired ${signal.ticker} (${signal.id}): ${reason}`);
                } else if (action === 'stale') {
                    stale++;
                    await supabase.from('signals').update({
                        status: 'stale',
                        user_notes: `[Auto-stale] ${reason}`,
                    }).eq('id', signal.id);
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
     * Uses the same adaptive half-life model as processActiveSignals, with the
     * synchronous DEFAULT_HALF_LIVES table (no DB call needed for display).
     */
    static getDecayedConfidence(
        originalConfidence: number,
        createdAt: string,
        expectedTimeframeDays: number | null,
        signalType?: string,
    ): { decayedConfidence: number; decayFactor: number; isStale: boolean } {
        const daysActive = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
        const expectedDays = expectedTimeframeDays || DEFAULT_SIGNAL_TIMEFRAME_DAYS;
        // Use cached half-lives if available (populated by processActiveSignals), otherwise defaults
        const halfLives = cachedHalfLives ?? DEFAULT_HALF_LIVES;
        const decayFactor = this.computeDecayFactor(daysActive, signalType ?? 'long_overreaction', halfLives);
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
