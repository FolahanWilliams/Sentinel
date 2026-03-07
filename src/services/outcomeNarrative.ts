/**
 * Sentinel — Outcome Narrative Generator
 *
 * At each outcome checkpoint (1d, 5d, 10d, 30d), generates a brief
 * AI narrative explaining what happened and why.
 */

import { GeminiService } from './gemini';
import { GEMINI_MODEL_LITE } from '@/config/constants';

export interface OutcomeNarrativeResult {
    narrative: string;
    key_drivers: string[];
    thesis_validation: 'confirmed' | 'partially_confirmed' | 'invalidated' | 'inconclusive';
}

export class OutcomeNarrativeGenerator {
    /**
     * Generate an AI narrative for a signal's outcome at a given checkpoint.
     *
     * Uses grounded search so Gemini can look up what actually happened with
     * the stock. Since grounded search is incompatible with responseSchema
     * in the proxy, we ask for JSON in the prompt and parse manually.
     */
    static async generateNarrative(params: {
        ticker: string;
        originalThesis: string;
        entryPrice: number;
        currentPrice: number;
        returnPct: number;
        daysElapsed: number;
        hitTarget: boolean;
        hitStop: boolean;
    }): Promise<OutcomeNarrativeResult | null> {
        const { ticker, originalThesis, entryPrice, currentPrice, returnPct, daysElapsed, hitTarget, hitStop } = params;

        const direction = returnPct >= 0 ? 'up' : 'down';
        const outcomeLabel = hitTarget ? 'HIT TARGET' : hitStop ? 'HIT STOP-LOSS' : 'OPEN';

        const prompt = `Stock outcome analysis for ${ticker}:
- Entry: $${entryPrice.toFixed(2)} → Current: $${currentPrice.toFixed(2)} (${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(1)}% ${direction}, ${daysElapsed}d)
- Status: ${outcomeLabel}
- Original thesis: "${originalThesis}"

What drove ${ticker}'s ${Math.abs(returnPct).toFixed(1)}% move over ${daysElapsed} days? Was the original thesis correct?

Respond with ONLY a JSON object (no markdown):
{"narrative":"2-3 sentence explanation","key_drivers":["driver1","driver2"],"thesis_validation":"confirmed|partially_confirmed|invalidated|inconclusive"}`;

        const result = await GeminiService.generate<string>({
            prompt,
            systemInstruction:
                'You are a concise financial analyst. Return ONLY valid JSON. ' +
                'Use real recent news and price data to explain the outcome.',
            model: GEMINI_MODEL_LITE,
            temperature: 0.2,
            requireGroundedSearch: true,
            // NOTE: responseSchema intentionally omitted — incompatible with grounded search.
            // The proxy skips responseSchema when grounded search is enabled anyway,
            // so we parse the JSON manually below.
        });

        if (!result.success || !result.data) {
            console.error('[OutcomeNarrative] Gemini call failed:', result.error);
            return null;
        }

        try {
            const rawText = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);

            // Strip markdown code fences if present
            const cleaned = rawText
                .replace(/^```(?:json)?\s*\n?/i, '')
                .replace(/\n?```\s*$/i, '')
                .trim();

            // Extract JSON object with regex in case of surrounding prose
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('[OutcomeNarrative] No JSON object found in response:', cleaned.slice(0, 200));
                return null;
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Validate required fields
            const validThesis = ['confirmed', 'partially_confirmed', 'invalidated', 'inconclusive'];
            const thesisValidation = validThesis.includes(parsed.thesis_validation)
                ? parsed.thesis_validation
                : 'inconclusive';

            return {
                narrative: String(parsed.narrative ?? ''),
                key_drivers: Array.isArray(parsed.key_drivers)
                    ? parsed.key_drivers.map(String)
                    : [],
                thesis_validation: thesisValidation,
            };

        } catch (err) {
            console.error('[OutcomeNarrative] Failed to parse response:', err);
            return null;
        }
    }
}
