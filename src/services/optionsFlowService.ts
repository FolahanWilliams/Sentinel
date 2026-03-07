/**
 * Sentinel — Options Flow / Unusual Activity Integration
 *
 * Uses Gemini grounded search to detect unusual options activity
 * (large sweeps, put/call ratio extremes, dark pool prints) that
 * often precede significant price moves.
 *
 * Integrates into the scanner pipeline to boost or penalize signal
 * confidence based on institutional positioning signals.
 */

import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';

export interface OptionsFlowResult {
    hasUnusualActivity: boolean;
    sentiment: 'bullish' | 'bearish' | 'neutral' | 'mixed';
    confidenceAdjustment: number; // -15 to +15
    putCallRatio: number | null;
    largestSweep: string | null;
    darkPoolActivity: string | null;
    summary: string;
    dataSource: 'grounded_search';
}

// In-memory cache: options flow data is expensive to fetch, cache for 15 minutes
const flowCache = new Map<string, { data: OptionsFlowResult; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000;

export class OptionsFlowService {

    /**
     * Fetch unusual options activity for a ticker via Gemini grounded search.
     * Returns sentiment signal and confidence adjustment.
     */
    static async analyze(ticker: string): Promise<OptionsFlowResult> {
        // Check cache
        const cached = flowCache.get(ticker);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return cached.data;
        }

        const today = new Date().toISOString().split('T')[0];

        try {
            const result = await GeminiService.generate<any>({
                prompt: `Search for unusual options activity and institutional flow data for ${ticker.toUpperCase()} as of ${today}.

Look for:
1. Unusually large options sweeps (calls or puts) — volume significantly above open interest
2. Put/call ratio — is it skewed heavily bullish or bearish?
3. Dark pool / block trade prints — large institutional orders off-exchange
4. Any notable options positioning (e.g., massive call buying at specific strikes, protective put purchases)

Evaluate whether the options flow suggests smart money is positioning:
- BULLISH: heavy call buying, low put/call ratio, bullish sweeps
- BEARISH: heavy put buying, high put/call ratio, bearish sweeps
- MIXED: conflicting signals (both calls and puts elevated)
- NEUTRAL: no unusual activity detected

Return ONLY a JSON object:
{"has_unusual_activity": true/false, "sentiment": "bullish|bearish|neutral|mixed", "put_call_ratio": 0.85 or null, "largest_sweep": "description of largest sweep" or null, "dark_pool_activity": "description" or null, "summary": "one paragraph summary of options flow"}

If no data is available, return: {"has_unusual_activity": false, "sentiment": "neutral", "put_call_ratio": null, "largest_sweep": null, "dark_pool_activity": null, "summary": "No unusual options activity detected."}`,
                requireGroundedSearch: true,
                temperature: 0.1,
                model: GEMINI_MODEL,
                // NO responseSchema — incompatible with grounded search
            });

            if (!result.success || !result.data) {
                console.warn(`[OptionsFlow] Grounded search failed for ${ticker}:`, result.error);
                return this.neutralResult();
            }

            // Parse the plain text response
            const rawText = typeof result.data === 'string'
                ? result.data
                : JSON.stringify(result.data);

            let parsed: any;
            try {
                const jsonMatch = rawText.match(/\{[\s\S]*"has_unusual_activity"[\s\S]*\}/);
                if (!jsonMatch) throw new Error('No JSON found in response');
                parsed = JSON.parse(jsonMatch[0]);
            } catch {
                console.warn(`[OptionsFlow] Failed to parse response for ${ticker}`);
                return this.neutralResult();
            }

            // Compute confidence adjustment based on options flow
            let adjustment = 0;
            if (parsed.has_unusual_activity) {
                switch (parsed.sentiment) {
                    case 'bullish':
                        adjustment = 10; // Smart money aligns with long thesis
                        break;
                    case 'bearish':
                        adjustment = -15; // Smart money is hedging/shorting
                        break;
                    case 'mixed':
                        adjustment = -5; // Uncertainty — slight penalty
                        break;
                    default:
                        adjustment = 0;
                }

                // Extreme put/call ratio adjustments
                if (parsed.put_call_ratio !== null) {
                    if (parsed.put_call_ratio > 2.0) {
                        adjustment -= 5; // Very bearish options flow
                    } else if (parsed.put_call_ratio < 0.4) {
                        adjustment += 5; // Very bullish options flow
                    }
                }
            }

            // Clamp adjustment
            adjustment = Math.max(-15, Math.min(15, adjustment));

            const flowResult: OptionsFlowResult = {
                hasUnusualActivity: parsed.has_unusual_activity ?? false,
                sentiment: parsed.sentiment ?? 'neutral',
                confidenceAdjustment: adjustment,
                putCallRatio: parsed.put_call_ratio ?? null,
                largestSweep: parsed.largest_sweep ?? null,
                darkPoolActivity: parsed.dark_pool_activity ?? null,
                summary: parsed.summary ?? 'No data available.',
                dataSource: 'grounded_search',
            };

            // Cache the result
            flowCache.set(ticker, { data: flowResult, timestamp: Date.now() });

            console.log(`[OptionsFlow] ${ticker}: activity=${flowResult.hasUnusualActivity}, sentiment=${flowResult.sentiment}, adj=${adjustment}`);
            return flowResult;

        } catch (err: any) {
            console.error(`[OptionsFlow] Error for ${ticker}:`, err.message);
            return this.neutralResult();
        }
    }

    /**
     * Format options flow data as prompt context for agents.
     */
    static formatForPrompt(result: OptionsFlowResult): string {
        if (!result.hasUnusualActivity) return '';
        const lines = ['\nOPTIONS FLOW / INSTITUTIONAL ACTIVITY:'];
        lines.push(`- Sentiment: ${result.sentiment.toUpperCase()}`);
        if (result.putCallRatio !== null) lines.push(`- Put/Call Ratio: ${result.putCallRatio}`);
        if (result.largestSweep) lines.push(`- Largest Sweep: ${result.largestSweep}`);
        if (result.darkPoolActivity) lines.push(`- Dark Pool: ${result.darkPoolActivity}`);
        lines.push(`- Summary: ${result.summary}`);
        lines.push('Consider institutional positioning when evaluating signal confidence.');
        return lines.join('\n');
    }

    private static neutralResult(): OptionsFlowResult {
        return {
            hasUnusualActivity: false,
            sentiment: 'neutral',
            confidenceAdjustment: 0,
            putCallRatio: null,
            largestSweep: null,
            darkPoolActivity: null,
            summary: 'No unusual options activity detected.',
            dataSource: 'grounded_search',
        };
    }
}
