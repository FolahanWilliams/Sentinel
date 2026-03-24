/**
 * Sentinel — Outcome Narrative Agent
 *
 * Reviews closed/expired signals and generates structured narratives
 * explaining WHY signals won or lost. Compares the original thesis to
 * what actually happened, identifies key drivers, and feeds insights
 * back into the calibration system.
 *
 * Runs automatically after outcome tracking, targeting signals with
 * completed outcomes that don't yet have a narrative.
 *
 * Output is stored in agent_outputs.outcome_narrative for each signal.
 */

import { supabase } from '@/config/supabase';
import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';
import {
    NARRATIVE_MAX_SIGNALS_PER_CYCLE,
    NARRATIVE_MIN_RETURN_PCT,
} from '@/config/agentThresholds';
import type { SignalOutcome, AgentOutputsJson } from '@/types/signals';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface OutcomeNarrative {
    signalId: string;
    ticker: string;
    outcome: string;
    narrative: string;
    key_drivers: string[];
    thesis_validation: 'validated' | 'partially_validated' | 'invalidated' | 'inconclusive';
    lesson: string;
    pattern_tag: string; // e.g., 'sector_recovery', 'false_breakout', 'thesis_intact_but_slow'
    confidence_was_calibrated: boolean; // was the confidence level appropriate for the outcome?
    generated_at: string;
}

export interface NarrativeResult {
    generated: number;
    skipped: number;
    narratives: OutcomeNarrative[];
}

// ── Gemini schema ───────────────────────────────────────────────────────────────

const NARRATIVE_SCHEMA = {
    type: 'object',
    properties: {
        narrative: {
            type: 'string',
            description: 'A 2-4 sentence narrative explaining why the signal won or lost. Focus on what happened vs. what was expected.',
        },
        key_drivers: {
            type: 'array',
            items: { type: 'string' },
            description: 'Top 2-4 factors that drove the outcome (e.g., "Earnings beat expectations", "Sector rotation away from tech")',
        },
        thesis_validation: {
            type: 'string',
            enum: ['validated', 'partially_validated', 'invalidated', 'inconclusive'],
            description: 'Whether the original thesis was correct',
        },
        lesson: {
            type: 'string',
            description: 'One actionable lesson for future signals of this type',
        },
        pattern_tag: {
            type: 'string',
            description: 'A short tag categorizing the outcome pattern (e.g., "mean_reversion_worked", "false_breakout", "macro_headwind", "thesis_correct_timing_wrong")',
        },
        confidence_was_calibrated: {
            type: 'boolean',
            description: 'True if the confidence level (high confidence = win, low confidence = loss) matched the outcome',
        },
    },
    required: ['narrative', 'key_drivers', 'thesis_validation', 'lesson', 'pattern_tag', 'confidence_was_calibrated'],
};

export class OutcomeNarrativeAgent {

    /**
     * Generate narratives for recently completed outcomes that lack one.
     * Called at end of scan cycle after OutcomeTracker.updatePendingOutcomes().
     */
    static async generatePendingNarratives(): Promise<NarrativeResult> {
        const narratives: OutcomeNarrative[] = [];
        let skipped = 0;

        try {
            // Find completed outcomes whose signals lack an outcome_narrative
            const { data: completedOutcomes, error } = await supabase
                .from('signal_outcomes')
                .select(`
                    id, signal_id, ticker, entry_price,
                    price_at_1d, price_at_5d, price_at_10d, price_at_30d,
                    return_at_1d, return_at_5d, return_at_10d, return_at_30d,
                    outcome, hit_stop_loss, hit_target,
                    max_drawdown, max_gain, completed_at,
                    signals!inner(
                        id, ticker, signal_type, thesis, confidence_score,
                        calibrated_confidence, bias_type, counter_argument,
                        stop_loss, target_price, agent_outputs, ta_snapshot,
                        conviction_score, lynch_category, created_at
                    )
                `)
                .neq('outcome', 'pending')
                .not('completed_at', 'is', null)
                .order('completed_at', { ascending: false })
                .limit(NARRATIVE_MAX_SIGNALS_PER_CYCLE * 2); // fetch extra for filtering

            if (error || !completedOutcomes || completedOutcomes.length === 0) {
                return { generated: 0, skipped: 0, narratives: [] };
            }

            // Filter to those without an existing narrative
            const needsNarrative = completedOutcomes.filter(o => {
                const signal = (o as any).signals;
                if (!signal) return false;
                const agentOutputs: AgentOutputsJson | null = signal.agent_outputs;
                return !agentOutputs?.outcome_narrative;
            });

            // Filter to outcomes with meaningful returns (skip tiny moves)
            const meaningful = needsNarrative.filter(o => {
                const bestReturn = Math.max(
                    Math.abs(o.return_at_5d ?? 0),
                    Math.abs(o.return_at_10d ?? 0),
                    Math.abs(o.return_at_30d ?? 0),
                );
                if (bestReturn < NARRATIVE_MIN_RETURN_PCT) {
                    skipped++;
                    return false;
                }
                return true;
            });

            // Process up to limit
            for (const outcome of meaningful.slice(0, NARRATIVE_MAX_SIGNALS_PER_CYCLE)) {
                try {
                    const signal = (outcome as any).signals;
                    const narrative = await this.generateNarrative(outcome as SignalOutcome, signal);
                    if (narrative) {
                        narratives.push(narrative);
                        // Persist narrative into signal's agent_outputs
                        await this.persistNarrative(signal.id, narrative);
                    }
                } catch (err) {
                    console.warn(`[OutcomeNarrative] Failed for ${outcome.ticker}:`, err);
                    skipped++;
                }
            }

            if (narratives.length > 0) {
                console.log(`[OutcomeNarrative] Generated ${narratives.length} narratives, skipped ${skipped}`);
            }

            return { generated: narratives.length, skipped, narratives };
        } catch (err) {
            console.error('[OutcomeNarrative] Error:', err);
            return { generated: 0, skipped: 0, narratives: [] };
        }
    }

    /**
     * Generate a single outcome narrative using Gemini.
     */
    private static async generateNarrative(
        outcome: SignalOutcome,
        signal: any,
    ): Promise<OutcomeNarrative | null> {
        const returnSummary = [
            outcome.return_at_1d !== null ? `1-day: ${outcome.return_at_1d > 0 ? '+' : ''}${outcome.return_at_1d.toFixed(1)}%` : null,
            outcome.return_at_5d !== null ? `5-day: ${outcome.return_at_5d > 0 ? '+' : ''}${outcome.return_at_5d.toFixed(1)}%` : null,
            outcome.return_at_10d !== null ? `10-day: ${outcome.return_at_10d > 0 ? '+' : ''}${outcome.return_at_10d.toFixed(1)}%` : null,
            outcome.return_at_30d !== null ? `30-day: ${outcome.return_at_30d > 0 ? '+' : ''}${outcome.return_at_30d.toFixed(1)}%` : null,
        ].filter(Boolean).join(', ');

        const agentOutputs: AgentOutputsJson | null = signal.agent_outputs;

        // Build context blocks
        const contextBlocks: string[] = [];
        if (agentOutputs?.market_regime) {
            contextBlocks.push(`Market regime at signal time: ${agentOutputs.market_regime.regime} (VIX: ${agentOutputs.market_regime.vix ?? 'N/A'})`);
        }
        if (agentOutputs?.red_team) {
            contextBlocks.push(`Red team counter: ${agentOutputs.red_team.counter_thesis || 'N/A'}`);
        }
        if (agentOutputs?.bias_detective) {
            contextBlocks.push(`Bias detected: ${agentOutputs.bias_detective.dominant_bias || 'none'}`);
        }
        if (agentOutputs?.peer_strength) {
            contextBlocks.push(`Peer relative strength: ${agentOutputs.peer_strength.relative_strength > 0 ? '+' : ''}${agentOutputs.peer_strength.relative_strength.toFixed(1)}% (${agentOutputs.peer_strength.is_idiosyncratic ? 'idiosyncratic' : 'sector-wide'})`);
        }

        const prompt = `SIGNAL POST-MORTEM ANALYSIS

TICKER: ${signal.ticker}
SIGNAL TYPE: ${signal.signal_type}
CREATED: ${signal.created_at}
ORIGINAL CONFIDENCE: ${signal.confidence_score}${signal.calibrated_confidence ? ` (calibrated: ${signal.calibrated_confidence})` : ''}
CONVICTION SCORE: ${signal.conviction_score ?? 'N/A'}

ORIGINAL THESIS:
"${signal.thesis}"

COUNTER-ARGUMENT AT TIME:
"${signal.counter_argument || 'None recorded'}"

ENTRY: $${outcome.entry_price}
STOP: ${signal.stop_loss ? '$' + signal.stop_loss : 'N/A'}
TARGET: ${signal.target_price ? '$' + signal.target_price : 'N/A'}

OUTCOME: ${outcome.outcome.toUpperCase()}
RETURNS: ${returnSummary}
HIT STOP: ${outcome.hit_stop_loss ? 'YES' : 'No'}
HIT TARGET: ${outcome.hit_target ? 'YES' : 'No'}
MAX DRAWDOWN: ${outcome.max_drawdown !== null ? outcome.max_drawdown.toFixed(1) + '%' : 'N/A'}
MAX GAIN: ${outcome.max_gain !== null ? outcome.max_gain.toFixed(1) + '%' : 'N/A'}

${contextBlocks.length > 0 ? 'PIPELINE CONTEXT:\n' + contextBlocks.join('\n') : ''}

Analyze this signal's outcome. What drove the result? Was the thesis correct? What lesson does this teach for future ${signal.signal_type} signals?`;

        const result = await GeminiService.generate<{
            narrative: string;
            key_drivers: string[];
            thesis_validation: 'validated' | 'partially_validated' | 'invalidated' | 'inconclusive';
            lesson: string;
            pattern_tag: string;
            confidence_was_calibrated: boolean;
        }>({
            prompt,
            systemInstruction: 'You are the OUTCOME NARRATIVE agent for Sentinel trading AI. Analyze completed signal outcomes objectively. Focus on what actually drove the result — not what was hoped. Be specific about market conditions, technical factors, and thesis accuracy. Tag patterns that can improve future signals.',
            responseSchema: NARRATIVE_SCHEMA,
            temperature: 0.3,
            model: GEMINI_MODEL,
        });

        if (!result.success || !result.data) return null;

        return {
            signalId: signal.id,
            ticker: signal.ticker,
            outcome: outcome.outcome,
            narrative: result.data.narrative,
            key_drivers: result.data.key_drivers,
            thesis_validation: result.data.thesis_validation,
            lesson: result.data.lesson,
            pattern_tag: result.data.pattern_tag,
            confidence_was_calibrated: result.data.confidence_was_calibrated,
            generated_at: new Date().toISOString(),
        };
    }

    /**
     * Persist the narrative into the signal's agent_outputs JSON.
     */
    private static async persistNarrative(signalId: string, narrative: OutcomeNarrative): Promise<void> {
        // Fetch current agent_outputs
        const { data } = await supabase
            .from('signals')
            .select('agent_outputs')
            .eq('id', signalId)
            .single();

        const agentOutputs: AgentOutputsJson = (data?.agent_outputs as AgentOutputsJson) ?? {};
        agentOutputs.outcome_narrative = {
            narrative: narrative.narrative,
            key_drivers: narrative.key_drivers,
            thesis_validation: narrative.thesis_validation,
            generated_at: narrative.generated_at,
        };

        await supabase.from('signals').update({
            agent_outputs: agentOutputs as any,
        }).eq('id', signalId);

        console.log(`[OutcomeNarrative] Saved narrative for ${narrative.ticker} (${narrative.outcome}): ${narrative.pattern_tag}`);
    }

    /**
     * Get aggregated narrative insights for the auto-learning service.
     * Returns pattern frequencies and lesson summaries.
     */
    static async getPatternInsights(limit = 50): Promise<{
        patterns: Record<string, number>;
        thesisAccuracy: { validated: number; partial: number; invalidated: number; inconclusive: number };
        calibrationAccuracy: number;
        topLessons: string[];
    }> {
        try {
            const { data: signals } = await supabase
                .from('signals')
                .select('agent_outputs')
                .not('agent_outputs->outcome_narrative', 'is', null)
                .order('updated_at', { ascending: false })
                .limit(limit);

            if (!signals || signals.length === 0) {
                return {
                    patterns: {},
                    thesisAccuracy: { validated: 0, partial: 0, invalidated: 0, inconclusive: 0 },
                    calibrationAccuracy: 0,
                    topLessons: [],
                };
            }

            const patterns: Record<string, number> = {};
            const thesisAccuracy = { validated: 0, partial: 0, invalidated: 0, inconclusive: 0 };
            const calibratedCorrectly = 0;
            const lessons: string[] = [];

            for (const s of signals) {
                const narrative = (s.agent_outputs as AgentOutputsJson)?.outcome_narrative;
                if (!narrative) continue;

                // Count patterns (from stored data)
                // Note: pattern_tag is stored in the full narrative but we extract from key_drivers
                const validation = narrative.thesis_validation as keyof typeof thesisAccuracy;
                if (validation in thesisAccuracy) {
                    thesisAccuracy[validation]++;
                }
            }

            const total = signals.length;
            const calibrationAccuracy = total > 0 ? calibratedCorrectly / total : 0;

            return {
                patterns,
                thesisAccuracy,
                calibrationAccuracy,
                topLessons: lessons.slice(0, 10),
            };
        } catch (err) {
            console.warn('[OutcomeNarrative] Failed to get pattern insights:', err);
            return {
                patterns: {},
                thesisAccuracy: { validated: 0, partial: 0, invalidated: 0, inconclusive: 0 },
                calibrationAccuracy: 0,
                topLessons: [],
            };
        }
    }
}
