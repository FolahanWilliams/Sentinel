/**
 * Sentinel — Bias Genome Benchmark
 *
 * Shows per-bias rates and returns compared to overall benchmark.
 * "Your anchoring rate: 34%. Avg return when present: -2.1%"
 */

import { useState, useEffect } from 'react';
import { BiasGenomeService, type BiasGenomeResult } from '@/services/biasGenomeService';
import { BIAS_LABELS } from '@/utils/biasHelpers';
import { TrendingDown, TrendingUp, Minus, Dna } from 'lucide-react';

export function BiasGenomeBenchmark() {
    const [genome, setGenome] = useState<BiasGenomeResult | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        BiasGenomeService.buildGenome()
            .then(setGenome)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="glass-panel rounded-xl p-5 animate-pulse">
                <div className="h-4 w-32 bg-sentinel-800 rounded mb-4" />
                <div className="space-y-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-8 bg-sentinel-800 rounded" />)}
                </div>
            </div>
        );
    }

    if (!genome || genome.benchmarks.length === 0) {
        return (
            <div className="glass-panel rounded-xl p-5 text-center text-sentinel-500 text-sm">
                <Dna className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Need more signal data to build your Bias Genome profile.
            </div>
        );
    }

    return (
        <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
                <Dna className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold text-sentinel-100">Bias Genome</h3>
                <span className="text-[10px] text-sentinel-500 ml-auto">
                    {genome.totalSignals} signals · {genome.totalWithOutcomes} with outcomes
                </span>
            </div>

            <div className="space-y-2">
                {genome.benchmarks.map(b => {
                    const label = BIAS_LABELS[b.bias as keyof typeof BIAS_LABELS] || b.bias;
                    const ImpactIcon = b.impact === 'negative' ? TrendingDown : b.impact === 'positive' ? TrendingUp : Minus;
                    const impactColor = b.impact === 'negative' ? 'text-red-400' : b.impact === 'positive' ? 'text-emerald-400' : 'text-sentinel-500';

                    return (
                        <div key={b.bias} className="flex items-center gap-3 py-2 px-3 bg-sentinel-800/30 rounded-lg">
                            <div className="flex-1 min-w-0">
                                <span className="text-xs font-medium text-sentinel-200">{label}</span>
                                <div className="flex items-center gap-3 mt-0.5">
                                    <span className="text-[10px] text-sentinel-500">
                                        Rate: <span className="text-sentinel-300 font-mono">{b.userRate.toFixed(0)}%</span>
                                    </span>
                                    <span className="text-[10px] text-sentinel-500">
                                        Avg return: <span className={`font-mono ${b.userAvgReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {b.userAvgReturn >= 0 ? '+' : ''}{b.userAvgReturn.toFixed(1)}%
                                        </span>
                                    </span>
                                    <span className="text-[10px] text-sentinel-600">
                                        n={b.userCount}
                                    </span>
                                </div>
                            </div>
                            <ImpactIcon className={`w-4 h-4 ${impactColor} flex-shrink-0`} />
                        </div>
                    );
                })}
            </div>

            {genome.dominantBias && (
                <p className="text-[10px] text-sentinel-500 mt-3 pt-3 border-t border-sentinel-800/50">
                    Dominant bias: <span className="text-sentinel-300">{BIAS_LABELS[genome.dominantBias as keyof typeof BIAS_LABELS] || genome.dominantBias}</span>
                    {genome.worseningBiases.length > 0 && (
                        <> · Costing you most: <span className="text-red-400">{genome.worseningBiases.map(b => BIAS_LABELS[b as keyof typeof BIAS_LABELS] || b).join(', ')}</span></>
                    )}
                </p>
            )}
        </div>
    );
}
