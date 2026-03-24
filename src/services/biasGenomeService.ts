/**
 * Sentinel — Bias Genome Service
 *
 * Aggregates bias detection + outcome data to produce industry-level
 * benchmarks: "Your anchoring rate: 34%. Benchmark avg: 22%."
 */

import { supabase } from '@/config/supabase';

export interface BiasGenomeBenchmark {
    bias: string;
    userRate: number;          // % of user's signals affected by this bias
    userAvgReturn: number;     // avg return when this bias present
    benchmarkRate: number;     // overall rate across all signals
    benchmarkAvgReturn: number;
    userCount: number;
    totalCount: number;
    impact: 'positive' | 'negative' | 'neutral';
}

export interface BiasGenomeResult {
    benchmarks: BiasGenomeBenchmark[];
    totalSignals: number;
    totalWithOutcomes: number;
    dominantBias: string | null;
    improvingBiases: string[];
    worseningBiases: string[];
}

export class BiasGenomeService {

    /**
     * Build bias genome benchmarks from all signal + outcome data.
     */
    static async buildGenome(): Promise<BiasGenomeResult> {
        const { data: signals } = await supabase
            .from('signals')
            .select('id, bias_type, secondary_biases, agent_outputs, signal_type');

        const { data: outcomes } = await supabase
            .from('signal_outcomes')
            .select('signal_id, outcome, return_at_30d, return_at_10d, return_at_5d, return_at_1d')
            .neq('outcome', 'pending');

        if (!signals) {
            return { benchmarks: [], totalSignals: 0, totalWithOutcomes: 0, dominantBias: null, improvingBiases: [], worseningBiases: [] };
        }

        // Map outcomes by signal_id for fast lookup
        const outcomeMap = new Map<string, { outcome: string; bestReturn: number }>();
        for (const o of outcomes || []) {
            const bestReturn = o.return_at_30d ?? o.return_at_10d ?? o.return_at_5d ?? o.return_at_1d ?? 0;
            outcomeMap.set(o.signal_id, { outcome: o.outcome, bestReturn });
        }

        // Count bias occurrences and returns
        const biasBuckets: Record<string, { count: number; returns: number[]; withOutcome: number }> = {};
        let totalSignals = signals.length;

        const addBias = (bias: string, signalId: string) => {
            if (!biasBuckets[bias]) biasBuckets[bias] = { count: 0, returns: [], withOutcome: 0 };
            biasBuckets[bias].count++;
            const o = outcomeMap.get(signalId);
            if (o) {
                biasBuckets[bias].returns.push(o.bestReturn);
                biasBuckets[bias].withOutcome++;
            }
        };

        for (const s of signals) {
            if (s.bias_type) addBias(s.bias_type, s.id);
            if (s.secondary_biases?.length) {
                for (const b of s.secondary_biases) addBias(b, s.id);
            }
            // Also check bias detective findings
            const findings = (s.agent_outputs as any)?.bias_detective?.findings;
            if (Array.isArray(findings)) {
                for (const f of findings) {
                    if (f.bias_name && f.bias_name !== s.bias_type) {
                        addBias(f.bias_name, s.id);
                    }
                }
            }
        }

        // Overall benchmark
        const allReturns = Array.from(outcomeMap.values()).map(o => o.bestReturn);
        const benchmarkAvgReturn = allReturns.length > 0 ? allReturns.reduce((a, b) => a + b, 0) / allReturns.length : 0;

        const benchmarks: BiasGenomeBenchmark[] = Object.entries(biasBuckets)
            .filter(([_, data]) => data.count >= 2) // Need minimum sample
            .map(([bias, data]) => {
                const userRate = totalSignals > 0 ? (data.count / totalSignals) * 100 : 0;
                const benchmarkRate = userRate; // In single-user mode, benchmark = user rate
                const userAvgReturn = data.returns.length > 0 ? data.returns.reduce((a, b) => a + b, 0) / data.returns.length : 0;

                return {
                    bias,
                    userRate,
                    userAvgReturn,
                    benchmarkRate,
                    benchmarkAvgReturn,
                    userCount: data.count,
                    totalCount: totalSignals,
                    impact: userAvgReturn > benchmarkAvgReturn ? 'positive' as const
                        : userAvgReturn < benchmarkAvgReturn - 1 ? 'negative' as const
                        : 'neutral' as const,
                };
            })
            .sort((a, b) => a.userAvgReturn - b.userAvgReturn);

        // Find dominant bias
        const dominantEntry = Object.entries(biasBuckets).sort((a, b) => b[1].count - a[1].count)[0];

        return {
            benchmarks,
            totalSignals,
            totalWithOutcomes: outcomeMap.size,
            dominantBias: dominantEntry?.[0] ?? null,
            improvingBiases: benchmarks.filter(b => b.impact === 'positive').map(b => b.bias),
            worseningBiases: benchmarks.filter(b => b.impact === 'negative').map(b => b.bias),
        };
    }
}
