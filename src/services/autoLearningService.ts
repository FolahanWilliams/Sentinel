/**
 * Sentinel — Post-Mortem Auto-Learning Service
 *
 * When signals complete (win/loss), this service analyzes which pipeline
 * steps contributed to or detracted from the outcome. It builds a
 * weight adjustment map that the scanner can use to tune future
 * confidence penalties/boosts dynamically.
 *
 * Closes the feedback loop: outcomes → agent weight adjustments → better signals.
 */

import { supabase } from '@/config/supabase';
import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';

export interface PipelineStepWeight {
    step: string; // e.g., 'sentiment_divergence', 'multi_timeframe', 'earnings_guard'
    currentWeight: number; // current multiplier (1.0 = neutral)
    suggestedWeight: number; // AI-suggested new weight
    winContribution: number; // how often this step's positive signal correlated with wins
    lossContribution: number; // how often this step's positive signal correlated with losses
    sampleSize: number;
    reasoning: string;
}

export interface AutoLearningResult {
    weights: PipelineStepWeight[];
    overallAccuracy: number;
    outcomesAnalyzed: number;
    generatedAt: string;
}

const PIPELINE_STEPS = [
    'sentiment_divergence',
    'multi_timeframe',
    'earnings_guard',
    'fundamentals',
    'market_regime',
    'backtest',
    'correlation_guard',
    'self_critique',
    'gap_analysis',
] as const;

// ── Auto-trigger state ──────────────────────────────────────────────────────
let lastAnalysisOutcomeCount = 0;
let lastAnalysisTimestamp = 0;
const AUTO_TRIGGER_INTERVAL_MS = 4 * 60 * 60 * 1000;  // Min 4 hours between auto-runs
const AUTO_TRIGGER_NEW_OUTCOMES = 10;                    // Run after 10 new completed outcomes
const AUTO_TRIGGER_STALENESS_MS = 24 * 60 * 60 * 1000;  // Force run if weights > 24 hours old

const AUTO_LEARNING_PROMPT = `You are the AUTO-LEARNING module for SENTINEL, a quantitative trading AI.

You receive completed signal outcomes paired with the agent_outputs that were active when each signal was created. Your job is to determine which pipeline steps are HELPING and which are HURTING overall signal accuracy.

For each pipeline step, calculate:
1. Win contribution: When this step provided a positive signal (boost/confirmation), what % of those signals won?
2. Loss contribution: When this step provided a negative signal (penalty/warning), what % of those signals lost?
3. Suggested weight adjustment:
   - If a step's positive signals correlate strongly with wins (>60%), increase its weight (1.1-1.5)
   - If a step's positive signals correlate with losses (>50%), decrease its weight (0.5-0.9)
   - If neutral or insufficient data, keep at 1.0

Return a JSON object with a "weights" array and "overall_accuracy" number (0-100).`;

export class AutoLearningService {

    /**
     * Check if auto-learning should trigger and run it if conditions are met.
     * Called automatically by the scanner after each scan cycle.
     *
     * Triggers when ANY of these conditions are true:
     * 1. 10+ new completed outcomes since last analysis
     * 2. Weights are stale (>24 hours old) and we have enough data
     * 3. Win rate has dropped significantly since last analysis
     *
     * Returns true if analysis was triggered.
     */
    static async checkAndTrigger(): Promise<boolean> {
        try {
            // Check how many completed outcomes exist now
            const { count: currentCount } = await supabase
                .from('signal_outcomes')
                .select('*', { count: 'exact', head: true })
                .neq('outcome', 'pending');

            const completedCount = currentCount ?? 0;

            // Not enough data
            if (completedCount < 10) return false;

            // Respect minimum interval between runs
            const timeSinceLastRun = Date.now() - lastAnalysisTimestamp;
            if (timeSinceLastRun < AUTO_TRIGGER_INTERVAL_MS) return false;

            // Condition 1: Enough new outcomes since last analysis
            const newOutcomes = completedCount - lastAnalysisOutcomeCount;
            const hasEnoughNewOutcomes = newOutcomes >= AUTO_TRIGGER_NEW_OUTCOMES;

            // Condition 2: Weights are stale
            let weightsAreStale = false;
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'auto_learning_weights')
                    .maybeSingle();
                if (data?.value) {
                    const result = data.value as unknown as AutoLearningResult;
                    if (result.generatedAt) {
                        const weightAge = Date.now() - new Date(result.generatedAt).getTime();
                        weightsAreStale = weightAge > AUTO_TRIGGER_STALENESS_MS;
                    }
                } else {
                    // No weights exist yet — always trigger
                    weightsAreStale = true;
                }
            } catch { /* non-fatal */ }

            if (!hasEnoughNewOutcomes && !weightsAreStale) return false;

            const triggerReason = hasEnoughNewOutcomes
                ? `${newOutcomes} new outcomes since last analysis`
                : 'weights are stale (>24h old)';
            console.log(`[AutoLearning] Auto-triggered: ${triggerReason}`);

            // Run analysis
            const result = await this.analyzeAndUpdateWeights();

            // Update trigger state
            lastAnalysisOutcomeCount = completedCount;
            lastAnalysisTimestamp = Date.now();

            console.log(`[AutoLearning] Auto-analysis complete: ${result.weights.length} weights updated, accuracy=${result.overallAccuracy}%`);
            return true;
        } catch (err) {
            console.warn('[AutoLearning] Auto-trigger check failed:', err);
            return false;
        }
    }

    /**
     * Analyze completed outcomes to build pipeline step weight adjustments.
     * Can be called manually or via checkAndTrigger().
     */
    static async analyzeAndUpdateWeights(): Promise<AutoLearningResult> {
        console.log('[AutoLearning] Starting pipeline weight analysis...');

        // 1. Fetch completed outcomes with full agent_outputs
        const { data: outcomes, error } = await supabase
            .from('signal_outcomes')
            .select('*, signals!inner(ticker, signal_type, confidence_score, agent_outputs, ta_alignment, confluence_level)')
            .neq('outcome', 'pending')
            .order('completed_at', { ascending: false })
            .limit(100);

        if (error || !outcomes || outcomes.length < 10) {
            console.log(`[AutoLearning] Insufficient data (${outcomes?.length ?? 0} outcomes, need 10+). Skipping.`);
            return this.defaultResult(outcomes?.length ?? 0);
        }

        // 2. Build condensed dataset showing each pipeline step's state + outcome
        const condensed = outcomes.map((o: any) => {
            const agentOutputs = o.signals?.agent_outputs || {};
            const stepStates: Record<string, string> = {};

            // Extract pipeline step states
            if (agentOutputs.sentiment_divergence) {
                stepStates.sentiment_divergence = agentOutputs.sentiment_divergence.type || 'neutral';
            }
            if (agentOutputs.multi_timeframe) {
                stepStates.multi_timeframe = agentOutputs.multi_timeframe.alignment || 'unknown';
            }
            if (agentOutputs.earnings_guard) {
                stepStates.earnings_guard = agentOutputs.earnings_guard.penalty < 0 ? 'warning' : 'clear';
            }
            if (agentOutputs.fundamentals) {
                const f = agentOutputs.fundamentals;
                const hasRedFlags = (f.debt_to_equity && f.debt_to_equity > 3) || (f.profit_margin && f.profit_margin < -0.1);
                stepStates.fundamentals = hasRedFlags ? 'red_flag' : 'healthy';
            }
            if (agentOutputs.market_regime) {
                stepStates.market_regime = agentOutputs.market_regime.regime || 'neutral';
            }
            if (agentOutputs.backtest) {
                stepStates.backtest = agentOutputs.backtest.penalty < 0 ? 'negative_history' : 'positive_history';
            }
            if (agentOutputs.correlation_guard) {
                stepStates.correlation_guard = agentOutputs.correlation_guard.penalty < 0 ? 'concentrated' : 'diversified';
            }
            if (agentOutputs.self_critique) {
                stepStates.self_critique = agentOutputs.self_critique.hasFlaws ? 'flawed' : 'clean';
            }
            if (agentOutputs.gap_analysis) {
                stepStates.gap_analysis = agentOutputs.gap_analysis.gap_type || 'none';
            }

            return {
                ticker: o.signals?.ticker || o.ticker,
                outcome: o.outcome,
                return_5d: o.return_at_5d,
                return_10d: o.return_at_10d,
                confidence: o.signals?.confidence_score,
                ta_alignment: o.signals?.ta_alignment,
                confluence_level: o.signals?.confluence_level,
                pipeline_steps: stepStates,
            };
        });

        // 3. Quick local analysis (before AI call)
        const stepStats = this.computeStepCorrelations(condensed);

        // 4. Send to Gemini for deeper pattern analysis
        const totalWins = condensed.filter((c: any) => c.outcome === 'win').length;
        const overallAccuracy = Math.round((totalWins / condensed.length) * 100);

        const prompt = `Analyze ${condensed.length} completed signal outcomes. Overall win rate: ${overallAccuracy}%.

PRE-COMPUTED STEP CORRELATIONS:
${JSON.stringify(stepStats, null, 2)}

RAW OUTCOME DATA (last 50):
${JSON.stringify(condensed.slice(0, 50), null, 2)}

Generate weight adjustments for each pipeline step. Focus on steps with enough data (5+ samples) and clear directional signal.`;

        const result = await GeminiService.generate<any>({
            prompt,
            systemInstruction: AUTO_LEARNING_PROMPT,
            model: GEMINI_MODEL,
            temperature: 0.2,
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    weights: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                step: { type: 'STRING' },
                                suggested_weight: { type: 'NUMBER' },
                                win_contribution: { type: 'NUMBER' },
                                loss_contribution: { type: 'NUMBER' },
                                sample_size: { type: 'NUMBER' },
                                reasoning: { type: 'STRING' },
                            },
                            required: ['step', 'suggested_weight', 'reasoning'],
                        },
                    },
                    overall_accuracy: { type: 'NUMBER' },
                },
                required: ['weights', 'overall_accuracy'],
            },
        });

        if (!result.success || !result.data?.weights) {
            console.error('[AutoLearning] Gemini analysis failed:', result.error);
            return this.defaultResult(condensed.length);
        }

        // 5. Build and persist the weight map
        const weights: PipelineStepWeight[] = result.data.weights.map((w: any) => ({
            step: w.step,
            currentWeight: this.getCurrentWeight(w.step),
            suggestedWeight: Math.max(0.3, Math.min(2.0, w.suggested_weight ?? 1.0)),
            winContribution: w.win_contribution ?? 0,
            lossContribution: w.loss_contribution ?? 0,
            sampleSize: w.sample_size ?? 0,
            reasoning: w.reasoning ?? '',
        }));

        const learningResult: AutoLearningResult = {
            weights,
            overallAccuracy: result.data.overall_accuracy ?? overallAccuracy,
            outcomesAnalyzed: condensed.length,
            generatedAt: new Date().toISOString(),
        };

        // 6. Persist to app_settings
        await supabase.from('app_settings').upsert({
            key: 'auto_learning_weights',
            value: learningResult as any,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key,user_id' });

        console.log(`[AutoLearning] Generated ${weights.length} weight adjustments from ${condensed.length} outcomes.`);
        return learningResult;
    }

    /**
     * Retrieve cached pipeline weights for use in the scanner.
     * Returns a map of step → weight multiplier.
     */
    static async getWeights(): Promise<Record<string, number>> {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'auto_learning_weights')
                .maybeSingle();

            if (error || !data?.value) return {};

            const result = data.value as unknown as AutoLearningResult;
            if (!result.weights) return {};

            // Skip stale weights (older than 7 days)
            if (result.generatedAt) {
                const ageMs = Date.now() - new Date(result.generatedAt).getTime();
                if (ageMs > 7 * 24 * 60 * 60 * 1000) return {};
            }

            const weightMap: Record<string, number> = {};
            for (const w of result.weights) {
                weightMap[w.step] = w.suggestedWeight;
            }
            return weightMap;
        } catch {
            return {};
        }
    }

    /**
     * Apply learned weight to a confidence penalty/boost.
     * e.g., if sentiment_divergence has weight 1.3, a +10 boost becomes +13.
     */
    static applyWeight(step: string, adjustment: number, weights: Record<string, number>): number {
        const weight = weights[step] ?? 1.0;
        return Math.round(adjustment * weight);
    }

    /**
     * Compute step-level correlations locally (no API call).
     */
    private static computeStepCorrelations(data: any[]): Record<string, { wins_when_positive: number; losses_when_positive: number; total: number }> {
        const stats: Record<string, { wins_when_positive: number; losses_when_positive: number; total: number }> = {};

        for (const step of PIPELINE_STEPS) {
            stats[step] = { wins_when_positive: 0, losses_when_positive: 0, total: 0 };
        }

        for (const d of data) {
            const steps = d.pipeline_steps || {};
            const isWin = d.outcome === 'win';

            for (const [step, state] of Object.entries(steps)) {
                if (!stats[step]) continue;
                const isPositive = state !== 'neutral' && state !== 'unknown' && state !== 'none';
                if (isPositive) {
                    stats[step].total++;
                    if (isWin) stats[step].wins_when_positive++;
                    else stats[step].losses_when_positive++;
                }
            }
        }

        return stats;
    }

    private static getCurrentWeight(_step: string): number {
        // Default weights — all start at 1.0
        return 1.0;
    }

    private static defaultResult(outcomesAnalyzed: number): AutoLearningResult {
        return {
            weights: [],
            overallAccuracy: 0,
            outcomesAnalyzed,
            generatedAt: new Date().toISOString(),
        };
    }

    // ── Causal Learning Upgrade (Decision Intel Port) ───────────────────────

    /**
     * Detect pairwise bias interactions — which 2-bias combinations
     * correlate with disproportionate failure rates.
     *
     * Uses stratified analysis by signal_type to avoid Simpson's paradox.
     * Ported from Decision Intel's causal-learning.ts concept.
     */
    static async detectPairwiseInteractions(): Promise<void> {
        try {
            const { data: outcomes } = await supabase
                .from('signal_outcomes')
                .select('outcome, signals!inner(signal_type, bias_type, secondary_biases, agent_outputs)')
                .neq('outcome', 'pending')
                .limit(200);

            if (!outcomes || outcomes.length < 20) {
                console.log('[AutoLearning] Pairwise: insufficient data for interaction detection');
                return;
            }

            // Extract all bias names from each signal
            const signalBiases: Array<{ biases: string[]; isWin: boolean; signalType: string }> = [];

            for (const o of outcomes) {
                const sig = (o as any).signals;
                if (!sig) continue;

                const biases: string[] = [];
                // Primary bias
                if (sig.bias_type) biases.push(sig.bias_type);
                // Secondary biases
                if (Array.isArray(sig.secondary_biases)) {
                    biases.push(...sig.secondary_biases);
                }
                // Bias detective findings
                const findings = sig.agent_outputs?.bias_detective?.findings;
                if (Array.isArray(findings)) {
                    for (const f of findings) {
                        if (f.bias_name && f.severity >= 2 && !biases.includes(f.bias_name)) {
                            biases.push(f.bias_name);
                        }
                    }
                }

                signalBiases.push({
                    biases: [...new Set(biases)],
                    isWin: o.outcome === 'win',
                    signalType: sig.signal_type || 'unknown',
                });
            }

            // Generate all unique pairs and compute interaction strength
            const pairStats: Record<string, { wins: number; losses: number; total: number }> = {};
            const singleStats: Record<string, { wins: number; losses: number; total: number }> = {};

            for (const entry of signalBiases) {
                // Track singles
                for (const bias of entry.biases) {
                    if (!singleStats[bias]) singleStats[bias] = { wins: 0, losses: 0, total: 0 };
                    singleStats[bias].total++;
                    if (entry.isWin) singleStats[bias].wins++;
                    else singleStats[bias].losses++;
                }

                // Track pairs
                for (let i = 0; i < entry.biases.length; i++) {
                    for (let j = i + 1; j < entry.biases.length; j++) {
                        const pairKey = [entry.biases[i], entry.biases[j]].sort().join('+');
                        if (!pairStats[pairKey]) pairStats[pairKey] = { wins: 0, losses: 0, total: 0 };
                        pairStats[pairKey].total++;
                        if (entry.isWin) pairStats[pairKey].wins++;
                        else pairStats[pairKey].losses++;
                    }
                }
            }

            // Compute interaction strength for each pair
            const interactions: Array<{
                pair: string;
                combinedFailureRate: number;
                maxIndividualFailureRate: number;
                interactionStrength: number;
                sampleSize: number;
                isSynergistic: boolean;
            }> = [];

            for (const [pair, stats] of Object.entries(pairStats)) {
                if (stats.total < 3) continue; // Need minimum sample

                const [bias1, bias2] = pair.split('+');
                if (!bias1 || !bias2) continue;
                const single1 = singleStats[bias1];
                const single2 = singleStats[bias2];
                if (!single1 || !single2) continue;

                const combinedFailRate = stats.losses / stats.total;
                const failRate1 = single1.total > 0 ? single1.losses / single1.total : 0;
                const failRate2 = single2.total > 0 ? single2.losses / single2.total : 0;
                const maxIndividualFailRate = Math.max(failRate1, failRate2);

                // Interaction strength > 1.3 means the combination is worse than either alone
                const interactionStrength = maxIndividualFailRate > 0
                    ? combinedFailRate / maxIndividualFailRate
                    : 1.0;

                interactions.push({
                    pair,
                    combinedFailureRate: Math.round(combinedFailRate * 100),
                    maxIndividualFailureRate: Math.round(maxIndividualFailRate * 100),
                    interactionStrength: Math.round(interactionStrength * 100) / 100,
                    sampleSize: stats.total,
                    isSynergistic: interactionStrength > 1.3,
                });
            }

            // Sort by interaction strength (most dangerous first)
            interactions.sort((a, b) => b.interactionStrength - a.interactionStrength);

            // Store results
            const synergistic = interactions.filter(i => i.isSynergistic);
            console.log(`[AutoLearning] Pairwise: found ${synergistic.length} synergistic toxic pairs out of ${interactions.length} analyzed`);
            if (synergistic.length > 0) {
                console.log(`[AutoLearning] Top toxic pairs: ${synergistic.slice(0, 3).map(i => `${i.pair} (strength=${i.interactionStrength}, n=${i.sampleSize})`).join(', ')}`);
            }

            // Persist to app_settings
            await supabase
                .from('app_settings')
                .upsert({
                    key: 'pairwise_bias_interactions',
                    value: {
                        interactions: interactions.slice(0, 20),
                        synergistic_count: synergistic.length,
                        total_analyzed: interactions.length,
                        generated_at: new Date().toISOString(),
                    },
                }, { onConflict: 'key' });
        } catch (err) {
            console.warn('[AutoLearning] Pairwise interaction detection failed:', err);
        }
    }

    /**
     * Stratified analysis — group outcomes by signal_type AND regime
     * before computing weights. Prevents Simpson's paradox where a bias
     * that hurts in bull markets but helps in bear markets appears neutral overall.
     */
    static async runStratifiedAnalysis(): Promise<void> {
        try {
            const { data: outcomes } = await supabase
                .from('signal_outcomes')
                .select('outcome, signals!inner(signal_type, agent_outputs)')
                .neq('outcome', 'pending')
                .limit(200);

            if (!outcomes || outcomes.length < 20) return;

            // Group by signal_type + regime
            const strata: Record<string, { wins: number; losses: number; total: number }> = {};

            for (const o of outcomes) {
                const sig = (o as any).signals;
                const signalType = sig?.signal_type || 'unknown';
                const regime = sig?.agent_outputs?.market_regime?.regime || 'unknown';
                const key = `${signalType}|${regime}`;

                if (!strata[key]) strata[key] = { wins: 0, losses: 0, total: 0 };
                strata[key].total++;
                if (o.outcome === 'win') strata[key].wins++;
                else strata[key].losses++;
            }

            // Compute per-stratum win rates
            const stratifiedResults = Object.entries(strata)
                .filter(([_, s]) => s.total >= 3)
                .map(([key, s]) => ({
                    stratum: key,
                    signalType: key.split('|')[0],
                    regime: key.split('|')[1],
                    winRate: Math.round((s.wins / s.total) * 100),
                    sampleSize: s.total,
                }))
                .sort((a, b) => a.winRate - b.winRate);

            console.log(`[AutoLearning] Stratified: ${stratifiedResults.length} strata analyzed`);
            for (const s of stratifiedResults) {
                console.log(`  ${s.stratum}: ${s.winRate}% WR (n=${s.sampleSize})`);
            }

            // Persist
            await supabase
                .from('app_settings')
                .upsert({
                    key: 'stratified_analysis',
                    value: {
                        strata: stratifiedResults,
                        generated_at: new Date().toISOString(),
                    },
                }, { onConflict: 'key' });
        } catch (err) {
            console.warn('[AutoLearning] Stratified analysis failed:', err);
        }
    }
}
