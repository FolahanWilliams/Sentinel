/**
 * Sentinel — Signal Outcome Tracker
 *
 * Runs periodically to check the price of signals at specific intervals 
 * (1 day, 5 days, 10 days, 30 days) after entry to determine historical 
 * win rates and agent accuracy.
 */

import { supabase } from '@/config/supabase';
import { MarketDataService } from './marketData';
import { ReflectionAgent } from './reflectionAgent';

export class OutcomeTracker {

    /**
     * Scans the `signal_outcomes` table for entries that need interval updates.
     */
    static async updatePendingOutcomes() {
        console.log('[OutcomeTracker] Checking for pending outcomes...');

        const { data: outcomes, error } = await supabase
            .from('signal_outcomes')
            .select('*')
            .eq('outcome', 'pending');

        if (error || !outcomes) {
            console.error('[OutcomeTracker] Fetch failed:', error);
            return;
        }

        let updatedCount = 0;

        for (const outcome of outcomes) {
            try {
                // Fetch current quote — skip this outcome if quote fails
                let quote;
                try {
                    quote = await MarketDataService.getQuote(outcome.ticker);
                } catch (quoteErr) {
                    console.warn(`[OutcomeTracker] Quote fetch failed for ${outcome.ticker}, skipping this cycle`, quoteErr);
                    continue;
                }

                const currentPrice = quote?.price;
                if (!currentPrice || currentPrice <= 0 || !outcome.entry_price || outcome.entry_price <= 0) {
                    console.warn(`[OutcomeTracker] Invalid price data for ${outcome.ticker} (current=${currentPrice}, entry=${outcome.entry_price}), skipping`);
                    continue;
                }

                const entryTime = new Date(outcome.tracked_at).getTime();
                const now = Date.now();
                const daysElapsed = (now - entryTime) / (1000 * 60 * 60 * 24);

                const updates: Record<string, unknown> = {};
                let isComplete = false;
                let finalOutcome = 'pending';

                // Update interval markers if we've passed them
                if (daysElapsed >= 1 && !outcome.price_at_1d) {
                    updates.price_at_1d = currentPrice;
                    updates.return_at_1d = ((currentPrice - outcome.entry_price) / outcome.entry_price) * 100;
                }
                if (daysElapsed >= 5 && !outcome.price_at_5d) {
                    updates.price_at_5d = currentPrice;
                    updates.return_at_5d = ((currentPrice - outcome.entry_price) / outcome.entry_price) * 100;
                }
                if (daysElapsed >= 10 && !outcome.price_at_10d) {
                    updates.price_at_10d = currentPrice;
                    updates.return_at_10d = ((currentPrice - outcome.entry_price) / outcome.entry_price) * 100;
                }
                if (daysElapsed >= 30 && !outcome.price_at_30d) {
                    updates.price_at_30d = currentPrice;
                    updates.return_at_30d = ((currentPrice - outcome.entry_price) / outcome.entry_price) * 100;
                    isComplete = true; // 30 days is our max tracking window
                }

                // Also check if we hit max gain / max drawdown
                const currentReturn = ((currentPrice - outcome.entry_price) / outcome.entry_price) * 100;

                if (!outcome.max_gain || currentReturn > outcome.max_gain) {
                    updates.max_gain = currentReturn;
                }
                if (!outcome.max_drawdown || currentReturn < outcome.max_drawdown) {
                    updates.max_drawdown = currentReturn;
                }

                // Check against stops and targets (requires fetching the parent signal)
                const { data: signal } = await supabase
                    .from('signals')
                    .select('stop_loss, target_price')
                    .eq('id', outcome.signal_id)
                    .single();

                if (signal) {
                    const stopLoss = typeof signal.stop_loss === 'number' ? signal.stop_loss : null;
                    const targetPrice = typeof signal.target_price === 'number' ? signal.target_price : null;

                    if (stopLoss !== null && stopLoss > 0 && currentPrice <= stopLoss) {
                        updates.hit_stop_loss = true;
                        isComplete = true; // Stopped out
                        finalOutcome = 'loss';
                    } else if (targetPrice !== null && targetPrice > 0 && currentPrice >= targetPrice) {
                        updates.hit_target = true;
                        isComplete = true; // Target hit
                        finalOutcome = 'win';
                    }
                }

                // If time expired without hitting stop or target, evaluate PnL
                if (isComplete && finalOutcome === 'pending') {
                    finalOutcome = currentReturn > 0 ? 'win' : 'loss';
                }

                if (Object.keys(updates).length > 0) {
                    if (isComplete) {
                        updates.outcome = finalOutcome;
                        updates.completed_at = new Date().toISOString();
                    }

                    await supabase
                        .from('signal_outcomes')
                        .update(updates)
                        .eq('id', outcome.id);

                    updatedCount++;
                }

            } catch (err) {
                console.warn(`[OutcomeTracker] Failed to update outcome for ${outcome.ticker}`, err);
            }
        }

        console.log(`[OutcomeTracker] Updated ${updatedCount} outcomes.`);

        // Auto-trigger reflection when we have completed outcomes (every 10 completions)
        if (updatedCount > 0) {
            try {
                const { count } = await supabase
                    .from('signal_outcomes')
                    .select('*', { count: 'exact', head: true })
                    .neq('outcome', 'pending');

                // Run reflection every 10 completed outcomes
                if (count && count >= 5 && count % 10 < updatedCount) {
                    console.log(`[OutcomeTracker] Triggering auto-reflection (${count} completed outcomes)...`);
                    const reflection = await ReflectionAgent.runReflection();
                    console.log(`[OutcomeTracker] Auto-reflection generated ${reflection.lessons.length} lessons from ${reflection.outcomes_analyzed} outcomes.`);
                }
            } catch (reflErr) {
                console.warn('[OutcomeTracker] Auto-reflection failed (non-fatal):', reflErr);
            }
        }
    }
}
