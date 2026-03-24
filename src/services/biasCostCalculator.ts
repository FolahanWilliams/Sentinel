/**
 * Sentinel — Bias Cost Calculator
 *
 * Calculates the monetary and percentage impact of detected biases
 * by comparing outcomes of biased vs unbiased signals.
 */

import { supabase } from '@/config/supabase';

export interface BiasCostBreakdown {
    bias: string;
    biasedCount: number;
    unbiasedCount: number;
    biasedAvgReturn: number;
    unbiasedAvgReturn: number;
    costDeltaPct: number;
    estimatedCostUsd: number | null;
}

export interface BiasCostSummary {
    totalBiasedSignals: number;
    totalUnbiasedSignals: number;
    avgBiasedReturn: number;
    avgUnbiasedReturn: number;
    overallCostDeltaPct: number;
    estimatedTotalCostUsd: number | null;
    breakdown: BiasCostBreakdown[];
    quarterlyBiasCostAvoided: number | null;
}

export class BiasCostCalculator {

    /**
     * Calculate bias cost breakdown by comparing biased vs unbiased signal outcomes.
     */
    static async calculate(): Promise<BiasCostSummary> {
        // Fetch completed outcomes with their parent signal's bias data
        const { data: outcomes } = await supabase
            .from('signal_outcomes')
            .select('*, signals!inner(bias_type, secondary_biases, agent_outputs, monetary_value, confidence_score)')
            .neq('outcome', 'pending');

        if (!outcomes || outcomes.length === 0) {
            return {
                totalBiasedSignals: 0,
                totalUnbiasedSignals: 0,
                avgBiasedReturn: 0,
                avgUnbiasedReturn: 0,
                overallCostDeltaPct: 0,
                estimatedTotalCostUsd: null,
                breakdown: [],
                quarterlyBiasCostAvoided: null,
            };
        }

        // Categorize by bias presence
        const biasedOutcomes: Array<{ return_pct: number; bias: string; monetary_value: number | null }> = [];
        const unbiasedOutcomes: Array<{ return_pct: number }> = [];
        const biasBuckets: Record<string, { returns: number[]; monetaryValues: number[] }> = {};

        for (const o of outcomes) {
            const signal = (o as any).signals;
            const bestReturn = o.return_at_30d ?? o.return_at_10d ?? o.return_at_5d ?? o.return_at_1d ?? 0;
            const biasDetective = signal?.agent_outputs?.bias_detective;
            const hasBias = biasDetective && !biasDetective.bias_free;

            if (hasBias) {
                const biasName = signal.bias_type || biasDetective.dominant_bias || 'unknown';
                biasedOutcomes.push({ return_pct: bestReturn, bias: biasName, monetary_value: signal.monetary_value });

                if (!biasBuckets[biasName]) biasBuckets[biasName] = { returns: [], monetaryValues: [] };
                biasBuckets[biasName].returns.push(bestReturn);
                if (signal.monetary_value) biasBuckets[biasName].monetaryValues.push(signal.monetary_value);
            } else {
                unbiasedOutcomes.push({ return_pct: bestReturn });
            }
        }

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        const avgBiasedReturn = avg(biasedOutcomes.map(o => o.return_pct));
        const avgUnbiasedReturn = avg(unbiasedOutcomes.map(o => o.return_pct));
        const overallCostDeltaPct = avgUnbiasedReturn - avgBiasedReturn;

        // Per-bias breakdown
        const breakdown: BiasCostBreakdown[] = Object.entries(biasBuckets).map(([bias, data]) => {
            const biasedAvg = avg(data.returns);
            const costDelta = avgUnbiasedReturn - biasedAvg;
            const avgMonetary = data.monetaryValues.length > 0 ? avg(data.monetaryValues) : null;
            const estimatedCost = avgMonetary ? avgMonetary * (costDelta / 100) : null;

            return {
                bias,
                biasedCount: data.returns.length,
                unbiasedCount: unbiasedOutcomes.length,
                biasedAvgReturn: biasedAvg,
                unbiasedAvgReturn: avgUnbiasedReturn,
                costDeltaPct: costDelta,
                estimatedCostUsd: estimatedCost,
            };
        }).sort((a, b) => b.costDeltaPct - a.costDeltaPct);

        // Estimated total cost
        const totalMonetary = biasedOutcomes
            .filter(o => o.monetary_value != null)
            .reduce((sum, o) => sum + (o.monetary_value! * (overallCostDeltaPct / 100)), 0);

        return {
            totalBiasedSignals: biasedOutcomes.length,
            totalUnbiasedSignals: unbiasedOutcomes.length,
            avgBiasedReturn,
            avgUnbiasedReturn,
            overallCostDeltaPct,
            estimatedTotalCostUsd: totalMonetary || null,
            breakdown,
            quarterlyBiasCostAvoided: null, // Will be populated as nudges improve outcomes
        };
    }
}
