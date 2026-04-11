/**
 * Sentinel — Other-Mind Simulation Agent (Behavioral Layer, capability #5)
 *
 * Reasons AS THE COUNTERPARTY of a proposed trade. Every signal that ships
 * must name a specific cohort on the other side, a specific cognitive
 * mechanism driving their error, and a specific correction catalyst. If this
 * agent cannot articulate all three concretely, the signal is suppressed.
 *
 * This is the core doctrine shift: Sentinel stops reading news better and
 * starts modeling WHO IS WRONG ABOUT IT.
 *
 * Ships in dry-run mode first — re-runs happen and agent_outputs fields
 * populate, but emit recommendations are not enforced until operators
 * confirm the disagreement distribution is sane. See `isDryRun()` below.
 */

import { GeminiService } from './gemini';
import { OTHER_MIND_AGENT_PROMPT } from './prompts';
import { OTHER_MIND_SCHEMA } from './schemas';
import { GEMINI_MODEL } from '@/config/constants';
import {
    OTHER_MIND_MIN_EDGE_CLARITY,
    OTHER_MIND_DEFER_THRESHOLD,
} from '@/config/constants';
import type { OtherMindResult, MarketParticipantCohort } from '@/types/agents';
import { safeBlock, UNTRUSTED_CONTENT_INSTRUCTION } from '@/utils/promptSanitizer';

export interface OtherMindInput {
    ticker: string;
    signalType: string;
    direction: 'long' | 'short';
    thesis: string;
    reasoning: string;
    eventHeadline: string;
    priceChangePct: number;
    marketRegime?: string;
}

export class OtherMindAgent {

    /**
     * Run the Other-Mind simulation on a surviving thesis.
     *
     * Returns a neutral (suppress=false, edge_clarity=0) result on any failure
     * so that the behavioral-layer orchestrator can treat it as non-fatal.
     * The scanner applies the actual emit gate using the constants below.
     */
    static async simulate(input: OtherMindInput): Promise<OtherMindResult> {
        const {
            ticker, signalType, direction, thesis, reasoning,
            eventHeadline, priceChangePct, marketRegime,
        } = input;

        const prompt = `
TICKER: ${ticker}
SIGNAL TYPE: ${signalType}
DIRECTION: ${direction.toUpperCase()}
PRICE CHANGE: ${priceChangePct.toFixed(2)}%
${marketRegime ? `MARKET REGIME: ${marketRegime}` : ''}

EVENT HEADLINE:${safeBlock('headline', eventHeadline, 200)}

PRIMARY THESIS:${safeBlock('prior_agent', thesis, 600)}

PRIMARY REASONING:${safeBlock('prior_agent', reasoning, 1000)}

You are trading ${direction.toUpperCase()} on this ticker. Someone is on the OTHER SIDE of this trade. Who are they, why do they believe they are right, and what specifically are they getting wrong?

Complete all 7 methodology steps from the system prompt. Return JSON.
`;

        try {
            const result = await GeminiService.generate<OtherMindResult>({
                prompt,
                systemInstruction: UNTRUSTED_CONTENT_INSTRUCTION + '\n\n' + OTHER_MIND_AGENT_PROMPT,
                responseSchema: OTHER_MIND_SCHEMA,
                model: GEMINI_MODEL,
                temperature: 0.3,
                requireGroundedSearch: false,
            });

            if (!result.success || !result.data) {
                console.warn(`[OtherMind] Gemini call failed for ${ticker}: ${result.error}`);
                return this.neutralResult();
            }

            // Normalize: ensure emit_recommendation matches edge_clarity thresholds even if
            // Gemini drifts between the two. edge_clarity is the authoritative score.
            const data = result.data;
            const clarity = Math.max(0, Math.min(100, data.edge_clarity ?? 0));
            const recommendation: OtherMindResult['emit_recommendation'] =
                clarity >= OTHER_MIND_DEFER_THRESHOLD ? 'emit' :
                clarity >= OTHER_MIND_MIN_EDGE_CLARITY ? 'defer' :
                'suppress';

            return {
                reasoning: data.reasoning || '',
                counterparty_cohort: (data.counterparty_cohort || 'unknown') as MarketParticipantCohort,
                counterparty_latency: data.counterparty_latency || 'days',
                counterparty_dominant_bias: data.counterparty_dominant_bias || 'unknown',
                counterparty_trigger: data.counterparty_trigger || 'unknown',
                counterparty_best_case: data.counterparty_best_case || '',
                counterparty_weakness: data.counterparty_weakness || '',
                correction_catalyst: data.correction_catalyst || 'unspecified',
                correction_window_days: Math.max(1, Math.floor(data.correction_window_days ?? 14)),
                edge_clarity: clarity,
                emit_recommendation: recommendation,
            };
        } catch (err) {
            console.error(`[OtherMind] Failed for ${ticker}:`, err);
            return this.neutralResult();
        }
    }

    /**
     * Neutral fallback when the Gemini call fails. Returns a 'defer' result
     * with zero edge clarity so that the scanner's gate logic can choose
     * whether to block or pass based on the dry-run flag state.
     */
    private static neutralResult(): OtherMindResult {
        return {
            reasoning: 'Other-Mind analysis unavailable',
            counterparty_cohort: 'unknown',
            counterparty_latency: 'days',
            counterparty_dominant_bias: 'unknown',
            counterparty_trigger: 'unknown',
            counterparty_best_case: '',
            counterparty_weakness: '',
            correction_catalyst: 'unspecified',
            correction_window_days: 14,
            edge_clarity: 0,
            emit_recommendation: 'defer',
        };
    }
}
