/**
 * Sentinel — Self-Critique Agent (Phase 5)
 *
 * After any agent (overreaction, contagion, earnings) generates a signal,
 * this module runs a second-pass "critic" call that challenges the thesis.
 * If the critique finds a fatal flaw, the signal confidence is reduced.
 *
 * This implements the "Think → Critique → Decide" loop.
 */

import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';

export interface CritiqueResult {
    hasFlaws: boolean;
    criticalFlaws: string[];
    minorFlaws: string[];
    adjustedConfidence: number;
    critiqueReasoning: string;
}

const CRITIQUE_PROMPT = `You are the SELF-CRITIQUE module for SENTINEL, a quantitative trading AI.

You are given:
1. The original agent's thesis and reasoning for a trade signal
2. The confidence score assigned by the original agent
3. The Red Team's counter-thesis (if available)

Your job is to find LOGICAL FLAWS, BLIND SPOTS, and OVERCONFIDENCE in the original analysis.

ANALYSIS FRAMEWORK:
- Does the reasoning actually support the conclusion, or is it circular?
- Are there unstated assumptions? (e.g., "the market always mean-reverts" — it doesn't)
- Is the confidence score calibrated? (90%+ should require overwhelming evidence)
- Does the thesis acknowledge the specific risk scenario that could invalidate it?
- Is the timeframe realistic for the proposed setup?
- Are price targets anchored to something concrete, or just round numbers?

WHAT COUNTS AS A CRITICAL FLAW (be strict about this classification):
- The thesis contradicts known facts or the provided data
- The trade is structurally unsound (e.g., wrong direction, impossible price targets)
- A specific near-term catalyst will invalidate the thesis (e.g., earnings tomorrow, FDA ruling next week)
- The reasoning is circular or the conclusion does not follow from the evidence

WHAT IS A MINOR FLAW (most concerns should go here):
- General macro uncertainty or sector headwinds
- Timeframe might be optimistic
- Position sizing concerns
- Valuation is stretched but not extreme
- "Markets could go lower" type concerns
- Missing context that doesn't invalidate the thesis

CONFIDENCE ADJUSTMENT RULES:
- Total adjustment is based on the OVERALL quality of the thesis, not per-flaw arithmetic
- Strong thesis with minor concerns only: reduce by 5-10 points total
- Thesis has one genuine critical flaw: reduce by 15-20 points total
- Thesis has multiple critical flaws: reduce by 20-30 points total (absolute maximum)
- NEVER reduce by more than 30 points total regardless of flaw count
- NEVER increase confidence above the original — you are a critic, not a cheerleader
- Minimum confidence after adjustment: 30

IMPORTANT: You are a quality filter, not an adversary. If the Red Team already passed this trade, your job is to catch what they missed — not to re-litigate the same concerns. A trade that survived the Red Team with a sound thesis should typically lose only 5-15 points here.

Return a JSON object with your critique.`;

const CRITIQUE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        has_flaws: { type: 'BOOLEAN' },
        critical_flaws: {
            type: 'ARRAY',
            items: { type: 'STRING' },
        },
        minor_flaws: {
            type: 'ARRAY',
            items: { type: 'STRING' },
        },
        adjusted_confidence: { type: 'NUMBER' },
        critique_reasoning: { type: 'STRING' },
    },
    required: ['has_flaws', 'critical_flaws', 'minor_flaws', 'adjusted_confidence', 'critique_reasoning'],
};

export class SelfCritiqueAgent {
    /**
     * Run self-critique on an agent's output.
     * Returns adjusted confidence and critique details.
     */
    static async critique(
        ticker: string,
        originalThesis: string,
        originalReasoning: string,
        originalConfidence: number,
        counterThesis?: string,
        signalType?: string
    ): Promise<CritiqueResult> {
        const counterBlock = counterThesis
            ? `\nRED TEAM COUNTER-THESIS: "${counterThesis}"`
            : '\nNo Red Team counter-thesis available.';

        const prompt = `
TICKER: ${ticker}
SIGNAL TYPE: ${signalType || 'unknown'}
ORIGINAL CONFIDENCE: ${originalConfidence}%

ORIGINAL THESIS: "${originalThesis}"

ORIGINAL REASONING: "${originalReasoning}"
${counterBlock}

Critique this analysis. Find flaws, blind spots, and overconfidence.
Return your adjusted confidence and reasoning.`;

        try {
            const result = await GeminiService.generate<any>({
                prompt,
                systemInstruction: CRITIQUE_PROMPT,
                responseSchema: CRITIQUE_SCHEMA,
                temperature: 0.3,
                model: GEMINI_MODEL,
            });

            if (!result.success || !result.data) {
                console.warn('[SelfCritique] Critique call failed, returning original confidence');
                return {
                    hasFlaws: false,
                    criticalFlaws: [],
                    minorFlaws: [],
                    adjustedConfidence: originalConfidence,
                    critiqueReasoning: 'Critique unavailable — using original confidence.',
                };
            }

            const data = result.data;

            // Enforce: never increase above original, and cap max reduction at 30 points
            const rawAdjusted = data.adjusted_confidence ?? originalConfidence;
            const maxReduction = 30;
            const adjustedConf = Math.min(
                originalConfidence,
                Math.max(30, Math.max(rawAdjusted, originalConfidence - maxReduction))
            );

            return {
                hasFlaws: data.has_flaws ?? false,
                criticalFlaws: data.critical_flaws ?? [],
                minorFlaws: data.minor_flaws ?? [],
                adjustedConfidence: adjustedConf,
                critiqueReasoning: data.critique_reasoning ?? '',
            };
        } catch (err) {
            console.error('[SelfCritique] Error:', err);
            return {
                hasFlaws: false,
                criticalFlaws: [],
                minorFlaws: [],
                adjustedConfidence: originalConfidence,
                critiqueReasoning: 'Critique failed — using original confidence.',
            };
        }
    }
}
