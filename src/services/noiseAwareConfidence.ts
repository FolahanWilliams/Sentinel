/**
 * Sentinel — Noise-Aware Confidence Service (Phase 2 — P0)
 *
 * Runs 3 independent Gemini calls on the same thesis at different temperatures
 * (0.3 / 0.5 / 0.7) and uses the spread between scores to either penalise
 * (divergent judges = LLM is uncertain) or modestly boost (tight convergence =
 * LLM is confident) the final signal confidence.
 *
 *   std_dev > NOISE_JUDGE_DIVERGENCE_THRESHOLD  → penalty
 *   std_dev < NOISE_JUDGE_CONVERGENCE_THRESHOLD → small boost
 *   otherwise                                   → no adjustment
 *
 * Temperature choices mirror a real deliberation panel:
 *   Low  (0.3) = conservative judge
 *   Mid  (0.5) = balanced judge
 *   High (0.7) = optimistic judge
 */

import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';
import {
    NOISE_JUDGE_DIVERGENCE_THRESHOLD,
    NOISE_JUDGE_CONVERGENCE_THRESHOLD,
    NOISE_JUDGE_DIVERGENCE_PENALTY,
    NOISE_JUDGE_CONVERGENCE_BOOST,
    CONFIDENCE_FLOOR,
} from '@/config/constants';
import type { NoiseConfidenceResult } from '@/types/agents';

// ── Minimal schema: we only need one number from each judge call ──────────────
const JUDGE_SCHEMA = {
    type: "object",
    properties: {
        confidence_score: {
            type: "integer",
            description: "Your independent 0-100 confidence that this thesis represents a genuine trading opportunity."
        },
        brief_rationale: {
            type: "string",
            description: "One sentence justifying your score."
        }
    },
    required: ["confidence_score", "brief_rationale"]
};

const JUDGE_SYSTEM_PROMPT = `You are an independent trading thesis evaluator.
You will be given a trading thesis and reasoning. Your ONLY job is to assign an independent confidence score (0-100) representing how likely this thesis is to be correct.
Do NOT be influenced by the confidence score previously assigned. Evaluate the evidence yourself.
Be honest. If the reasoning is thin, score low. If it is compelling, score high.
Return JSON only.`;

const TEMPERATURES: [number, number, number] = [0.3, 0.5, 0.7];

function stdDev(values: [number, number, number]): number {
    const mean = (values[0] + values[1] + values[2]) / 3;
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / 3;
    return Math.sqrt(variance);
}

export class NoiseAwareConfidenceService {

    /**
     * Run the 3-judge panel on a thesis.
     *
     * @param thesis         The primary agent's thesis
     * @param reasoning      The primary agent's reasoning
     * @param originalConfidence  The current confidence before the panel
     * @param agentName      Which agent produced this signal (for logging)
     */
    static async evaluate(
        thesis: string,
        reasoning: string,
        originalConfidence: number,
        agentName: string
    ): Promise<NoiseConfidenceResult> {
        const prompt = `
ORIGINATING AGENT: ${agentName}
THESIS: "${thesis}"
REASONING: "${reasoning}"

Assign your independent confidence score. Do not anchor to any prior score.
Return JSON.
`;

        // Fire all 3 judge calls in parallel — allSettled so a single judge failure
        // falls back to original confidence rather than rejecting the whole panel
        const [lowSettled, midSettled, highSettled] = await Promise.allSettled(
            TEMPERATURES.map(temp =>
                GeminiService.generate({
                    prompt,
                    systemInstruction: JUDGE_SYSTEM_PROMPT,
                    requireGroundedSearch: false,
                    responseSchema: JUDGE_SCHEMA,
                    temperature: temp,
                    model: GEMINI_MODEL,
                })
            )
        );

        const low  = lowSettled.status  === 'fulfilled' ? lowSettled.value  : null;
        const mid  = midSettled.status  === 'fulfilled' ? midSettled.value  : null;
        const high = highSettled.status === 'fulfilled' ? highSettled.value : null;

        // Extract scores — fall back to original confidence if a judge call failed
        const scores: [number, number, number] = [
            low?.success && low.data ? Math.max(0, Math.min(100, low.data.confidence_score)) : originalConfidence,
            mid?.success && mid.data ? Math.max(0, Math.min(100, mid.data.confidence_score)) : originalConfidence,
            high?.success && high.data ? Math.max(0, Math.min(100, high.data.confidence_score)) : originalConfidence,
        ];

        const mean = Math.round((scores[0] + scores[1] + scores[2]) / 3);
        const sd = stdDev(scores);
        const divergent = sd > NOISE_JUDGE_DIVERGENCE_THRESHOLD;
        const convergent = sd < NOISE_JUDGE_CONVERGENCE_THRESHOLD;

        let adjustment = 0;
        let summary: string;

        if (divergent) {
            adjustment = -NOISE_JUDGE_DIVERGENCE_PENALTY;
            summary = `Judges diverged (σ=${sd.toFixed(1)}, scores: ${scores.join('/')}). High LLM uncertainty → penalty ${adjustment}.`;
        } else if (convergent) {
            adjustment = NOISE_JUDGE_CONVERGENCE_BOOST;
            summary = `Judges converged (σ=${sd.toFixed(1)}, scores: ${scores.join('/')}). Strong consensus → boost +${adjustment}.`;
        } else {
            summary = `Judges within normal range (σ=${sd.toFixed(1)}, scores: ${scores.join('/')}). No adjustment.`;
        }

        const adjusted = Math.max(CONFIDENCE_FLOOR, originalConfidence + adjustment);

        return {
            scores,
            mean,
            std_dev: Math.round(sd * 10) / 10,
            convergent,
            divergent,
            confidence_adjustment: adjustment,
            adjusted_confidence: adjusted,
            summary,
        };
    }
}
