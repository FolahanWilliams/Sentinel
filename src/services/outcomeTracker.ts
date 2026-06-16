/**
 * Sentinel — Signal Outcome Tracker
 *
 * Runs periodically to check the price of signals at specific intervals 
 * (1 day, 5 days, 10 days, 30 days) after entry to determine historical 
 * win rates and agent accuracy.
 */

import { supabase } from '@/config/supabase';
import { ReflectionAgent } from './reflectionAgent';
import { DynamicCalibrator } from './dynamicCalibrator';
import { OutcomeNarrativeGenerator } from './outcomeNarrative';
import { ConfidenceCalibrator } from './confidenceCalibrator';

export class OutcomeTracker {

    /**
     * Trigger outcome measurement. The authoritative, path-aware measurement
     * runs server-side in the `outcome-tracker` Edge Function (also on a cron),
     * so the audit trail updates even when no browser tab is open. We invoke it
     * here for immediacy while the app is open, then trigger learning refits if
     * anything closed.
     */
    static async updatePendingOutcomes() {
        let updatedCount = 0;
        try {
            const { data, error } = await supabase.functions.invoke('outcome-tracker', { body: {} });
            if (error) {
                console.warn('[OutcomeTracker] Edge function invoke failed:', error);
                return;
            }
            updatedCount = data && typeof data.updated === 'number' ? data.updated : 0;
            console.log(`[OutcomeTracker] Server updated ${updatedCount} outcomes (${data?.completed ?? 0} completed, ${data?.overdue ?? 0} overdue).`);
        } catch (err) {
            console.warn('[OutcomeTracker] Edge function unreachable:', err);
            return;
        }

        // Auto-trigger reflection + calibration refit when we have completed outcomes
        // Fire-and-forget: run async to avoid blocking the scan pipeline
        if (updatedCount > 0) {
            void (async () => {
                try {
                    const { count } = await supabase
                        .from('signal_outcomes')
                        .select('*', { count: 'exact', head: true })
                        .neq('outcome', 'pending')
                        .eq('is_simulated', false);

                    // Run reflection every 10 completed outcomes (trigger when we cross a 10-boundary)
                    const crossed10 = count != null && count >= 5 && Math.floor(count / 10) > Math.floor((count - updatedCount) / 10);
                    if (crossed10) {
                        console.log(`[OutcomeTracker] Triggering auto-reflection (${count} completed outcomes)...`);
                        const reflection = await ReflectionAgent.runReflection();
                        console.log(`[OutcomeTracker] Auto-reflection generated ${reflection.lessons.length} lessons from ${reflection.outcomes_analyzed} outcomes.`);
                    }

                    // Refit dynamic calibration curve after new outcomes
                    await DynamicCalibrator.refitIfNeeded();

                    // Refit return-weighted calibration curve (Item 2)
                    await DynamicCalibrator.buildReturnWeightedCurve();

                    // Rebuild static calibration curve
                    if (count != null && count >= 10 && Math.floor(count / 10) > Math.floor((count - updatedCount) / 10)) {
                        await ConfidenceCalibrator.buildCalibrationCurve();
                        console.log('[OutcomeTracker] Calibration curves refitted.');
                    }
                } catch (reflErr) {
                    console.warn('[OutcomeTracker] Auto-reflection/calibration failed (non-fatal):', reflErr);
                }
            })();
        }
    }

    /**
     * Mark overdue outcomes — signals where outcome_due_at has passed
     * but no outcome has been logged yet.
     */
    static async markOverdueOutcomes(): Promise<number> {
        const { data, error } = await supabase
            .from('signals')
            .update({ outcome_status: 'outcome_overdue' })
            .eq('outcome_status', 'pending_outcome')
            .lt('outcome_due_at', new Date().toISOString())
            .not('outcome_due_at', 'is', null)
            .select('id');

        if (error) {
            console.warn('[OutcomeTracker] Failed to mark overdue outcomes:', error);
            return 0;
        }

        const count = data?.length ?? 0;
        if (count > 0) {
            console.log(`[OutcomeTracker] Marked ${count} signals as outcome_overdue.`);
        }
        return count;
    }

    /**
     * Get outcome compliance stats for the current user.
     */
    static async getComplianceStats(): Promise<{
        pending: number;
        overdue: number;
        logged: number;
        total: number;
        compliancePct: number;
    }> {
        const [pendingRes, overdueRes, loggedRes] = await Promise.all([
            supabase.from('signals').select('*', { count: 'exact', head: true }).eq('outcome_status', 'pending_outcome'),
            supabase.from('signals').select('*', { count: 'exact', head: true }).eq('outcome_status', 'outcome_overdue'),
            supabase.from('signals').select('*', { count: 'exact', head: true }).eq('outcome_status', 'outcome_logged'),
        ]);

        const pending = pendingRes.count ?? 0;
        const overdue = overdueRes.count ?? 0;
        const logged = loggedRes.count ?? 0;
        const total = pending + overdue + logged;
        const compliancePct = total > 0 ? Math.round((logged / total) * 100) : 100;

        return { pending, overdue, logged, total, compliancePct };
    }

    /**
     * Generate outcome narratives for completed checkpoints.
     * Called periodically to add AI context to outcomes.
     */
    static async generatePendingNarratives(): Promise<number> {
        let generated = 0;
        try {
            // Find completed outcomes that don't have narratives yet
            const { data: outcomes } = await supabase
                .from('signal_outcomes')
                .select('*, signals!inner(thesis, ticker, agent_outputs)')
                .neq('outcome', 'pending')
                .eq('is_simulated', false)
                .order('completed_at', { ascending: false })
                .limit(10);

            if (!outcomes) return 0;

            for (const outcome of outcomes) {
                const signal = (outcome as any).signals;
                if (!signal?.thesis) continue;

                // Skip if narrative already exists
                const existingOutputs = signal.agent_outputs || {};
                if (existingOutputs.outcome_narrative) continue;

                const latestReturn = outcome.return_at_30d ?? outcome.return_at_10d ?? outcome.return_at_5d ?? outcome.return_at_1d;
                const latestPrice = outcome.price_at_30d ?? outcome.price_at_10d ?? outcome.price_at_5d ?? outcome.price_at_1d;
                if (latestReturn == null || latestPrice == null) continue;

                const daysElapsed = outcome.price_at_30d ? 30 : outcome.price_at_10d ? 10 : outcome.price_at_5d ? 5 : 1;

                try {
                    const narrative = await OutcomeNarrativeGenerator.generateNarrative({
                        ticker: outcome.ticker,
                        originalThesis: signal.thesis,
                        entryPrice: outcome.entry_price,
                        currentPrice: latestPrice,
                        returnPct: latestReturn,
                        daysElapsed,
                        hitTarget: outcome.hit_target,
                        hitStop: outcome.hit_stop_loss,
                    });

                    if (narrative) {
                        await supabase.from('signals').update({
                            agent_outputs: {
                                ...existingOutputs,
                                outcome_narrative: {
                                    ...narrative,
                                    generated_at: new Date().toISOString(),
                                },
                            },
                        } as any).eq('id', outcome.signal_id);
                        generated++;
                    }
                } catch { /* non-fatal per outcome */ }
            }
        } catch (err) {
            console.warn('[OutcomeTracker] Narrative generation failed:', err);
        }

        if (generated > 0) {
            console.log(`[OutcomeTracker] Generated ${generated} outcome narratives.`);
        }
        return generated;
    }
}
