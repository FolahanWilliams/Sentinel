/**
 * DashboardConvergence — Surfaces news convergence alerts on the Dashboard.
 *
 * Uses the Sentinel feed to detect when 2+ independent sources produce
 * signals pointing the same direction for the same ticker, then promotes
 * these as actionable alerts alongside the signal feed.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSentinel } from '@/hooks/useSentinel';
import type { ProcessedArticle, SentinelTradingSignal } from '@/types/sentinel';
import { Zap, TrendingUp, TrendingDown, Activity, Radar, Loader2 } from 'lucide-react';

export interface ConvergenceSignal {
    ticker: string;
    direction: 'up' | 'down' | 'volatile';
    sourceCount: number;
    signalCount: number;
    avgConfidence: number;
    signalTypes: string[];
    sources: string[];
}

function detectConvergence(articles: ProcessedArticle[]): ConvergenceSignal[] {
    const tickerMap: Record<string, Record<string, {
        signals: (SentinelTradingSignal & { source: string })[];
        sources: Set<string>;
    }>> = {};

    for (const article of articles) {
        if (!article.signals) continue;
        for (const signal of article.signals) {
            if (!signal.ticker || !signal.direction) continue;
            const tk = signal.ticker.toUpperCase();
            const dir = signal.direction;

            if (!tickerMap[tk]) tickerMap[tk] = {};
            if (!tickerMap[tk][dir]) tickerMap[tk][dir] = { signals: [], sources: new Set() };

            tickerMap[tk][dir].signals.push({ ...signal, source: article.source });
            tickerMap[tk][dir].sources.add(article.source);
        }
    }

    const convergences: ConvergenceSignal[] = [];

    for (const [ticker, directions] of Object.entries(tickerMap)) {
        for (const [direction, data] of Object.entries(directions)) {
            if (data.sources.size >= 2) {
                const avgConf = data.signals.reduce((sum, s) => sum + s.confidence, 0) / data.signals.length;
                convergences.push({
                    ticker,
                    direction: direction as 'up' | 'down' | 'volatile',
                    sourceCount: data.sources.size,
                    signalCount: data.signals.length,
                    avgConfidence: avgConf,
                    signalTypes: [...new Set(data.signals.map(s => s.type))],
                    sources: [...data.sources],
                });
            }
        }
    }

    return convergences.sort((a, b) => {
        if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
        return b.avgConfidence - a.avgConfidence;
    });
}

export function DashboardConvergence() {
    const { data, loading } = useSentinel();
    const navigate = useNavigate();

    const convergences = useMemo(
        () => data?.articles ? detectConvergence(data.articles) : [],
        [data]
    );

    // Don't render anything if no convergences and not loading
    if (!loading && convergences.length === 0) return null;

    if (loading && !data) {
        return (
            <div className="glass-panel rounded-xl p-4">
                <div className="flex items-center gap-2 text-sentinel-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Scanning for signal convergence...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gradient-to-br from-amber-500/5 to-sentinel-900/40 border border-amber-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-500/15">
                <Zap className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold text-amber-300 text-sm">Signal Convergence</h3>
                <span className="ml-auto text-[10px] font-mono text-amber-500/70 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    {convergences.length} {convergences.length === 1 ? 'alignment' : 'alignments'}
                </span>
            </div>

            <div className="space-y-2">
                {convergences.slice(0, 5).map((conv) => {
                    const DirIcon = conv.direction === 'up' ? TrendingUp
                        : conv.direction === 'down' ? TrendingDown
                        : Activity;

                    const dirColor = conv.direction === 'up'
                        ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25'
                        : conv.direction === 'down'
                        ? 'text-red-400 bg-red-500/15 border-red-500/25'
                        : 'text-amber-400 bg-amber-500/15 border-amber-500/25';

                    return (
                        <div
                            key={`${conv.ticker}-${conv.direction}`}
                            className="bg-sentinel-900/50 rounded-lg p-3 border border-sentinel-700/40 hover:border-amber-500/30 transition-colors group cursor-pointer"
                            onClick={() => navigate(`/analysis/${conv.ticker}`)}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sentinel-100 text-sm font-mono">
                                        {conv.ticker}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${dirColor}`}>
                                        <DirIcon className="h-2.5 w-2.5" />
                                        {conv.direction.toUpperCase()}
                                    </span>
                                    <span className="text-[10px] text-sentinel-500">
                                        {conv.sourceCount} sources • {Math.round(conv.avgConfidence * 100)}% conf
                                    </span>
                                </div>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/scanner?ticker=${conv.ticker}`);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 transition-all cursor-pointer border border-indigo-500/20"
                                    title={`Scan ${conv.ticker}`}
                                >
                                    <Radar className="h-3 w-3" />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                                {conv.signalTypes.map(type => (
                                    <span key={type} className="text-[10px] font-mono uppercase tracking-wider text-sentinel-500 bg-sentinel-800/60 px-1.5 py-0.5 rounded">
                                        {type.replace('_', ' ')}
                                    </span>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {convergences.length > 5 && (
                <button
                    onClick={() => navigate('/?tab=intelligence')}
                    className="mt-2 text-xs text-amber-400/70 hover:text-amber-300 transition-colors bg-transparent border-none cursor-pointer"
                >
                    View all {convergences.length} convergences →
                </button>
            )}
        </div>
    );
}
