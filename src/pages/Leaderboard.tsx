/**
 * Leaderboard — Signal Hit Rate by Source
 *
 * Aggregates signal outcomes by their source feed to show which
 * RSS feeds, news sources, and data providers produce the most
 * accurate trading signals over time.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import {
    Trophy, TrendingUp, BarChart3,
    Loader2, Award, Medal, Target, Hash,
    ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/EmptyState';

// ─── Types ───

interface SignalWithOutcome {
    id: string;
    ticker: string;
    signal_type: string;
    confidence_score: number;
    sources: string[] | null;
    created_at: string;
    outcome?: {
        outcome: string;
        return_at_5d: number | null;
        return_at_10d: number | null;
        return_at_30d: number | null;
        hit_target: boolean;
        hit_stop_loss: boolean;
    };
}

interface SourceStats {
    source: string;
    totalSignals: number;
    wins: number;
    losses: number;
    pending: number;
    winRate: number;
    avgReturn5d: number;
    avgReturn10d: number;
    avgReturn30d: number;
    avgConfidence: number;
    hitTargetRate: number;
    hitStopRate: number;
    score: number; // composite quality score
}

type SortField = 'score' | 'winRate' | 'totalSignals' | 'avgReturn5d' | 'avgReturn10d';
type TimeRange = '30d' | '60d' | '90d' | 'all';

// ─── Component ───

export function Leaderboard() {
    const [signals, setSignals] = useState<SignalWithOutcome[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortField, setSortField] = useState<SortField>('score');
    const [timeRange, setTimeRange] = useState<TimeRange>('90d');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);

            // Build date filter
            let dateFilter: string | undefined;
            if (timeRange !== 'all') {
                const days = timeRange === '30d' ? 30 : timeRange === '60d' ? 60 : 90;
                const since = new Date(Date.now() - days * 86400000).toISOString();
                dateFilter = since;
            }

            // Fetch signals with sources
            let query = supabase
                .from('signals')
                .select('id, ticker, signal_type, confidence_score, sources, created_at')
                .not('sources', 'is', null);

            if (dateFilter) {
                query = query.gte('created_at', dateFilter);
            }

            const { data: signalData } = await query.order('created_at', { ascending: false });

            if (!signalData || signalData.length === 0) {
                setSignals([]);
                setLoading(false);
                return;
            }

            // Fetch outcomes for these signals
            const signalIds = signalData.map(s => s.id);
            const { data: outcomes } = await supabase
                .from('signal_outcomes')
                .select('signal_id, outcome, return_at_5d, return_at_10d, return_at_30d, hit_target, hit_stop_loss')
                .in('signal_id', signalIds);

            const outcomeMap = new Map<string, SignalWithOutcome['outcome']>();
            for (const o of outcomes || []) {
                outcomeMap.set(o.signal_id, {
                    outcome: o.outcome,
                    return_at_5d: o.return_at_5d,
                    return_at_10d: o.return_at_10d,
                    return_at_30d: o.return_at_30d,
                    hit_target: o.hit_target ?? false,
                    hit_stop_loss: o.hit_stop_loss ?? false,
                });
            }

            const merged: SignalWithOutcome[] = signalData.map(s => ({
                ...s,
                sources: s.sources as string[] | null,
                outcome: outcomeMap.get(s.id),
            }));

            setSignals(merged);
            setLoading(false);
        }

        fetchData();
    }, [timeRange]);

    // Aggregate stats by source
    const sourceStats: SourceStats[] = useMemo(() => {
        const map = new Map<string, {
            total: number; wins: number; losses: number; pending: number;
            returns5d: number[]; returns10d: number[]; returns30d: number[];
            confidences: number[]; hitTargets: number; hitStops: number;
        }>();

        for (const signal of signals) {
            const sources = signal.sources || ['Unknown'];
            const outcome = signal.outcome;

            for (const source of sources) {
                const trimmed = source.trim();
                if (!trimmed) continue;

                if (!map.has(trimmed)) {
                    map.set(trimmed, {
                        total: 0, wins: 0, losses: 0, pending: 0,
                        returns5d: [], returns10d: [], returns30d: [],
                        confidences: [], hitTargets: 0, hitStops: 0,
                    });
                }

                const stats = map.get(trimmed)!;
                stats.total++;
                stats.confidences.push(signal.confidence_score ?? 0);

                if (outcome) {
                    if (outcome.outcome === 'win') stats.wins++;
                    else if (outcome.outcome === 'loss') stats.losses++;
                    else stats.pending++;

                    if (outcome.return_at_5d != null) stats.returns5d.push(outcome.return_at_5d);
                    if (outcome.return_at_10d != null) stats.returns10d.push(outcome.return_at_10d);
                    if (outcome.return_at_30d != null) stats.returns30d.push(outcome.return_at_30d);
                    if (outcome.hit_target) stats.hitTargets++;
                    if (outcome.hit_stop_loss) stats.hitStops++;
                } else {
                    stats.pending++;
                }
            }
        }

        const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

        return Array.from(map.entries())
            .map(([source, s]) => {
                const resolved = s.wins + s.losses;
                const winRate = resolved > 0 ? (s.wins / resolved) * 100 : 0;
                const hitTargetRate = resolved > 0 ? (s.hitTargets / resolved) * 100 : 0;
                const hitStopRate = resolved > 0 ? (s.hitStops / resolved) * 100 : 0;

                // Composite score: weighted blend of win rate, avg return, and sample size
                const sampleBonus = Math.min(20, s.total * 2); // up to 20 points for volume
                const returnBonus = Math.max(-10, Math.min(20, avg(s.returns5d) * 100)); // return contribution
                const score = resolved > 0
                    ? Math.round(winRate * 0.5 + sampleBonus + returnBonus + hitTargetRate * 0.1)
                    : 0;

                return {
                    source,
                    totalSignals: s.total,
                    wins: s.wins,
                    losses: s.losses,
                    pending: s.pending,
                    winRate,
                    avgReturn5d: avg(s.returns5d) * 100,
                    avgReturn10d: avg(s.returns10d) * 100,
                    avgReturn30d: avg(s.returns30d) * 100,
                    avgConfidence: avg(s.confidences),
                    hitTargetRate,
                    hitStopRate,
                    score,
                };
            })
            .filter(s => s.totalSignals >= 1)
            .sort((a, b) => b[sortField] - a[sortField]);
    }, [signals, sortField]);

    const totalSources = sourceStats.length;
    const totalSignals = signals.length;
    const topSource = sourceStats[0];

    const getRankIcon = (idx: number) => {
        if (idx === 0) return <Trophy className="w-5 h-5 text-amber-400" />;
        if (idx === 1) return <Award className="w-5 h-5 text-sentinel-300" />;
        if (idx === 2) return <Medal className="w-5 h-5 text-amber-600" />;
        return <Hash className="w-4 h-4 text-sentinel-500" />;
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-amber-400" />
                    Signal Leaderboard
                </h1>
                <div className="flex items-center gap-2">
                    {(['30d', '60d', '90d', 'all'] as const).map(range => (
                        <button
                            key={range}
                            onClick={() => setTimeRange(range)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border-none ${
                                timeRange === range
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-sentinel-800/50 text-sentinel-400 hover:text-sentinel-200'
                            }`}
                        >
                            {range === 'all' ? 'All Time' : range.replace('d', ' Days')}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 text-sentinel-400 animate-spin" />
                </div>
            ) : signals.length === 0 ? (
                <EmptyState
                    icon={<Trophy className="w-10 h-10" />}
                    title="No signal data yet"
                    description="Once the scanner generates signals with tracked outcomes, you'll see which sources produce the best signals."
                />
            ) : (
                <>
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="glass-panel p-4 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                                <BarChart3 className="w-4 h-4 text-blue-400" />
                                <span className="text-xs text-sentinel-400">Sources Tracked</span>
                            </div>
                            <span className="text-2xl font-bold text-sentinel-100">{totalSources}</span>
                        </div>
                        <div className="glass-panel p-4 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                                <Target className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs text-sentinel-400">Total Signals</span>
                            </div>
                            <span className="text-2xl font-bold text-sentinel-100">{totalSignals}</span>
                        </div>
                        <div className="glass-panel p-4 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                                <Trophy className="w-4 h-4 text-amber-400" />
                                <span className="text-xs text-sentinel-400">Top Source</span>
                            </div>
                            <span className="text-lg font-bold text-sentinel-100 truncate block">
                                {topSource?.source ?? '—'}
                            </span>
                        </div>
                        <div className="glass-panel p-4 rounded-xl">
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingUp className="w-4 h-4 text-emerald-400" />
                                <span className="text-xs text-sentinel-400">Best Win Rate</span>
                            </div>
                            <span className="text-2xl font-bold text-emerald-400">
                                {topSource && topSource.wins + topSource.losses > 0
                                    ? `${topSource.winRate.toFixed(0)}%`
                                    : '—'}
                            </span>
                        </div>
                    </div>

                    {/* Sort Controls */}
                    <div className="flex items-center gap-2 text-xs text-sentinel-400">
                        <span>Sort by:</span>
                        {([
                            { field: 'score' as const, label: 'Score' },
                            { field: 'winRate' as const, label: 'Win Rate' },
                            { field: 'totalSignals' as const, label: 'Volume' },
                            { field: 'avgReturn5d' as const, label: '5D Return' },
                            { field: 'avgReturn10d' as const, label: '10D Return' },
                        ]).map(({ field, label }) => (
                            <button
                                key={field}
                                onClick={() => setSortField(field)}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer border-none ${
                                    sortField === field
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-sentinel-800/30 text-sentinel-500 hover:text-sentinel-300'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Leaderboard Table */}
                    <div className="glass-panel rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-sentinel-400 bg-sentinel-900/50">
                                        <th className="py-3 px-4 w-12">#</th>
                                        <th className="py-3 px-4">Source</th>
                                        <th className="py-3 px-4 text-center">Signals</th>
                                        <th className="py-3 px-4 text-center">W / L</th>
                                        <th className="py-3 px-4 text-right">Win Rate</th>
                                        <th className="py-3 px-4 text-right">Avg 5D</th>
                                        <th className="py-3 px-4 text-right">Avg 10D</th>
                                        <th className="py-3 px-4 text-right">Target %</th>
                                        <th className="py-3 px-4 text-right">Score</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sourceStats.map((s, idx) => {
                                        const resolved = s.wins + s.losses;
                                        return (
                                            <motion.tr
                                                key={s.source}
                                                initial={{ opacity: 0, x: -8 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.03 }}
                                                className="border-t border-sentinel-800/50 hover:bg-sentinel-800/30 transition-colors"
                                            >
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center justify-center">
                                                        {getRankIcon(idx)}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="font-medium text-sentinel-100">{s.source}</span>
                                                    <span className="text-xs text-sentinel-500 ml-2">
                                                        avg {s.avgConfidence.toFixed(0)}% conf
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4 text-center text-sentinel-200">{s.totalSignals}</td>
                                                <td className="py-3 px-4 text-center">
                                                    <span className="text-emerald-400">{s.wins}</span>
                                                    <span className="text-sentinel-600 mx-1">/</span>
                                                    <span className="text-red-400">{s.losses}</span>
                                                    {s.pending > 0 && (
                                                        <span className="text-sentinel-600 text-xs ml-1">({s.pending}p)</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    {resolved > 0 ? (
                                                        <span className={`font-bold ${
                                                            s.winRate >= 60 ? 'text-emerald-400'
                                                                : s.winRate >= 45 ? 'text-amber-400'
                                                                    : 'text-red-400'
                                                        }`}>
                                                            {s.winRate.toFixed(0)}%
                                                        </span>
                                                    ) : (
                                                        <Minus className="w-4 h-4 text-sentinel-600 inline" />
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <ReturnBadge value={s.avgReturn5d} />
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <ReturnBadge value={s.avgReturn10d} />
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    {resolved > 0 ? (
                                                        <span className="text-sentinel-200">{s.hitTargetRate.toFixed(0)}%</span>
                                                    ) : (
                                                        <Minus className="w-4 h-4 text-sentinel-600 inline" />
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <span className={`text-lg font-bold ${
                                                        s.score >= 60 ? 'text-emerald-400'
                                                            : s.score >= 35 ? 'text-amber-400'
                                                                : s.score > 0 ? 'text-red-400'
                                                                    : 'text-sentinel-600'
                                                    }`}>
                                                        {s.score > 0 ? s.score : '—'}
                                                    </span>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Helpers ───

function ReturnBadge({ value }: { value: number }) {
    if (value === 0) return <Minus className="w-4 h-4 text-sentinel-600 inline" />;
    const positive = value > 0;
    return (
        <span className={`inline-flex items-center gap-0.5 text-sm font-medium ${
            positive ? 'text-emerald-400' : 'text-red-400'
        }`}>
            {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(value).toFixed(2)}%
        </span>
    );
}
