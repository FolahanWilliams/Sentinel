/**
 * Sentinel — Decision Accuracy Dashboard
 *
 * Full-page view combining accuracy over time, calibration curve,
 * bias cost analysis, and bias genome benchmarks.
 */

import { useDecisionAccuracy } from '@/hooks/useDecisionAccuracy';
import { AccuracyTimeSeries } from '@/components/visualizations/AccuracyTimeSeries';
import { CalibrationCurve } from '@/components/visualizations/CalibrationCurve';
import { BiasCostWidget } from '@/components/visualizations/BiasCostWidget';
import { BiasGenomeBenchmark } from '@/components/visualizations/BiasGenomeBenchmark';
import { Target, TrendingUp, TrendingDown, Minus, BarChart3 } from 'lucide-react';

export function DecisionAccuracy() {
    const {
        accuracyOverTime,
        calibrationData,
        biasCost,
        overallAccuracy,
        totalOutcomes,
        totalSignals,
        recentTrend,
        loading,
    } = useDecisionAccuracy();

    if (loading) {
        return (
            <div className="space-y-6 animate-pulse">
                <div className="h-8 w-64 bg-sentinel-800 rounded" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[1, 2, 3, 4].map(i => <div key={i} className="h-72 bg-sentinel-800/30 rounded-xl" />)}
                </div>
            </div>
        );
    }

    const TrendIcon = recentTrend === 'improving' ? TrendingUp : recentTrend === 'declining' ? TrendingDown : Minus;
    const trendColor = recentTrend === 'improving' ? 'text-emerald-400' : recentTrend === 'declining' ? 'text-red-400' : 'text-sentinel-400';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Target className="w-6 h-6 text-purple-400" />
                    <div>
                        <h1 className="text-xl font-bold text-sentinel-100">Decision Accuracy</h1>
                        <p className="text-xs text-sentinel-500">
                            Track, score, and improve your decision performance over time
                        </p>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="glass-panel rounded-xl p-4">
                    <span className="text-[10px] text-sentinel-500 uppercase tracking-wider block">Overall Accuracy</span>
                    <span className={`text-2xl font-bold font-mono ${overallAccuracy >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {overallAccuracy.toFixed(1)}%
                    </span>
                </div>
                <div className="glass-panel rounded-xl p-4">
                    <span className="text-[10px] text-sentinel-500 uppercase tracking-wider block">Outcomes Logged</span>
                    <span className="text-2xl font-bold font-mono text-sentinel-100">{totalOutcomes}</span>
                    <span className="text-[10px] text-sentinel-600 block">of {totalSignals} signals</span>
                </div>
                <div className="glass-panel rounded-xl p-4">
                    <span className="text-[10px] text-sentinel-500 uppercase tracking-wider block">Recent Trend</span>
                    <div className="flex items-center gap-1.5 mt-1">
                        <TrendIcon className={`w-5 h-5 ${trendColor}`} />
                        <span className={`text-sm font-medium capitalize ${trendColor}`}>{recentTrend}</span>
                    </div>
                </div>
                <div className="glass-panel rounded-xl p-4">
                    <span className="text-[10px] text-sentinel-500 uppercase tracking-wider block">Bias Cost Delta</span>
                    <span className={`text-2xl font-bold font-mono ${
                        (biasCost?.overallCostDeltaPct ?? 0) > 0.5 ? 'text-red-400' : 'text-sentinel-100'
                    }`}>
                        {biasCost ? `${biasCost.overallCostDeltaPct.toFixed(1)}%` : '—'}
                    </span>
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Accuracy Over Time */}
                <div className="glass-panel rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <BarChart3 className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-bold text-sentinel-100">Win Rate Over Time</h3>
                        <span className="text-[10px] text-sentinel-500 ml-auto">Rolling 30-outcome window</span>
                    </div>
                    <AccuracyTimeSeries data={accuracyOverTime} />
                </div>

                {/* Calibration Curve */}
                <div className="glass-panel rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-purple-400" />
                        <h3 className="text-sm font-bold text-sentinel-100">Confidence Calibration</h3>
                        <span className="text-[10px] text-sentinel-500 ml-auto">Confidence vs reality</span>
                    </div>
                    <CalibrationCurve data={calibrationData} />
                </div>

                {/* Bias Cost */}
                <BiasCostWidget biasCost={biasCost} />

                {/* Bias Genome */}
                <BiasGenomeBenchmark />
            </div>
        </div>
    );
}
