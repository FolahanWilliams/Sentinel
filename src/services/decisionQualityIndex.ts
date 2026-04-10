/**
 * Sentinel — Decision Quality Index (DQI) Calculator
 *
 * Composite 0-100 score aggregating all quality signals from the pipeline
 * into a single metric. Inspired by Decision Intel's DQI framework.
 *
 * Key for the ROI showcase — track DQI vs outcomes to prove the
 * Decision Intel engine works under real trading conditions.
 *
 * Component weights:
 *   Bias audit       20%    Noise convergence  15%
 *   Pre-mortem       15%    Twin consensus     15%
 *   Self-critique    10%    Cross-source       10%
 *   RPD pattern      10%    Toxic combination   5%
 */

import {
    DQI_ELITE_THRESHOLD,
    DQI_HIGH_THRESHOLD,
    DQI_MODERATE_THRESHOLD,
    DQI_MINIMUM_THRESHOLD,
} from '@/config/constants';
import type { DQIComponents, DQIResult, DQITier } from '@/types/agents';

// ── Input structure (all optional — graceful degradation) ───────────────────

export interface DQIInputs {
    // Bias Detective
    biasFree?: boolean;
    biasTotalPenalty?: number;
    // Noise Panel
    noiseStdDev?: number | null;
    // Pre-Mortem
    preMortemAvgProbability?: number | null;
    // Decision Twin
    twinTakeCount?: number;        // 0-3: how many personas voted TAKE
    // Self-Critique
    criticalFlawCount?: number;
    minorFlawCount?: number;
    // Cross-Source Validator
    crossSourceQualityScore?: number | null;
    // RPD Pattern Matcher
    rpdHistoricalWinRate?: number | null;
    rpdSufficientData?: boolean;
    // Toxic Combination
    toxicCompoundRiskScore?: number;
}

// ── Weights ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
    bias_audit: 0.20,
    noise_convergence: 0.15,
    pre_mortem_resilience: 0.15,
    twin_consensus: 0.15,
    self_critique_quality: 0.10,
    cross_source_quality: 0.10,
    rpd_pattern_match: 0.10,
    toxic_combination: 0.05,
} as const;

// ── Public API ──────────────────────────────────────────────────────────────

export class DecisionQualityIndex {

    /**
     * Compute the DQI score from all pipeline outputs.
     */
    static compute(inputs: DQIInputs): DQIResult {
        const components = this.computeComponents(inputs);

        // Weighted sum
        const score = Math.round(
            components.bias_audit * WEIGHTS.bias_audit +
            components.noise_convergence * WEIGHTS.noise_convergence +
            components.pre_mortem_resilience * WEIGHTS.pre_mortem_resilience +
            components.twin_consensus * WEIGHTS.twin_consensus +
            components.self_critique_quality * WEIGHTS.self_critique_quality +
            components.cross_source_quality * WEIGHTS.cross_source_quality +
            components.rpd_pattern_match * WEIGHTS.rpd_pattern_match +
            components.toxic_combination * WEIGHTS.toxic_combination
        );

        const clampedScore = Math.max(0, Math.min(100, score));
        const tier = this.getTier(clampedScore);

        return {
            score: clampedScore,
            components,
            quality_tier: tier,
        };
    }

    /**
     * Check if a DQI score passes the minimum threshold.
     */
    static passesGate(dqi: DQIResult): boolean {
        return dqi.score >= DQI_MINIMUM_THRESHOLD;
    }

    // ── Component Scoring ───────────────────────────────────────────────────

    private static computeComponents(inputs: DQIInputs): DQIComponents {
        return {
            bias_audit: this.scoreBiasAudit(inputs),
            noise_convergence: this.scoreNoise(inputs),
            pre_mortem_resilience: this.scorePreMortem(inputs),
            twin_consensus: this.scoreTwinConsensus(inputs),
            self_critique_quality: this.scoreSelfCritique(inputs),
            cross_source_quality: this.scoreCrossSource(inputs),
            rpd_pattern_match: this.scoreRPD(inputs),
            toxic_combination: this.scoreToxicCombo(inputs),
        };
    }

    /** 100 if bias-free, else 100 - (total_penalty * 5), floor 0 */
    private static scoreBiasAudit(inputs: DQIInputs): number {
        if (inputs.biasFree) return 100;
        const penalty = inputs.biasTotalPenalty ?? 0;
        return Math.max(0, 100 - penalty * 5);
    }

    /** 100 - (std_dev * 10), floor 0. Null = 50 (neutral) */
    private static scoreNoise(inputs: DQIInputs): number {
        if (inputs.noiseStdDev === null || inputs.noiseStdDev === undefined) return 50;
        return Math.max(0, Math.round(100 - inputs.noiseStdDev * 10));
    }

    /** 100 - avg_failure_probability. Null = 50 (neutral) */
    private static scorePreMortem(inputs: DQIInputs): number {
        if (inputs.preMortemAvgProbability === null || inputs.preMortemAvgProbability === undefined) return 50;
        return Math.max(0, 100 - inputs.preMortemAvgProbability);
    }

    /** 100 if unanimous TAKE, 70 if 2 TAKE, 40 if 1 TAKE, 10 if 0 TAKE */
    private static scoreTwinConsensus(inputs: DQIInputs): number {
        const takes = inputs.twinTakeCount ?? 1; // default = 1 TAKE (neutral)
        if (takes >= 3) return 100;
        if (takes === 2) return 70;
        if (takes === 1) return 40;
        return 10;
    }

    /** 100 if no flaws, 70 if minor only, 40 if 1 critical, 10 if 2+ critical */
    private static scoreSelfCritique(inputs: DQIInputs): number {
        const critical = inputs.criticalFlawCount ?? 0;
        const minor = inputs.minorFlawCount ?? 0;
        if (critical === 0 && minor === 0) return 100;
        if (critical === 0) return 70;
        if (critical === 1) return 40;
        return 10;
    }

    /** Direct pass-through of cross-source quality score (already 0-100). Null = 50 */
    private static scoreCrossSource(inputs: DQIInputs): number {
        return inputs.crossSourceQualityScore ?? 50;
    }

    /** historical_win_rate if sufficient data, else 50 (neutral) */
    private static scoreRPD(inputs: DQIInputs): number {
        if (!inputs.rpdSufficientData || inputs.rpdHistoricalWinRate === null || inputs.rpdHistoricalWinRate === undefined) return 50;
        return Math.max(0, Math.min(100, inputs.rpdHistoricalWinRate));
    }

    /** 100 - compound_risk_score, floor 0 */
    private static scoreToxicCombo(inputs: DQIInputs): number {
        return Math.max(0, 100 - (inputs.toxicCompoundRiskScore ?? 0));
    }

    // ── Tier Classification ─────────────────────────────────────────────────

    private static getTier(score: number): DQITier {
        if (score >= DQI_ELITE_THRESHOLD) return 'elite';
        if (score >= DQI_HIGH_THRESHOLD) return 'high';
        if (score >= DQI_MODERATE_THRESHOLD) return 'moderate';
        if (score >= DQI_MINIMUM_THRESHOLD) return 'low';
        return 'rejected';
    }

    /**
     * Get adaptive weights based on historical performance.
     *
     * When RPD shows high historical win rate, boost RPD weight
     * since we've proven this signal type works historically.
     * When bias audit is clean, boost its weight.
     */
    static getAdaptiveWeights(
        rpdWinRate: number | null,
        rpdSufficientData: boolean,
        biasIsClean: boolean,
    ): Record<string, number> {
        const hasRpdData = rpdSufficientData && rpdWinRate !== null;
        const rpdBoost = hasRpdData ? (rpdWinRate! - 50) / 100 : 0; // -0.5 to +0.5

        const rpdWeight = Math.max(0.05, Math.min(0.25, WEIGHTS.rpd_pattern_match + rpdBoost));
        const biasWeight = biasIsClean ? Math.min(0.30, WEIGHTS.bias_audit + 0.10) : WEIGHTS.bias_audit;

        // Re-distribute remaining weight proportionally
        const remaining = 1 - rpdWeight - biasWeight;
        const baseRemainder = 1 - WEIGHTS.bias_audit - WEIGHTS.rpd_pattern_match;

        return {
            bias_audit: biasWeight,
            noise_convergence: (WEIGHTS.noise_convergence / baseRemainder) * remaining,
            pre_mortem_resilience: (WEIGHTS.pre_mortem_resilience / baseRemainder) * remaining,
            twin_consensus: (WEIGHTS.twin_consensus / baseRemainder) * remaining,
            self_critique_quality: (WEIGHTS.self_critique_quality / baseRemainder) * remaining,
            cross_source_quality: (WEIGHTS.cross_source_quality / baseRemainder) * remaining,
            rpd_pattern_match: rpdWeight,
            toxic_combination: (WEIGHTS.toxic_combination / baseRemainder) * remaining,
        };
    }
}
