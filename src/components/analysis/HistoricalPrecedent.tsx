/**
 * HistoricalPrecedent — Shows historical pattern matches and aggregate stats.
 */

import { History } from 'lucide-react';
import { ConfidenceMeter } from '@/components/shared/ConfidenceMeter';
import { Badge } from '@/components/shared/Badge';

interface HistoricalMatch {
    ticker: string;
    date: string;
    event_description: string;
    initial_move_pct: number;
    outcome_30d_pct: number;
    outcome: string;
    similarity_score: number;
    source_url?: string | null;
}

interface AggregateStats {
    avg_return_1d?: number;
    avg_return_5d?: number;
    avg_return_10d?: number;
    avg_return_30d?: number;
    win_rate?: number;
    worst_case?: number;
    best_case?: number;
    sample_size?: number;
}

interface HistoricalPrecedentProps {
    matches?: HistoricalMatch[];
    aggregateStats?: AggregateStats;
    patternConfidence?: number;
    caveats?: string[];
    source?: string;
}

export function HistoricalPrecedent({
    matches = [],
    aggregateStats,
    patternConfidence,
    caveats = [],
    source,
}: HistoricalPrecedentProps) {
    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4 text-purple-400" /> Historical Precedent
                </h3>
                {source && (
                    <Badge
                        label={source}
                        color={source === 'internal' ? '#22C55E' : '#3B82F6'}
                        size="sm"
                    />
                )}
            </div>

            {/* Aggregate stats */}
            {aggregateStats && aggregateStats.sample_size && aggregateStats.sample_size > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    <div className="bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50 text-center">
                        <p className="text-xs text-sentinel-500 mb-1">Win Rate</p>
                        <p className={`text-lg font-bold font-mono ${(aggregateStats.win_rate || 0) >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {aggregateStats.win_rate?.toFixed(0) || 0}%
                        </p>
                    </div>
                    <div className="bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50 text-center">
                        <p className="text-xs text-sentinel-500 mb-1">Avg 30d Return</p>
                        <p className={`text-lg font-bold font-mono ${(aggregateStats.avg_return_30d || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(aggregateStats.avg_return_30d || 0) >= 0 ? '+' : ''}{aggregateStats.avg_return_30d?.toFixed(1) || 0}%
                        </p>
                    </div>
                    <div className="bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50 text-center">
                        <p className="text-xs text-sentinel-500 mb-1">Best Case</p>
                        <p className="text-lg font-bold font-mono text-emerald-400">
                            +{aggregateStats.best_case?.toFixed(1) || 0}%
                        </p>
                    </div>
                    <div className="bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50 text-center">
                        <p className="text-xs text-sentinel-500 mb-1">Worst Case</p>
                        <p className="text-lg font-bold font-mono text-red-400">
                            {aggregateStats.worst_case?.toFixed(1) || 0}%
                        </p>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-sentinel-500 text-center py-2 mb-4">
                    No historical pattern matches available.
                </p>
            )}

            {/* Pattern confidence */}
            {patternConfidence != null && (
                <div className="mb-4">
                    <ConfidenceMeter value={patternConfidence} label="Pattern Confidence" />
                </div>
            )}

            {/* Match list */}
            {matches.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs text-sentinel-500 font-semibold">
                        {matches.length} Similar Events ({aggregateStats?.sample_size || matches.length} total samples)
                    </p>
                    {matches.slice(0, 5).map((m, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-sentinel-950/50 rounded-lg border border-sentinel-800/50 text-xs">
                            <div className="flex-1 min-w-0">
                                <span className="font-mono font-bold text-sentinel-200">{m.ticker}</span>
                                <span className="text-sentinel-600 ml-2">{m.date}</span>
                                <p className="text-sentinel-400 truncate">{m.event_description}</p>
                            </div>
                            <div className="flex items-center gap-3 ml-3">
                                <span className={`font-mono font-bold ${m.outcome_30d_pct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {m.outcome_30d_pct >= 0 ? '+' : ''}{m.outcome_30d_pct.toFixed(1)}%
                                </span>
                                <Badge
                                    label={m.outcome}
                                    color={m.outcome === 'win' ? '#22C55E' : m.outcome === 'loss' ? '#EF4444' : '#6B7280'}
                                    size="sm"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Caveats */}
            {caveats.length > 0 && (
                <div className="mt-4 p-3 bg-amber-500/5 rounded-lg border border-amber-500/10">
                    <p className="text-xs font-semibold text-amber-400 mb-1">Caveats</p>
                    <ul className="space-y-1">
                        {caveats.map((c, i) => (
                            <li key={i} className="text-xs text-sentinel-400">• {c}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
