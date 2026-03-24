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

// ── Regime-based half-life multipliers ──────────────────────────────────────
// In crisis/correction, signals go stale faster (shorter half-life).
// In bull markets, theses persist longer (longer half-life).
const REGIME_HALF_LIFE_MULTIPLIERS: Record<string, number> = {
    crisis: 0.5,      // Half-lives cut in half — fast-moving environment
    correction: 0.75,  // Shorter half-lives — elevated volatility
    neutral: 1.0,      // Default
    bull: 1.3,         // Theses persist longer in stable uptrend
};

// ── Volatility-aware decay acceleration ─────────────────────────────────────
// When realized volatility (via ATR or price range) exceeds expectations,
// decay accelerates proportionally.
const VOLATILITY_ACCELERATION_THRESHOLD = 1.5; // 1.5× expected vol triggers acceleration
const MAX_VOLATILITY_ACCELERATION = 2.0;       // Cap: never accelerate more than 2×

const HALF_LIVES_SETTINGS_KEY = 'signal_decay_half_lives';
const HALF_LIVES_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
let cachedHalfLives: Record<string, number> | null = null;
let halfLivesCacheTimestamp = 0;

// Regime cache (populated externally by scanner or decay processor)
let cachedRegime: string | null = null;

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
     * Set the current market regime for adaptive decay.
     * Called by the scanner after regime detection.
     */
    static setRegime(regime: string): void {
        cachedRegime = regime;
    }

    /**
     * Compute exponential decay factor for a signal.
     * decay_factor = 2^(-days_active / effective_half_life), floored at 0.5.
     *
     * Adaptive enhancements:
     * - Half-life is adjusted by market regime (crisis = faster decay, bull = slower)
     * - Volatility acceleration: if the signal's price has moved more than expected,
     *   the thesis is likely resolving faster — accelerate decay.
     * - Performance feedback: signals from historically weak categories decay faster.
     */
    static computeDecayFactor(
        daysActive: number,
        signalType: string,
        halfLives: Record<string, number>,
        options?: {
            regime?: string;
            realizedVolMultiplier?: number; // actual vol / expected vol
            historicalWinRate?: number;     // 0-1, category win rate
        },
    ): number {
        let halfLife = halfLives[signalType] ?? DEFAULT_HALF_LIVES['long_overreaction'];

        // 1. Regime adjustment: scale half-life by market environment
        const regime = options?.regime ?? cachedRegime ?? 'neutral';
        const regimeMultiplier = REGIME_HALF_LIFE_MULTIPLIERS[regime] ?? 1.0;
        halfLife *= regimeMultiplier;

        // 2. Volatility acceleration: if realized vol exceeds expected, decay faster
        if (options?.realizedVolMultiplier && options.realizedVolMultiplier > VOLATILITY_ACCELERATION_THRESHOLD) {
            const volAcceleration = Math.min(
                MAX_VOLATILITY_ACCELERATION,
                options.realizedVolMultiplier / VOLATILITY_ACCELERATION_THRESHOLD,
            );
            halfLife /= volAcceleration;
        }

        // 3. Performance feedback: weak categories decay faster
        if (options?.historicalWinRate !== undefined && options.historicalWinRate < 0.4) {
            // Win rate below 40% → accelerate decay by up to 30%
            const winRatePenalty = 1.0 + (0.4 - options.historicalWinRate); // e.g., 30% win rate → 1.1× faster
            halfLife /= winRatePenalty;
        }

        // Floor: half-life never drops below 1 day
        halfLife = Math.max(1.0, halfLife);

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

            // Fetch historical win rates for adaptive decay
            let winRateByType: Record<string, number> = {};
            try {
                const { data: outcomeStats } = await supabase
                    .from('signal_outcomes')
                    .select('signals!inner(signal_type), outcome')
                    .neq('outcome', 'pending');
                if (outcomeStats && outcomeStats.length > 0) {
                    const typeCounts: Record<string, { wins: number; total: number }> = {};
                    for (const o of outcomeStats) {
                        const st = (o as any).signals?.signal_type || 'unknown';
                        if (!typeCounts[st]) typeCounts[st] = { wins: 0, total: 0 };
                        typeCounts[st].total++;
                        if (o.outcome === 'win') typeCounts[st].wins++;
                    }
                    for (const [st, counts] of Object.entries(typeCounts)) {
                        if (counts.total >= 5) {
                            winRateByType[st] = counts.wins / counts.total;
                        }
                    }
                }
            } catch { /* non-fatal */ }

            for (const signal of activeSignals) {
                const createdAt = new Date(signal.created_at);
                const daysActive = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
                const expectedDays = signal.expected_timeframe_days || DEFAULT_SIGNAL_TIMEFRAME_DAYS;

                // Adaptive exponential decay with regime, volatility, and performance feedback
                const decayFactor = this.computeDecayFactor(daysActive, signal.signal_type, halfLives, {
                    regime: cachedRegime ?? undefined,
                    historicalWinRate: winRateByType[signal.signal_type],
                });
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
        // Regime-aware decay for display (uses cached regime from last processActiveSignals run)
        const decayFactor = this.computeDecayFactor(daysActive, signalType ?? 'long_overreaction', halfLives, {
            regime: cachedRegime ?? undefined,
        });
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
