import { useMemo } from 'react';
import type { ProcessedArticle, SentinelTradingSignal } from '@/types/sentinel';
import { Zap, TrendingUp, TrendingDown, Activity, Radar } from 'lucide-react';

interface ConvergenceAlertProps {
    articles: ProcessedArticle[];
    onScanTicker?: (ticker: string) => void;
}

export interface ConvergenceSignal {
    ticker: string;
    direction: 'up' | 'down' | 'volatile';
    sourceCount: number;
    signalCount: number;
    avgConfidence: number;
    signalTypes: string[];
    sources: string[];
}

/**
 * Detects convergence: when 2+ independent articles produce signals
 * pointing the same direction for the same ticker.
 */
function detectConvergence(articles: ProcessedArticle[]): ConvergenceSignal[] {
    // Build a map: ticker -> direction -> signals from distinct sources
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
            // Convergence requires signals from at least 2 independent sources
            if (data.sources.size >= 2) {
                const avgConf = data.signals.reduce((sum, s) => sum + s.confidence, 0) / data.signals.length;
                const types = [...new Set(data.signals.map(s => s.type))];
                convergences.push({
                    ticker,
                    direction: direction as 'up' | 'down' | 'volatile',
                    sourceCount: data.sources.size,
                    signalCount: data.signals.length,
                    avgConfidence: avgConf,
                    signalTypes: types,
                    sources: [...data.sources],
                });
            }
        }
    }

    // Sort by source count descending, then confidence
    return convergences.sort((a, b) => {
        if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
        return b.avgConfidence - a.avgConfidence;
    });
}

export function ConvergenceAlert({ articles, onScanTicker }: ConvergenceAlertProps) {
    const convergences = useMemo(() => detectConvergence(articles), [articles]);

    if (convergences.length === 0) return null;

    return (
        <div className="bg-gradient-to-br from-amber-500/5 to-sentinel-900/40 border border-amber-500/20 rounded-xl p-4 mb-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-amber-500/15">
                <Zap className="h-4 w-4 text-amber-400" />
                <h3 className="font-semibold text-amber-300 text-sm">Signal Convergence Detected</h3>
                <span className="ml-auto text-[10px] font-mono text-amber-500/70 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    {convergences.length} {convergences.length === 1 ? 'alignment' : 'alignments'}
                </span>
            </div>

            <div className="space-y-3">
                {convergences.map((conv) => {
                    const DirIcon = conv.direction === 'up' ? TrendingUp
                        : conv.direction === 'down' ? TrendingDown
                        : Activity;

                    const dirColor = conv.direction === 'up'
                        ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/25'
                        : conv.direction === 'down'
                        ? 'text-red-400 bg-red-500/15 border-red-500/25'
                        : 'text-amber-400 bg-amber-500/15 border-amber-500/25';

                    const strength = conv.sourceCount >= 3 ? 'Strong' : 'Moderate';
                    const strengthColor = conv.sourceCount >= 3
                        ? 'text-amber-300 bg-amber-500/20'
                        : 'text-sentinel-300 bg-sentinel-700/40';

                    return (
                        <div
                            key={`${conv.ticker}-${conv.direction}`}
                            className="bg-sentinel-900/50 rounded-lg p-3 border border-sentinel-700/40 hover:border-amber-500/20 transition-colors group"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sentinel-100 text-sm tracking-wide">
                                        ${conv.ticker}
                                    </span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${dirColor}`}>
                                        <DirIcon className="h-3 w-3" />
                                        {conv.direction.toUpperCase()}
                                    </span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${strengthColor}`}>
                                        {strength}
                                    </span>
                                </div>
                                {onScanTicker && (
                                    <button
                                        onClick={() => onScanTicker(conv.ticker)}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 transition-all cursor-pointer border border-indigo-500/20"
                                        title={`Scan ${conv.ticker}`}
                                    >
                                        <Radar className="h-3 w-3" />
                                    </button>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-sentinel-400">
                                <span>
                                    <span className="text-sentinel-300 font-medium">{conv.sourceCount}</span> sources
                                </span>
                                <span>
                                    <span className="text-sentinel-300 font-medium">{conv.signalCount}</span> signals
                                </span>
                                <span>
                                    <span className="text-sentinel-300 font-medium">{Math.round(conv.avgConfidence * 100)}%</span> avg conf
                                </span>
                            </div>

                            <div className="flex flex-wrap gap-1 mt-2">
                                {conv.signalTypes.map(type => (
                                    <span key={type} className="text-[10px] font-mono uppercase tracking-wider text-sentinel-500 bg-sentinel-800/60 px-1.5 py-0.5 rounded">
                                        {type.replace('_', ' ')}
                                    </span>
                                ))}
                            </div>

                            <div className="mt-2 text-[10px] text-sentinel-500">
                                via {conv.sources.join(', ')}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
