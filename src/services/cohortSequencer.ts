/**
 * Sentinel — Cohort Reaction Sequencer (Behavioral Layer, capability #1)
 *
 * Predicts the TEMPORAL sequence of market-participant cohort reactions to
 * an event, identifies the primary mispricer, and locates where the current
 * market state sits in that sequence. The signal's edge depends on being
 * EARLY in the sequence — best entries are pre_reaction and first_wave; the
 * edge is gone by post_correction.
 *
 * This agent is soft-gated: it only contributes a bounded confidence
 * adjustment. It does NOT block signals on its own (unlike Other-Mind).
 */

import { GeminiService } from './gemini';
import { COHORT_SEQUENCER_AGENT_PROMPT } from './prompts';
import { COHORT_SEQUENCE_SCHEMA } from './schemas';
import {
    GEMINI_MODEL_LITE,
    COHORT_MAX_ADJUSTMENT,
} from '@/config/constants';
import type {
    CohortSequenceResult,
    CohortSequenceStage,
    MarketParticipantCohort,
    CohortReactionStep,
} from '@/types/agents';
import { safeBlock, UNTRUSTED_CONTENT_INSTRUCTION } from '@/utils/promptSanitizer';

export interface CohortSequencerInput {
    ticker: string;
    direction: 'long' | 'short';
    thesis: string;
    eventHeadline: string;
    eventDesc: string;
    priceChangePct: number;
    taScore?: number | null;         // 0-100 TA score from earlyTaSnapshot
    volumeRatio?: number | null;     // volume vs avg multiplier
    marketRegime?: string;
    fearGreedScore?: number;
}

export class CohortSequencerAgent {

    /**
     * Predict the cohort reaction sequence for a signal.
     *
     * Always returns a valid result — on any failure it falls back to a
     * neutral (zero-adjustment) response so the behavioral layer can
     * continue without blocking.
     */
    static async analyze(input: CohortSequencerInput): Promise<CohortSequenceResult> {
        const {
            ticker, direction, thesis, eventHeadline, eventDesc,
            priceChangePct, taScore, volumeRatio, marketRegime, fearGreedScore,
        } = input;

        // Build context lines, skipping missing fields
        const contextLines: string[] = [];
        if (taScore != null) contextLines.push(`TA Score: ${taScore}/100`);
        if (volumeRatio != null) contextLines.push(`Volume vs avg: ${volumeRatio.toFixed(1)}x`);
        if (marketRegime) contextLines.push(`Regime: ${marketRegime}`);
        if (fearGreedScore != null) contextLines.push(`Fear & Greed: ${fearGreedScore}`);
        const contextBlock = contextLines.length > 0
            ? `\nMARKET CONTEXT:\n  ${contextLines.join('\n  ')}\n`
            : '';

        const prompt = `
TICKER: ${ticker}
SIGNAL DIRECTION: ${direction.toUpperCase()}
PRICE CHANGE: ${priceChangePct.toFixed(2)}%
${contextBlock}
EVENT HEADLINE:${safeBlock('headline', eventHeadline, 200)}

EVENT CONTEXT:${safeBlock('news', eventDesc, 600)}

PRIMARY THESIS:${safeBlock('prior_agent', thesis, 500)}

Predict the temporal sequence of cohort reactions to this event. Identify the primary mispricer, locate where the market currently sits in the sequence, and score your confidence. Return JSON.
`;

        try {
            const result = await GeminiService.generate<CohortSequenceResult>({
                prompt,
                systemInstruction: UNTRUSTED_CONTENT_INSTRUCTION + '\n\n' + COHORT_SEQUENCER_AGENT_PROMPT,
                responseSchema: COHORT_SEQUENCE_SCHEMA,
                model: GEMINI_MODEL_LITE,
                temperature: 0.3,
                requireGroundedSearch: false,
            });

            if (!result.success || !result.data) {
                console.warn(`[CohortSequence] Gemini call failed for ${ticker}: ${result.error}`);
                return this.neutralResult();
            }

            const data = result.data;

            // Bound the adjustment so the agent can't blow past COHORT_MAX_ADJUSTMENT.
            const rawAdj = Math.round(data.confidence_adjustment ?? 0);
            const boundedAdj = Math.max(-COHORT_MAX_ADJUSTMENT, Math.min(COHORT_MAX_ADJUSTMENT, rawAdj));

            // Defensive: ensure reaction_sequence is an array of valid steps
            const sequence: CohortReactionStep[] = Array.isArray(data.reaction_sequence)
                ? data.reaction_sequence.slice(0, 5)
                : [];

            return {
                reasoning: data.reasoning || '',
                reaction_sequence: sequence,
                primary_mispricer: (data.primary_mispricer || 'unknown') as MarketParticipantCohort,
                sequence_stage: (data.sequence_stage || 'first_wave') as CohortSequenceStage,
                correction_catalyst: data.correction_catalyst || 'unspecified',
                confidence_in_sequence: Math.max(0, Math.min(100, data.confidence_in_sequence ?? 50)),
                confidence_adjustment: boundedAdj,
            };
        } catch (err) {
            console.error(`[CohortSequence] Failed for ${ticker}:`, err);
            return this.neutralResult();
        }
    }

    private static neutralResult(): CohortSequenceResult {
        return {
            reasoning: 'Cohort sequence analysis unavailable',
            reaction_sequence: [],
            primary_mispricer: 'unknown',
            sequence_stage: 'first_wave',
            correction_catalyst: 'unspecified',
            confidence_in_sequence: 0,
            confidence_adjustment: 0,
        };
    }
}
