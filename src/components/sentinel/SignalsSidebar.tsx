import { useMemo } from 'react';
import type { ProcessedArticle, TradingSignal } from '@/types/sentinel';
import { Target, TrendingUp, TrendingDown, Activity } from 'lucide-react';

interface SignalsSidebarProps {
    articles: ProcessedArticle[];
}

export function SignalsSidebar({ articles }: SignalsSidebarProps) {

    // Aggregate and sort signals from all visible articles
    const aggregatedSignals = useMemo(() => {
        const allSignals: (TradingSignal & { sourceTitle: string, sourceLink: string, pubDate: Date })[] = [];

        articles.forEach(article => {
            if (!article.signals || article.signals.length === 0) return;

            article.signals.forEach(signal => {
                // Only include signals that have a definitive ticker
                if (signal.ticker) {
                    allSignals.push({
                        ...signal,
                        sourceTitle: article.title,
                        sourceLink: article.link,
                        pubDate: new Date(article.pub_date)
                    });
                }
            });
        });

        // Group by Ticker to show consensus
        const grouped = allSignals.reduce((acc, curr) => {
            const t = curr.ticker!.toUpperCase();
            if (!acc[t]) acc[t] = [];
            acc[t].push(curr);
            return acc;
        }, {} as Record<string, typeof allSignals>);

        // Sort tickers by number of signals, then latest signal date
        return Object.entries(grouped)
            .sort((a, b) => {
                if (b[1].length !== a[1].length) return b[1].length - a[1].length;
                const bTime = b[1][0]?.pubDate?.getTime() || 0;
                const aTime = a[1][0]?.pubDate?.getTime() || 0;
                return bTime - aTime;
            });

    }, [articles]);

    if (aggregatedSignals.length === 0) {
        return (
            <div className="bg-sentinel-800/40 border border-sentinel-700/50 rounded-xl p-4 sticky top-0">
                <div className="flex items-center text-sentinel-400 mb-4">
                    <Target className="h-4 w-4 mr-2" />
                    <h3 className="font-semibold">Extracted Signals</h3>
                </div>
                <p className="text-sm text-sentinel-500 text-center py-8">
                    No active trading signals detected in the current feed view.
                </p>
            </div>
        );
    }

    return (
        <div className="bg-sentinel-800/40 border border-sentinel-700/50 rounded-xl p-4 sticky top-0 overflow-y-auto max-h-[calc(100vh-14rem)] custom-scrollbar">
            <div className="flex items-center justify-between mb-4 border-b border-sentinel-700/50 pb-3">
                <div className="flex items-center text-sentinel-100">
                    <Target className="h-4 w-4 mr-2 text-amber-400" />
                    <h3 className="font-semibold">Live Signals</h3>
                </div>
                <span className="text-xs font-mono text-sentinel-400 bg-sentinel-900/50 px-2.5 py-1 rounded-lg border border-sentinel-700/30">
                    {aggregatedSignals.length} Tickers
                </span>
            </div>

            <div className="space-y-4">
                {aggregatedSignals.map(([ticker, signals]) => {
                    // Calculate consensus direction
                    const ups = signals.filter(s => s.direction === 'up').length;
                    const downs = signals.filter(s => s.direction === 'down').length;

                    let ConsensusIcon = Activity;
                    let consensusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/20';

                    if (ups > downs) {
                        ConsensusIcon = TrendingUp;
                        consensusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                    } else if (downs > ups) {
                        ConsensusIcon = TrendingDown;
                        consensusColor = 'text-red-400 bg-red-500/10 border-red-500/20';
                    }

                    // Average confidence
                    const avgConf = signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length;

                    return (
                        <div key={ticker} className="bg-sentinel-900/40 rounded-lg p-3 border border-sentinel-700/40 group hover:border-sentinel-600 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sentinel-100 tracking-wide">${ticker}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${consensusColor} flex items-center`}>
                                        <ConsensusIcon className="h-3 w-3 mr-1" />
                                        {signals.length} {signals.length === 1 ? 'Signal' : 'Signals'}
                                    </span>
                                </div>
                                <span className="text-[10px] font-mono text-sentinel-500 block text-right">
                                    {Math.round(avgConf * 100)}% API Conf
                                </span>
                            </div>

                            {/* Signal Details */}
                            <div className="space-y-2 mt-3 pl-1 border-l-2 border-sentinel-700/50">
                                {signals.map((signal, idx) => (
                                    <div key={idx} className="pl-2">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-sentinel-400">
                                                {signal.type.replace('_', ' ')}
                                            </span>
                                            <span className={`h-1.5 w-1.5 rounded-full ${signal.direction === 'up' ? 'bg-emerald-500' :
                                                signal.direction === 'down' ? 'bg-red-500' : 'bg-amber-500'
                                                }`} />
                                        </div>
                                        <p className="text-xs text-sentinel-300 leading-tight">
                                            {signal.note}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
