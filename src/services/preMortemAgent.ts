/**
 * Sentinel — Pre-Mortem Agent (Decision Intel Port)
 *
 * Implements Gary Klein's Pre-Mortem technique for trading signals.
 * Assumes the trade has ALREADY FAILED and works backwards to identify
 * the 3 most likely failure scenarios with probabilities, severities,
 * and early warning signs.
 *
 * This is the single most impactful debiasing technique from Kahneman/Klein
 * research — it forces the system to confront failure modes before committing.
 */

import { GeminiService } from './gemini';
import { PRE_MORTEM_AGENT_PROMPT } from './prompts';
import { PRE_MORTEM_SCHEMA } from './schemas';
import { GEMINI_MODEL } from '@/config/constants';
import {
    PRE_MORTEM_HIGH_RISK_PENALTY,
    PRE_MORTEM_MODERATE_RISK_PENALTY,
    PRE_MORTEM_HIGH_RISK_THRESHOLD,
    PRE_MORTEM_MODERATE_RISK_THRESHOLD,
} from '@/config/constants';
import type { PreMortemResult } from '@/types/agents';

export class PreMortemAgent {

    /**
     * Run a pre-mortem analysis on a surviving thesis.
     *
     * @param ticker           The stock ticker
     * @param thesis           The primary agent's thesis
     * @param reasoning        The primary agent's reasoning
     * @param confidence       Current confidence after prior adjustments
     * @param signalType       Which agent produced this signal
     * @param cascadingContext  Optional upstream agent context for richer failure analysis
     */
    static async analyze(
        ticker: string,
        thesis: string,
        reasoning: string,
        confidence: number,
        signalType: string,
        cascadingContext?: string,
    ): Promise<PreMortemResult> {
        const contextBlock = cascadingContext || '';

        const prompt = `
TICKER: ${ticker}
SIGNAL TYPE: ${signalType}
CURRENT CONFIDENCE: ${confidence}
THESIS: "${thesis}"
REASONING: "${reasoning}"
${contextBlock}

Now assume this trade has FAILED. Work backwards and identify the 3 most likely failure scenarios.
Return JSON.
`;

        try {
            const result = await GeminiService.generate<{
                scenarios: Array<{
                    description: string;
                    probability: number;
                    severity: 'mild' | 'moderate' | 'severe';
                    early_warning_sign: string;
                }>;
                avg_failure_probability: number;
                highest_risk_scenario: string;
                resilience_rating: 'fragile' | 'moderate' | 'resilient';
            }>({
                prompt,
                systemInstruction: PRE_MORTEM_AGENT_PROMPT,
                responseSchema: PRE_MORTEM_SCHEMA,
                model: GEMINI_MODEL,
                temperature: 0.5,  // moderate creativity for scenario generation
            });

            if (!result.success || !result.data) {
                console.warn(`[PreMortem] Gemini call failed for ${ticker}: ${result.error}`);
                return this.neutralResult();
            }

            const data = result.data;

            // Ensure exactly 3 scenarios (defensive)
            const scenarios = (data.scenarios || []).slice(0, 3);
            const avgProb = data.avg_failure_probability ?? this.computeAvgProbability(scenarios);
            const severeCount = scenarios.filter(s => s.severity === 'severe').length;

            // Compute penalty based on plan rules
            let penalty = 0;
            if (avgProb > PRE_MORTEM_HIGH_RISK_THRESHOLD && severeCount >= 2) {
                penalty = PRE_MORTEM_HIGH_RISK_PENALTY;
            } else if (avgProb > PRE_MORTEM_MODERATE_RISK_THRESHOLD && severeCount >= 1) {
                penalty = PRE_MORTEM_MODERATE_RISK_PENALTY;
            }

            // Determine resilience rating (validate Gemini's output)
            let resilience: 'fragile' | 'moderate' | 'resilient' = data.resilience_rating || 'moderate';
            if (avgProb > 50 || severeCount >= 2) resilience = 'fragile';
            else if (avgProb < 30 && severeCount === 0) resilience = 'resilient';
            else resilience = 'moderate';

            return {
                scenarios,
                avg_failure_probability: avgProb,
                highest_risk_scenario: data.highest_risk_scenario || scenarios[0]?.description || 'Unknown',
                confidence_penalty: penalty,
                resilience_rating: resilience,
            };
        } catch (err) {
            console.error(`[PreMortem] Failed for ${ticker}:`, err);
            return this.neutralResult();
        }
    }

    private static computeAvgProbability(scenarios: Array<{ probability: number }>): number {
        if (scenarios.length === 0) return 0;
        return Math.round(scenarios.reduce((sum, s) => sum + (s.probability || 0), 0) / scenarios.length);
    }

    private static neutralResult(): PreMortemResult {
        return {
            scenarios: [],
            avg_failure_probability: 0,
            highest_risk_scenario: 'Analysis unavailable',
            confidence_penalty: 0,
            resilience_rating: 'moderate',
        };
    }
}
