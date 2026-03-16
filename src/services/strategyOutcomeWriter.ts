/**
 * StrategyOutcomeWriter — Persists backtest results from StrategyChart
 * into the signal_outcomes table so BacktestValidator and ConfidenceCalibrator
 * can recalibrate from TA-only signal history.
 *
 * Flow:
 * 1. Creates a synthetic signal record in `signals` for each closed StrategySignal
 * 2. Inserts the outcome into `signal_outcomes` with real P&L data
 * 3. Invalidates BacktestValidator cache so new data takes effect immediately
 */

import { supabase } from '@/config/supabase';
import { BacktestValidator } from './backtestValidator';
import type { StrategySignal } from '@/hooks/useStrategySignals';

const STRATEGY_SIGNAL_TYPE = 'strategy_backtest';

/** Map StrategySignal outcome to signal_outcomes outcome column */
function mapOutcome(sig: StrategySignal): string {
    if (sig.outcome === 'win') return 'win';
    if (sig.outcome === 'loss') return 'loss';
    if (sig.outcome === 'expired') return 'expired';
    return 'pending';
}

/** Map StrategySignal outcome to signals status column */
function mapStatus(sig: StrategySignal): string {
    if (sig.outcome === 'win') return 'target_hit';
    if (sig.outcome === 'loss') return 'stopped_out';
    if (sig.outcome === 'expired') return 'expired';
    return 'active';
}

export class StrategyOutcomeWriter {

    /**
     * Persist closed strategy signals (win/loss/expired) into the DB.
     * Skips signals that are still 'open'.
     * Returns the count of successfully inserted outcomes.
     */
    static async writeOutcomes(
        ticker: string,
        signals: StrategySignal[],
    ): Promise<{ inserted: number; skipped: number; error: string | null }> {
        const closed = signals.filter(s => s.outcome !== 'open');
        if (closed.length === 0) {
            return { inserted: 0, skipped: 0, error: null };
        }

        // Check for existing strategy backtest signals for this ticker to avoid duplicates
        const { data: existing } = await supabase
            .from('signals')
            .select('id, created_at')
            .eq('ticker', ticker)
            .eq('signal_type', STRATEGY_SIGNAL_TYPE)
            .limit(1);

        if (existing && existing.length > 0) {
            // Already have strategy backtest data for this ticker — skip to avoid duplicates
            return { inserted: 0, skipped: closed.length, error: null };
        }

        let inserted = 0;
        let skipped = 0;

        for (const sig of closed) {
            try {
                // 1. Insert synthetic signal record
                const { data: savedSignal, error: sigErr } = await supabase
                    .from('signals')
                    .insert({
                        ticker,
                        signal_type: STRATEGY_SIGNAL_TYPE,
                        confidence_score: sig.confluence,
                        risk_level: sig.confluenceLevel === 'strong' ? 'low' : sig.confluenceLevel === 'moderate' ? 'medium' : 'high',
                        bias_type: sig.direction === 'long' ? 'recency_bias' : 'loss_aversion',
                        thesis: `Strategy backtest ${sig.direction} signal on ${sig.date} — TA score ${sig.taScore}, confluence ${sig.confluence}% (${sig.confluenceLevel})`,
                        counter_argument: `Backtest result: ${sig.outcome} at ${sig.pnlPct >= 0 ? '+' : ''}${sig.pnlPct.toFixed(1)}% over ${sig.barsHeld} bars`,
                        suggested_entry_low: sig.price * 0.995,
                        suggested_entry_high: sig.price * 1.005,
                        stop_loss: sig.stopLoss,
                        target_price: sig.target,
                        status: mapStatus(sig),
                        confluence_score: sig.confluence,
                        confluence_level: sig.confluenceLevel,
                        data_quality: 'full',
                    })
                    .select('id')
                    .single();

                if (sigErr || !savedSignal) {
                    console.warn(`[StrategyOutcomeWriter] Failed to insert signal for ${ticker} ${sig.date}:`, sigErr);
                    skipped++;
                    continue;
                }

                // 2. Insert outcome record
                const { error: outcomeErr } = await supabase
                    .from('signal_outcomes')
                    .insert({
                        signal_id: savedSignal.id,
                        ticker,
                        entry_price: sig.price,
                        outcome: mapOutcome(sig),
                        hit_stop_loss: sig.outcome === 'loss',
                        hit_target: sig.outcome === 'win',
                        max_drawdown: sig.maxDrawdown,
                        max_gain: sig.maxGain,
                        // Map bars held to approximate day returns
                        return_at_1d: sig.barsHeld >= 1 ? sig.pnlPct * (1 / sig.barsHeld) : null,
                        return_at_5d: sig.barsHeld >= 5 ? sig.pnlPct * (5 / sig.barsHeld) : sig.pnlPct,
                        return_at_10d: sig.barsHeld >= 10 ? sig.pnlPct * (10 / sig.barsHeld) : sig.pnlPct,
                        return_at_30d: sig.pnlPct,
                        completed_at: sig.exitDate ? new Date(sig.exitDate).toISOString() : new Date().toISOString(),
                    });

                if (outcomeErr) {
                    console.warn(`[StrategyOutcomeWriter] Failed to insert outcome for ${ticker} ${sig.date}:`, outcomeErr);
                    skipped++;
                } else {
                    inserted++;
                }
            } catch (err) {
                console.error(`[StrategyOutcomeWriter] Error writing ${ticker} ${sig.date}:`, err);
                skipped++;
            }
        }

        // 3. Invalidate caches so validators pick up new data
        if (inserted > 0) {
            BacktestValidator.invalidateCache();
        }

        return { inserted, skipped, error: null };
    }

    /**
     * Check if strategy backtest outcomes already exist for a ticker.
     */
    static async hasExistingOutcomes(ticker: string): Promise<boolean> {
        const { count } = await supabase
            .from('signals')
            .select('id', { count: 'exact', head: true })
            .eq('ticker', ticker)
            .eq('signal_type', STRATEGY_SIGNAL_TYPE);

        return (count ?? 0) > 0;
    }
}
