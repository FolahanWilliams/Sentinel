/**
 * Sentinel — Bias Cost Widget
 *
 * Dashboard widget showing: "Estimated bias cost this quarter: $X"
 * with per-bias breakdown.
 */

import { DollarSign, TrendingDown, AlertTriangle } from 'lucide-react';
import type { BiasCostSummary } from '@/services/biasCostCalculator';
import { BIAS_LABELS } from '@/utils/biasHelpers';

interface Props {
    biasCost: BiasCostSummary | null;
}

export function BiasCostWidget({ biasCost }: Props) {
    if (!biasCost || biasCost.totalBiasedSignals === 0) {
        return (
            <div className="glass-panel rounded-xl p-5 text-center text-sentinel-500 text-sm">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Need biased + unbiased outcomes to calculate bias cost impact.
            </div>
        );
    }

    const hasCostDelta = biasCost.overallCostDeltaPct > 0.5;

    return (
        <div className="glass-panel rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
                <DollarSign className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-sentinel-100">Bias Cost Impact</h3>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-sentinel-800/30 rounded-lg p-3">
                    <span className="text-[10px] text-sentinel-500 uppercase tracking-wider block">Biased Avg Return</span>
                    <span className={`text-lg font-bold font-mono ${biasCost.avgBiasedReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {biasCost.avgBiasedReturn >= 0 ? '+' : ''}{biasCost.avgBiasedReturn.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-sentinel-600 block">n={biasCost.totalBiasedSignals}</span>
                </div>
                <div className="bg-sentinel-800/30 rounded-lg p-3">
                    <span className="text-[10px] text-sentinel-500 uppercase tracking-wider block">Unbiased Avg Return</span>
                    <span className={`text-lg font-bold font-mono ${biasCost.avgUnbiasedReturn >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {biasCost.avgUnbiasedReturn >= 0 ? '+' : ''}{biasCost.avgUnbiasedReturn.toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-sentinel-600 block">n={biasCost.totalUnbiasedSignals}</span>
                </div>
            </div>

            {hasCostDelta && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 rounded-lg ring-1 ring-red-500/20 mb-4">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-300">
                        Biases cost you an estimated <span className="font-bold font-mono">{biasCost.overallCostDeltaPct.toFixed(1)}%</span> per decision
                        {biasCost.estimatedTotalCostUsd != null && (
                            <> ({' '}
                                <span className="font-bold">${Math.abs(biasCost.estimatedTotalCostUsd).toLocaleString()}</span> total
                            )</>
                        )}
                    </span>
                </div>
            )}

            {/* Per-bias breakdown */}
            {biasCost.breakdown.length > 0 && (
                <div className="space-y-1.5">
                    {biasCost.breakdown.slice(0, 5).map(b => {
                        const label = BIAS_LABELS[b.bias as keyof typeof BIAS_LABELS] || b.bias;
                        return (
                            <div key={b.bias} className="flex items-center justify-between py-1.5 px-2 text-xs">
                                <span className="text-sentinel-300">{label}</span>
                                <div className="flex items-center gap-3">
                                    <span className="font-mono text-sentinel-500">
                                        {b.biasedAvgReturn >= 0 ? '+' : ''}{b.biasedAvgReturn.toFixed(1)}%
                                    </span>
                                    {b.costDeltaPct > 0.5 && (
                                        <span className="flex items-center gap-1 text-red-400 font-mono">
                                            <TrendingDown className="w-3 h-3" />
                                            -{b.costDeltaPct.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
