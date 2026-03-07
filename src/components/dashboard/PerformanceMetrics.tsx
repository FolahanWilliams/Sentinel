/**
 * Sentinel — Performance Tab
 *
 * Portfolio performance over time, win rate by category,
 * top winners/losers, and a post-mortem trigger button.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { DEFAULT_STARTING_CAPITAL, DEFAULT_RISK_PER_TRADE_PCT } from '@/config/constants';
import { usePortfolio } from '@/hooks/usePortfolio';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { EmptyState } from '@/components/shared/EmptyState';
import { DonutChart } from '@/components/shared/DonutChart';
import { SkeletonCard } from '@/components/shared/SkeletonPrimitives';
import {
    LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
    BarChart3, Trophy, AlertTriangle, RefreshCw, TrendingUp, Brain,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { SignalOutcome } from '@/types/signals';
import type { CategoryWinRate } from '@/types/dashboard';

interface PerformanceMetricsProps {
    className?: string;
}

interface OutcomeWithSignal extends SignalOutcome {
    signal_type?: string;
    bias_type?: string;
    thesis?: string;
    ticker: string;
}

const CATEGORY_COLORS: Record<string, string> = {
    long_overreaction: '#10b981',
    short_overreaction: '#ef4444',
    sector_contagion: '#3b82f6',
    earnings_overreaction: '#f59e0b',
    information: '#8b5cf6',
};

export function PerformanceMetrics({ className = '' }: PerformanceMetricsProps) {
    const { config, closedPositions } = usePortfolio();
    const [outcomes, setOutcomes] = useState<OutcomeWithSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [runningReflection, setRunningReflection] = useState(false);
    const [reflectionResult, setReflectionResult] = useState<string | null>(null);

    // Fetch completed outcomes with parent signal data
    useEffect(() => {
        async function fetchOutcomes() {
            const { data, error } = await supabase
                .from('signal_outcomes')
                .select('*, signals!inner(signal_type, bias_type, thesis, ticker)')
                .neq('outcome', 'pending')
                .order('completed_at', { ascending: false })
                .limit(200);

            if (!error && data) {
                const mapped: OutcomeWithSignal[] = data.map((d: Record<string, unknown>) => {
                    const sig = d.signals as Record<string, unknown> | undefined;
                    return {
                        ...d,
                        signal_type: sig?.signal_type as string | undefined,
                        bias_type: sig?.bias_type as string | undefined,
                        thesis: sig?.thesis as string | undefined,
                        ticker: (sig?.ticker as string) ?? (d.ticker as string),
                    } as OutcomeWithSignal;
                });
                setOutcomes(mapped);
            }
            setLoading(false);
        }
        fetchOutcomes();
    }, []);

    // Portfolio value over time — uses real closed positions P&L when available,
    // falls back to signal outcomes with actual position sizing from config.
    const performanceChart = useMemo(() => {
        const startingCapital = config?.total_capital ?? DEFAULT_STARTING_CAPITAL;
        const positionSizePct = (config?.risk_per_trade_pct ?? DEFAULT_RISK_PER_TRADE_PCT) / 100;

        // Prefer real closed positions if we have them (actual realized P&L)
        if (closedPositions.length > 0) {
            const sorted = [...closedPositions]
                .filter(p => p.closed_at)
                .sort((a, b) => new Date(a.closed_at!).getTime() - new Date(b.closed_at!).getTime());

            let cumulative = startingCapital;
            return sorted.map(p => {
                cumulative += (p.realized_pnl ?? 0);
                return {
                    date: new Date(p.closed_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    value: Math.round(cumulative),
                };
            });
        }

        // Fall back to signal outcomes if no closed positions
        if (outcomes.length === 0) return [];
        const sorted = [...outcomes]
            .filter(o => o.completed_at)
            .sort((a, b) => new Date(a.completed_at!).getTime() - new Date(b.completed_at!).getTime());

        let cumulative = startingCapital;
        return sorted.map(o => {
            const returnPct = Number(o.return_at_30d ?? o.return_at_10d ?? o.return_at_5d ?? o.return_at_1d ?? 0);
            cumulative += cumulative * (returnPct / 100) * positionSizePct;
            return {
                date: new Date(o.completed_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                value: Math.round(cumulative),
            };
        });
    }, [outcomes, config, closedPositions]);

    // Win rate by category
    const categoryStats = useMemo((): CategoryWinRate[] => {
        const stats: Record<string, { wins: number; losses: number; totalReturn: number }> = {};

        for (const o of outcomes) {
            const cat = o.signal_type ?? 'unknown';
            if (!stats[cat]) stats[cat] = { wins: 0, losses: 0, totalReturn: 0 };
            if (o.outcome === 'win') stats[cat].wins++;
            else stats[cat].losses++;
            const ret = Number(o.return_at_30d ?? o.return_at_10d ?? o.return_at_5d ?? o.return_at_1d ?? 0);
            stats[cat].totalReturn += ret;
        }

        return Object.entries(stats).map(([category, s]) => ({
            category,
            wins: s.wins,
            losses: s.losses,
            total: s.wins + s.losses,
            winRate: s.wins + s.losses > 0 ? (s.wins / (s.wins + s.losses)) * 100 : 0,
            avgReturn: s.wins + s.losses > 0 ? s.totalReturn / (s.wins + s.losses) : 0,
        }));
    }, [outcomes]);

    // Top 5 winners and losers
    const topWinners = useMemo(() => {
        return [...outcomes]
            .filter(o => o.outcome === 'win')
            .sort((a, b) => (b.max_gain ?? 0) - (a.max_gain ?? 0))
            .slice(0, 5);
    }, [outcomes]);

    const topLosers = useMemo(() => {
        return [...outcomes]
            .filter(o => o.outcome === 'loss')
            .sort((a, b) => (a.max_drawdown ?? 0) - (b.max_drawdown ?? 0))
            .slice(0, 5);
    }, [outcomes]);

    // Overall stats
    const overallWinRate = useMemo(() => {
        const wins = outcomes.filter(o => o.outcome === 'win').length;
        return outcomes.length > 0 ? (wins / outcomes.length) * 100 : 0;
    }, [outcomes]);

    // Trigger reflection agent
    const handleReflection = async () => {
        setRunningReflection(true);
        setReflectionResult(null);
        try {
            // Dynamic import to avoid circular dependency
            const { ReflectionAgent } = await import('@/services/reflectionAgent');
            const result = await ReflectionAgent.runReflection();
            setReflectionResult(`Generated ${result.lessons.length} lessons from ${result.outcomes_analyzed} outcomes.`);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setReflectionResult(`Reflection failed: ${message}`);
        } finally {
            setRunningReflection(false);
        }
    };

    if (loading) {
        return (
            <div className={`space-y-6 ${className}`}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SkeletonCard lines={5} />
                    <SkeletonCard lines={5} />
                </div>
            </div>
        );
    }

    if (outcomes.length === 0) {
        return (
            <EmptyState
                icon={<BarChart3 className="w-8 h-8 text-sentinel-400" />}
                title="No performance data yet"
                description="Performance metrics will appear once signal outcomes are tracked. Signals need at least 1 day of tracking."
            />
        );
    }

    return (
        <ErrorBoundary>
            <div className={`space-y-6 ${className}`}>
                {/* Summary row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard label="Total Outcomes" value={`${outcomes.length}`} />
                    <StatCard label="Win Rate" value={`${overallWinRate.toFixed(0)}%`} positive={overallWinRate >= 50} />
                    <StatCard label="Wins" value={`${outcomes.filter(o => o.outcome === 'win').length}`} positive />
                    <StatCard label="Losses" value={`${outcomes.filter(o => o.outcome === 'loss').length}`} positive={false} />
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Portfolio value chart */}
                    <div className="glass-panel rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-sentinel-200 flex items-center gap-2 mb-4">
                            <TrendingUp className="w-4 h-4 text-sentinel-400" /> Portfolio Value Over Time
                        </h3>
                        {performanceChart.length > 1 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <LineChart data={performanceChart}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fill: '#6b7280', fontSize: 10 }}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                    />
                                    <YAxis
                                        tick={{ fill: '#6b7280', fontSize: 10 }}
                                        axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                        tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: '#1a1a2e',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '8px',
                                            fontSize: '12px',
                                        }}
                                        formatter={(value: number) => [`$${value.toLocaleString()}`, 'Portfolio']}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        stroke="#10b981"
                                        strokeWidth={2}
                                        dot={false}
                                        activeDot={{ r: 4, fill: '#10b981' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-xs text-sentinel-500 text-center py-16">Need more data points for chart</p>
                        )}
                    </div>

                    {/* Win rate by category donut */}
                    <div className="glass-panel rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-sentinel-200 flex items-center gap-2 mb-4">
                            <BarChart3 className="w-4 h-4 text-sentinel-400" /> Win Rate by Category
                        </h3>
                        <div className="flex items-center gap-6">
                            <DonutChart
                                segments={categoryStats.map(c => ({
                                    label: c.category.replace(/_/g, ' '),
                                    value: c.total,
                                    color: CATEGORY_COLORS[c.category] ?? '#6b7280',
                                }))}
                                size={140}
                                thickness={18}
                                centerLabel="Win Rate"
                                centerValue={`${overallWinRate.toFixed(0)}%`}
                            />
                            <div className="flex-1 space-y-2">
                                {categoryStats.map(c => (
                                    <div key={c.category} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className="w-2.5 h-2.5 rounded-full"
                                                style={{ backgroundColor: CATEGORY_COLORS[c.category] ?? '#6b7280' }}
                                            />
                                            <span className="text-sentinel-400 capitalize">{c.category.replace(/_/g, ' ')}</span>
                                        </div>
                                        <div className="flex items-center gap-3 font-mono">
                                            <span className="text-sentinel-500">{c.total}</span>
                                            <span className={c.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}>
                                                {c.winRate.toFixed(0)}%
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Top winners / losers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Winners */}
                    <div className="glass-panel rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-emerald-400 flex items-center gap-2 mb-4">
                            <Trophy className="w-4 h-4" /> Top 5 Winners
                        </h3>
                        {topWinners.length === 0 ? (
                            <p className="text-xs text-sentinel-500 py-4 text-center">No winning trades yet</p>
                        ) : (
                            <div className="space-y-3">
                                {topWinners.map((o, i) => (
                                    <div key={o.id} className="flex items-start justify-between">
                                        <div className="flex items-start gap-2">
                                            <span className="text-[10px] text-sentinel-500 font-mono mt-1">#{i + 1}</span>
                                            <div>
                                                <span className="text-sm font-bold font-mono text-sentinel-200">{o.ticker}</span>
                                                {o.thesis && (
                                                    <p className="text-[10px] text-sentinel-500 mt-0.5 line-clamp-1 max-w-[200px]">{o.thesis}</p>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold font-mono text-emerald-400">
                                            +{Number(o.max_gain ?? 0).toFixed(1)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Top Losers */}
                    <div className="glass-panel rounded-xl p-5">
                        <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2 mb-4">
                            <AlertTriangle className="w-4 h-4" /> Top 5 Losers
                        </h3>
                        {topLosers.length === 0 ? (
                            <p className="text-xs text-sentinel-500 py-4 text-center">No losing trades yet</p>
                        ) : (
                            <div className="space-y-3">
                                {topLosers.map((o, i) => (
                                    <div key={o.id} className="flex items-start justify-between">
                                        <div className="flex items-start gap-2">
                                            <span className="text-[10px] text-sentinel-500 font-mono mt-1">#{i + 1}</span>
                                            <div>
                                                <span className="text-sm font-bold font-mono text-sentinel-200">{o.ticker}</span>
                                                {o.thesis && (
                                                    <p className="text-[10px] text-sentinel-500 mt-0.5 line-clamp-1 max-w-[200px]">{o.thesis}</p>
                                                )}
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold font-mono text-red-400">
                                            {Number(o.max_drawdown ?? 0).toFixed(1)}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Post-Mortem / Reflection section */}
                <div className="glass-panel rounded-xl p-5">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-semibold text-sentinel-200 flex items-center gap-2">
                                <Brain className="w-4 h-4 text-purple-400" /> AI Post-Mortem
                            </h3>
                            <p className="text-xs text-sentinel-500 mt-1">
                                Run the reflection agent to analyze patterns in winning and losing trades.
                            </p>
                        </div>
                        <button
                            onClick={handleReflection}
                            disabled={runningReflection}
                            className="px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg text-sm font-medium transition-colors ring-1 ring-purple-500/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
                            aria-label="Run AI post-mortem analysis"
                        >
                            {runningReflection ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                            {runningReflection ? 'Analyzing...' : 'Run Post-Mortem'}
                        </button>
                    </div>
                    {reflectionResult && (
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-3 text-xs text-sentinel-400 bg-sentinel-800/30 rounded-lg p-3"
                        >
                            {reflectionResult}
                        </motion.p>
                    )}
                </div>
            </div>
        </ErrorBoundary>
    );
}

/** Small stat card */
function StatCard({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
    return (
        <div className="glass-panel rounded-xl p-4">
            <span className="text-[10px] text-sentinel-500 uppercase tracking-wider font-medium">{label}</span>
            <div className={`text-xl font-bold font-mono ${positive === undefined ? 'text-sentinel-100' : positive ? 'text-emerald-400' : 'text-red-400'
                }`}>
                {value}
            </div>
        </div>
    );
}
