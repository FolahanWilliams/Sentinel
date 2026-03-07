/**
 * Performance — Signal Performance Dashboard
 *
 * Visual backtest view showing "how Sentinel's signals performed"
 * over 30/60/90 days with equity curves, win rates by signal type,
 * calibration charts, and streak analysis.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { DEFAULT_STARTING_CAPITAL } from '@/config/constants';
import {
    BarChart3, TrendingUp, Target, Shield,
    Activity, Loader2, Zap, Award, Flame,
    ArrowUpRight, ArrowDownRight, Clock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/EmptyState';
import { CorrelationDashboard } from '@/components/dashboard/CorrelationDashboard';
import { TradeReplay } from '@/components/dashboard/TradeReplay';
import { exportSignalsToCSV, downloadCSV } from '@/utils/exportData';

const fadeUp = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
};

const TIME_RANGES = [
    { label: '30 Days', days: 30 },
    { label: '60 Days', days: 60 },
    { label: '90 Days', days: 90 },
    { label: 'All Time', days: 9999 },
] as const;

interface OutcomeWithSignal {
    signal_id: string;
    ticker: string;
    entry_price: number;
    return_at_1d: number | null;
    return_at_5d: number | null;
    return_at_10d: number | null;
    return_at_30d: number | null;
    outcome: string;
    hit_target: boolean;
    hit_stop_loss: boolean;
    max_drawdown: number | null;
    max_gain: number | null;
    tracked_at: string;
    completed_at: string | null;
    signal_type: string;
    confidence_score: number;
    bias_type: string;
}

function StatCard({ label, value, sub, icon: Icon, color }: {
    label: string; value: string; sub: string;
    icon: React.ComponentType<{ className?: string }>; color: string;
}) {
    return (
        <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 text-sentinel-400 text-xs uppercase tracking-wider mb-2">
                <Icon className="w-3.5 h-3.5" /> {label}
            </div>
            <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
            <p className="text-xs text-sentinel-500 mt-1">{sub}</p>
        </motion.div>
    );
}

export function Performance() {
    const [loading, setLoading] = useState(true);
    const [outcomes, setOutcomes] = useState<OutcomeWithSignal[]>([]);
    const [selectedRange, setSelectedRange] = useState(90);

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            const { data, error } = await supabase
                .from('signal_outcomes')
                .select('*, signals!inner(signal_type, confidence_score, bias_type)')
                .order('tracked_at', { ascending: true });

            if (!error && data) {
                setOutcomes(data.map((o: any) => ({
                    ...o,
                    signal_type: o.signals?.signal_type || 'unknown',
                    confidence_score: o.signals?.confidence_score || 0,
                    bias_type: o.signals?.bias_type || 'unknown',
                })));
            }
            setLoading(false);
        }
        fetchData();
    }, []);

    // Filter by time range
    const filteredOutcomes = useMemo(() => {
        if (selectedRange >= 9999) return outcomes;
        const cutoff = new Date(Date.now() - selectedRange * 24 * 60 * 60 * 1000).toISOString();
        return outcomes.filter(o => o.tracked_at >= cutoff);
    }, [outcomes, selectedRange]);

    // Compute stats
    const stats = useMemo(() => {
        const completed = filteredOutcomes.filter(o => o.outcome !== 'pending');
        const wins = completed.filter(o => o.outcome === 'win');
        const losses = completed.filter(o => o.outcome === 'loss');
        const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : 0;

        // Returns by window
        const avgReturn5d = completed.reduce((acc, o) => acc + (o.return_at_5d || 0), 0) / (completed.length || 1);
        const avgReturn30d = completed.reduce((acc, o) => acc + (o.return_at_30d || o.return_at_10d || o.return_at_5d || 0), 0) / (completed.length || 1);

        // Targets/Stops
        const targetHits = completed.filter(o => o.hit_target).length;
        const stopHits = completed.filter(o => o.hit_stop_loss).length;

        // Max drawdown / gain across all
        const maxDrawdown = Math.min(...completed.map(o => o.max_drawdown ?? 0), 0);
        const maxGain = Math.max(...completed.map(o => o.max_gain ?? 0), 0);

        // Win rate by signal type
        const byType: Record<string, { wins: number; losses: number }> = {};
        completed.forEach(o => {
            const type = o.signal_type || 'unknown';
            if (!byType[type]) byType[type] = { wins: 0, losses: 0 };
            if (o.outcome === 'win') byType[type].wins++;
            else byType[type].losses++;
        });

        // Win rate by bias type
        const byBias: Record<string, { wins: number; losses: number }> = {};
        completed.forEach(o => {
            const bias = o.bias_type || 'unknown';
            if (!byBias[bias]) byBias[bias] = { wins: 0, losses: 0 };
            if (o.outcome === 'win') byBias[bias].wins++;
            else byBias[bias].losses++;
        });

        // Confidence calibration buckets
        const calibrationBuckets: Record<string, { predicted: number; actual: number; count: number }> = {};
        completed.forEach(o => {
            const bucket = `${Math.floor(o.confidence_score / 10) * 10}-${Math.floor(o.confidence_score / 10) * 10 + 10}%`;
            if (!calibrationBuckets[bucket]) calibrationBuckets[bucket] = { predicted: Math.floor(o.confidence_score / 10) * 10 + 5, actual: 0, count: 0 };
            calibrationBuckets[bucket].count++;
            if (o.outcome === 'win') calibrationBuckets[bucket].actual++;
        });
        Object.values(calibrationBuckets).forEach(b => {
            b.actual = b.count > 0 ? (b.actual / b.count) * 100 : 0;
        });

        // Streaks
        let currentStreak = 0;
        let currentStreakType: 'win' | 'loss' = 'win';
        let maxWinStreak = 0;
        let maxLossStreak = 0;
        let tmpStreak = 0;
        let tmpType: 'win' | 'loss' | null = null;
        completed.forEach(o => {
            const isWin = o.outcome === 'win';
            if (tmpType === null || (isWin && tmpType === 'win') || (!isWin && tmpType === 'loss')) {
                tmpStreak++;
                tmpType = isWin ? 'win' : 'loss';
            } else {
                if (tmpType === 'win') maxWinStreak = Math.max(maxWinStreak, tmpStreak);
                else maxLossStreak = Math.max(maxLossStreak, tmpStreak);
                tmpStreak = 1;
                tmpType = isWin ? 'win' : 'loss';
            }
            currentStreak = tmpStreak;
            currentStreakType = tmpType!;
        });
        if (tmpType === 'win') maxWinStreak = Math.max(maxWinStreak, tmpStreak);
        else if (tmpType === 'loss') maxLossStreak = Math.max(maxLossStreak, tmpStreak);

        return {
            total: completed.length,
            pending: filteredOutcomes.length - completed.length,
            wins: wins.length,
            losses: losses.length,
            winRate,
            avgReturn5d,
            avgReturn30d,
            targetHits,
            stopHits,
            maxDrawdown,
            maxGain,
            byType,
            byBias,
            calibrationBuckets,
            maxWinStreak,
            maxLossStreak,
            currentStreak,
            currentStreakType,
        };
    }, [filteredOutcomes]);

    // Equity curve (cumulative returns)
    const equityPath = useMemo(() => {
        const completed = filteredOutcomes.filter(o => o.outcome !== 'pending');
        if (completed.length < 2) return '';
        let equity = DEFAULT_STARTING_CAPITAL;
        const points: { x: number; y: number }[] = [{ x: 0, y: equity }];
        completed.forEach((o, i) => {
            const ret = o.return_at_5d ?? o.return_at_1d ?? 0;
            equity *= (1 + ret / 100 * 0.1); // 10% position size
            points.push({ x: i + 1, y: equity });
        });
        const minEq = Math.min(...points.map(p => p.y));
        const maxEq = Math.max(...points.map(p => p.y));
        const range = maxEq - minEq || 1;
        const w = 800, h = 200, pad = 10;
        return points.map((p, i) => {
            const x = pad + (p.x / (points.length - 1)) * (w - 2 * pad);
            const y = h - pad - ((p.y - minEq) / range) * (h - 2 * pad);
            return `${i === 0 ? 'M' : 'L'}${x},${y}`;
        }).join(' ');
    }, [filteredOutcomes]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="w-8 h-8 text-sentinel-400 animate-spin" />
            </div>
        );
    }

    if (outcomes.length === 0) {
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" /> Signal Performance
                    </h1>
                </div>
                <EmptyState
                    icon={<BarChart3 className="w-8 h-8 text-emerald-400" />}
                    title="No Performance Data Yet"
                    description="Signal performance data will appear here once the scanner generates signals and enough time passes for outcome tracking (1-30 days)."
                    action={
                        <Link to="/scanner" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center gap-2 no-underline">
                            <Zap className="w-4 h-4" /> Go to Scanner
                        </Link>
                    }
                />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400" /> Signal Performance
                    </h1>
                    <p className="text-sentinel-400 mt-1 text-sm">
                        How Sentinel's AI signals have performed over time
                    </p>
                </div>
                <div className="flex gap-2">
                    {TIME_RANGES.map(r => (
                        <button
                            key={r.days}
                            onClick={() => setSelectedRange(r.days)}
                            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                                selectedRange === r.days
                                    ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/50'
                                    : 'bg-white/5 text-sentinel-400 hover:text-sentinel-200'
                            }`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} sub={`${stats.wins}W / ${stats.losses}L`} icon={Target} color={stats.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'} />
                <StatCard label="Avg Return (5D)" value={`${stats.avgReturn5d >= 0 ? '+' : ''}${stats.avgReturn5d.toFixed(2)}%`} sub="Per signal" icon={TrendingUp} color={stats.avgReturn5d >= 0 ? 'text-emerald-400' : 'text-red-400'} />
                <StatCard label="Target Hits" value={`${stats.targetHits}`} sub={`of ${stats.total} signals`} icon={ArrowUpRight} color="text-emerald-400" />
                <StatCard label="Stop Losses" value={`${stats.stopHits}`} sub={`of ${stats.total} signals`} icon={ArrowDownRight} color="text-red-400" />
                <StatCard label="Max Gain" value={`+${stats.maxGain.toFixed(1)}%`} sub="Best signal" icon={Award} color="text-emerald-400" />
                <StatCard label="Win Streak" value={`${stats.maxWinStreak}W / ${stats.maxLossStreak}L`} sub={`Current: ${stats.currentStreak} ${stats.currentStreakType}`} icon={Flame} color="text-purple-400" />
            </div>

            {/* Equity Curve */}
            {equityPath && (
                <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                    <h2 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" /> Simulated Equity Curve (10% sizing)
                    </h2>
                    <div className="overflow-x-auto">
                        <svg viewBox="0 0 800 200" className="w-full h-40 sm:h-48">
                            <defs>
                                <linearGradient id="perfGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor={stats.avgReturn5d >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
                                    <stop offset="100%" stopColor={stats.avgReturn5d >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0" />
                                </linearGradient>
                            </defs>
                            <path d={`${equityPath} L790,190 L10,190 Z`} fill="url(#perfGrad)" />
                            <path d={equityPath} fill="none" stroke={stats.avgReturn5d >= 0 ? '#10b981' : '#ef4444'} strokeWidth="2" strokeLinecap="round" />
                        </svg>
                    </div>
                </motion.div>
            )}

            {/* Win Rate Breakdowns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By Signal Type */}
                <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                    <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5" /> Win Rate by Signal Type
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(stats.byType).map(([type, data]) => {
                            const wr = data.wins + data.losses > 0 ? (data.wins / (data.wins + data.losses)) * 100 : 0;
                            const barColor = wr >= 60 ? 'bg-emerald-500' : wr >= 40 ? 'bg-amber-500' : 'bg-red-500';
                            return (
                                <div key={type} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-sentinel-300 capitalize">{type.replace(/_/g, ' ')}</span>
                                        <span className={`font-mono font-bold ${wr >= 60 ? 'text-emerald-400' : wr >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                                            {wr.toFixed(0)}% <span className="text-sentinel-500 font-normal">({data.wins}W/{data.losses}L)</span>
                                        </span>
                                    </div>
                                    <div className="h-2 bg-sentinel-800/60 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(wr, 100)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                        {Object.keys(stats.byType).length === 0 && (
                            <p className="text-xs text-sentinel-500 italic">No data available yet.</p>
                        )}
                    </div>
                </motion.div>

                {/* By Bias Type */}
                <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                    <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5" /> Win Rate by Bias Type
                    </h3>
                    <div className="space-y-3">
                        {Object.entries(stats.byBias).map(([bias, data]) => {
                            const wr = data.wins + data.losses > 0 ? (data.wins / (data.wins + data.losses)) * 100 : 0;
                            const barColor = wr >= 60 ? 'bg-emerald-500' : wr >= 40 ? 'bg-amber-500' : 'bg-red-500';
                            return (
                                <div key={bias} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-sentinel-300 capitalize">{bias.replace(/_/g, ' ')}</span>
                                        <span className={`font-mono font-bold ${wr >= 60 ? 'text-emerald-400' : wr >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                                            {wr.toFixed(0)}% <span className="text-sentinel-500 font-normal">({data.wins}W/{data.losses}L)</span>
                                        </span>
                                    </div>
                                    <div className="h-2 bg-sentinel-800/60 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(wr, 100)}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                        {Object.keys(stats.byBias).length === 0 && (
                            <p className="text-xs text-sentinel-500 italic">No data available yet.</p>
                        )}
                    </div>
                </motion.div>
            </div>

            {/* Confidence Calibration */}
            <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5" /> Confidence Calibration
                </h3>
                <p className="text-[11px] text-sentinel-500 mb-4">Is the AI's confidence score accurate? Bars show actual win rate vs predicted.</p>
                <div className="flex items-end gap-2 h-[160px] pt-4">
                    {Object.entries(stats.calibrationBuckets)
                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                        .map(([bucket, data]) => {
                            const maxVal = 100;
                            const barH = (data.actual / maxVal) * 120;
                            const refH = (data.predicted / maxVal) * 120;
                            const isOver = data.actual >= data.predicted;
                            return (
                                <div key={bucket} className="flex-1 flex flex-col items-center gap-1 relative group min-w-[30px]">
                                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-sentinel-800 border border-sentinel-700 text-[10px] text-sentinel-200 px-2 py-1 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                        Predicted: {data.predicted.toFixed(0)}% | Actual: {data.actual.toFixed(0)}% | n={data.count}
                                    </div>
                                    <div className="w-full flex flex-col items-center justify-end" style={{ height: 120 }}>
                                        <div className="absolute w-full" style={{ bottom: refH }}>
                                            <div className="h-px bg-sentinel-500/40 w-full" />
                                        </div>
                                        <div className={`w-full rounded-t transition-all ${isOver ? 'bg-emerald-500/70' : 'bg-red-500/70'}`} style={{ height: barH }} />
                                    </div>
                                    <span className="text-[9px] text-sentinel-500 font-mono">{bucket}</span>
                                </div>
                            );
                        })}
                </div>
                <div className="flex items-center justify-center gap-4 text-[10px] text-sentinel-500 mt-2">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/70" /> Actual &ge; Predicted</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/70" /> Actual &lt; Predicted</span>
                </div>
            </motion.div>

            {/* Trade Replay */}
            <TradeReplay />

            {/* Correlation Dashboard */}
            <CorrelationDashboard />

            {/* Pending Outcomes */}
            {stats.pending > 0 && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/5 rounded-xl border border-amber-500/10">
                    <Clock className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-amber-300">
                        {stats.pending} signal{stats.pending !== 1 ? 's' : ''} still being tracked (outcome pending)
                    </span>
                </div>
            )}
        </div>
    );
}
