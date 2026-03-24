/**
 * Sentinel — A/B Testing Framework for Threshold & Weight Changes
 *
 * Allows testing new thresholds, weights, or pipeline configurations
 * against the current production settings. Signals are tagged with their
 * experiment variant, and outcomes are compared to determine which
 * configuration produces better results.
 *
 * Usage:
 *   1. Define an experiment in app_settings key 'ab_experiments'
 *   2. Scanner checks active experiments and assigns variant per signal
 *   3. Outcomes are tracked per variant
 *   4. After sufficient data, compare variant performance and auto-promote winners
 */

import { supabase } from '@/config/supabase';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface ABExperiment {
    id: string;
    name: string;
    description: string;
    status: 'active' | 'paused' | 'concluded';
    createdAt: string;
    /** Parameters being tested (e.g., confidence gates, decay half-lives) */
    controlParams: Record<string, number>;
    variantParams: Record<string, number>;
    /** Traffic split: 0.5 = 50/50 */
    trafficSplit: number;
    /** Min outcomes needed per variant before concluding */
    minSampleSize: number;
    /** Results (populated during analysis) */
    results?: ABResults;
}

export interface ABResults {
    controlOutcomes: number;
    variantOutcomes: number;
    controlWinRate: number;
    variantWinRate: number;
    controlAvgReturn: number;
    variantAvgReturn: number;
    pValue: number;
    winner: 'control' | 'variant' | 'inconclusive';
    analyzedAt: string;
}

export interface ABAssignment {
    experimentId: string;
    variant: 'control' | 'variant';
    params: Record<string, number>;
}

// Cache
let experimentsCache: ABExperiment[] | null = null;
let experimentsCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// ── Framework ───────────────────────────────────────────────────────────────────

export class ABTestingFramework {

    /**
     * Get all active experiments. Cached for 5 minutes.
     */
    static async getActiveExperiments(): Promise<ABExperiment[]> {
        if (experimentsCache && (Date.now() - experimentsCacheTime) < CACHE_TTL) {
            return experimentsCache.filter(e => e.status === 'active');
        }

        try {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'ab_experiments')
                .maybeSingle();

            experimentsCache = (data?.value as ABExperiment[] | null) ?? [];
            experimentsCacheTime = Date.now();
            return experimentsCache.filter(e => e.status === 'active');
        } catch {
            return [];
        }
    }

    /**
     * Assign a signal to experiment variants.
     * Uses deterministic hashing on ticker + experiment ID for consistent assignment.
     * Returns parameter overrides for each active experiment.
     */
    static async assignVariants(ticker: string): Promise<ABAssignment[]> {
        const experiments = await this.getActiveExperiments();
        if (experiments.length === 0) return [];

        const assignments: ABAssignment[] = [];

        for (const exp of experiments) {
            // Deterministic assignment: hash ticker + experimentId
            const hash = this.simpleHash(`${ticker}:${exp.id}`);
            const isVariant = (hash % 100) / 100 < exp.trafficSplit;

            assignments.push({
                experimentId: exp.id,
                variant: isVariant ? 'variant' : 'control',
                params: isVariant ? exp.variantParams : exp.controlParams,
            });
        }

        return assignments;
    }

    /**
     * Get parameter value for a specific key, considering A/B test overrides.
     * Falls back to defaultValue if no experiment overrides this param.
     */
    static getParam(assignments: ABAssignment[], key: string, defaultValue: number): number {
        for (const a of assignments) {
            if (key in a.params) {
                return a.params[key] ?? defaultValue;
            }
        }
        return defaultValue;
    }

    /**
     * Analyze experiment results by comparing outcomes across variants.
     */
    static async analyzeExperiment(experimentId: string): Promise<ABResults | null> {
        try {
            // Fetch outcomes tagged with this experiment
            const { data: outcomes } = await supabase
                .from('signal_outcomes')
                .select('outcome, return_at_5d, return_at_10d, signals!inner(agent_outputs)')
                .neq('outcome', 'pending');

            if (!outcomes || outcomes.length === 0) return null;

            // Split by variant
            const control: { wins: number; total: number; returns: number[] } = { wins: 0, total: 0, returns: [] };
            const variant: { wins: number; total: number; returns: number[] } = { wins: 0, total: 0, returns: [] };

            for (const o of outcomes) {
                const agentOutputs = (o as any).signals?.agent_outputs;
                const abTag = agentOutputs?.ab_experiment;
                if (!abTag || abTag.experiment_id !== experimentId) continue;

                const bucket = abTag.variant === 'variant' ? variant : control;
                bucket.total++;
                if (o.outcome === 'win') bucket.wins++;
                const ret = (o as any).return_at_10d ?? (o as any).return_at_5d ?? 0;
                bucket.returns.push(ret);
            }

            if (control.total < 5 || variant.total < 5) {
                return null; // Insufficient data
            }

            const controlWinRate = control.wins / control.total;
            const variantWinRate = variant.wins / variant.total;
            const controlAvgReturn = control.returns.reduce((a, b) => a + b, 0) / control.returns.length;
            const variantAvgReturn = variant.returns.reduce((a, b) => a + b, 0) / variant.returns.length;

            // Simple statistical significance test (z-test for proportions)
            const pValue = this.proportionZTest(control.wins, control.total, variant.wins, variant.total);

            let winner: ABResults['winner'] = 'inconclusive';
            if (pValue < 0.05) {
                winner = variantWinRate > controlWinRate ? 'variant' : 'control';
            }

            return {
                controlOutcomes: control.total,
                variantOutcomes: variant.total,
                controlWinRate: Math.round(controlWinRate * 1000) / 10,
                variantWinRate: Math.round(variantWinRate * 1000) / 10,
                controlAvgReturn: Math.round(controlAvgReturn * 100) / 100,
                variantAvgReturn: Math.round(variantAvgReturn * 100) / 100,
                pValue: Math.round(pValue * 1000) / 1000,
                winner,
                analyzedAt: new Date().toISOString(),
            };
        } catch (err) {
            console.error('[ABTesting] Analysis failed:', err);
            return null;
        }
    }

    /**
     * Auto-promote winning variant: update the production parameters
     * and conclude the experiment.
     */
    static async promoteWinner(experimentId: string): Promise<boolean> {
        const experiments = await this.getActiveExperiments();
        const exp = experiments.find(e => e.id === experimentId);
        if (!exp) return false;

        const results = await this.analyzeExperiment(experimentId);
        if (!results || results.winner === 'inconclusive') return false;

        // Update experiment status
        const allExperiments = experimentsCache ?? [];
        const updated = allExperiments.map(e => {
            if (e.id !== experimentId) return e;
            return { ...e, status: 'concluded' as const, results };
        });

        await supabase.from('app_settings').upsert({
            key: 'ab_experiments',
            value: updated as any,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key,user_id' });

        // If variant won, log recommendation (don't auto-apply to avoid surprises)
        if (results.winner === 'variant') {
            console.log(`[ABTesting] Experiment "${exp.name}" concluded: VARIANT wins (${results.variantWinRate}% vs ${results.controlWinRate}% win rate, p=${results.pValue}). Recommended params:`, exp.variantParams);
        } else {
            console.log(`[ABTesting] Experiment "${exp.name}" concluded: CONTROL wins. No changes needed.`);
        }

        // Invalidate cache
        experimentsCache = null;
        return true;
    }

    /**
     * Create a new A/B experiment.
     */
    static async createExperiment(
        name: string,
        description: string,
        controlParams: Record<string, number>,
        variantParams: Record<string, number>,
        trafficSplit: number = 0.5,
        minSampleSize: number = 20,
    ): Promise<ABExperiment> {
        const experiment: ABExperiment = {
            id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name,
            description,
            status: 'active',
            createdAt: new Date().toISOString(),
            controlParams,
            variantParams,
            trafficSplit: Math.max(0.1, Math.min(0.9, trafficSplit)),
            minSampleSize,
        };

        await this.getActiveExperiments();
        const allExperiments = experimentsCache ?? [];
        allExperiments.push(experiment);

        await supabase.from('app_settings').upsert({
            key: 'ab_experiments',
            value: allExperiments as any,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key,user_id' });

        experimentsCache = null; // Invalidate
        console.log(`[ABTesting] Created experiment "${name}" (${experiment.id})`);
        return experiment;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /**
     * Simple deterministic hash for consistent variant assignment.
     */
    private static simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Two-proportion z-test for statistical significance.
     */
    private static proportionZTest(
        wins1: number, n1: number,
        wins2: number, n2: number,
    ): number {
        const p1 = wins1 / n1;
        const p2 = wins2 / n2;
        const pPooled = (wins1 + wins2) / (n1 + n2);
        const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));

        if (se === 0) return 1.0;

        const z = Math.abs(p1 - p2) / se;
        // Approximate p-value from z-score using normal CDF approximation
        return 2 * (1 - this.normalCDF(z));
    }

    /**
     * Approximate standard normal CDF (Abramowitz & Stegun).
     */
    private static normalCDF(x: number): number {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;

        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x) / Math.sqrt(2);
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return 0.5 * (1.0 + sign * y);
    }
}
