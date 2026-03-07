/**
 * CorrelationDashboard — Visualizes pairwise price correlations between
 * watchlist tickers using the PriceCorrelationMatrix service.
 */

import { useState, useCallback } from 'react';
import { GitBranch, RefreshCw, AlertTriangle } from 'lucide-react';
import { PriceCorrelationMatrix } from '@/services/priceCorrelationMatrix';
import { useWatchlistStore } from '@/stores/watchlistStore';

interface CorrelationPair {
    tickerA: string;
    tickerB: string;
    correlation: number;
}

export function CorrelationDashboard() {
    const { tickers } = useWatchlistStore();
    const [pairs, setPairs] = useState<CorrelationPair[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    const activeTickers = tickers.filter(t => t.is_active).map(t => t.ticker);

    const fetchCorrelations = useCallback(async () => {
        if (activeTickers.length < 2) return;
        setLoading(true);
        try {
            const matrix = await PriceCorrelationMatrix.buildMatrix(activeTickers);
            const results: CorrelationPair[] = [];
            const seen = new Set<string>();

            for (const [a, row] of matrix) {
                for (const [b, corr] of row) {
                    if (a === b) continue;
                    const key = [a, b].sort().join(':');
                    if (seen.has(key)) continue;
                    seen.add(key);
                    results.push({ tickerA: a, tickerB: b, correlation: corr });
                }
            }

            results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
            setPairs(results);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('[CorrelationDashboard] Failed to build matrix:', err);
        } finally {
            setLoading(false);
        }
    }, [activeTickers.join(',')]);

    const getCorrelationColor = (corr: number): string => {
        const abs = Math.abs(corr);
        if (abs >= 0.8) return corr > 0 ? 'text-red-400' : 'text-blue-400';
        if (abs >= 0.5) return corr > 0 ? 'text-amber-400' : 'text-cyan-400';
        return 'text-sentinel-500';
    };

    const getCorrelationBg = (corr: number): string => {
        const abs = Math.abs(corr);
        if (abs >= 0.8) return corr > 0 ? 'bg-red-500/10' : 'bg-blue-500/10';
        if (abs >= 0.5) return corr > 0 ? 'bg-amber-500/10' : 'bg-cyan-500/10';
        return 'bg-sentinel-900/30';
    };

    const getCorrelationLabel = (corr: number): string => {
        const abs = Math.abs(corr);
        if (abs >= 0.9) return 'Very Strong';
        if (abs >= 0.7) return 'Strong';
        if (abs >= 0.5) return 'Moderate';
        if (abs >= 0.3) return 'Weak';
        return 'Negligible';
    };

    const highRiskPairs = pairs.filter(p => Math.abs(p.correlation) >= 0.8);

    return (
        <div className="glass-panel p-6 rounded-xl space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <GitBranch className="w-5 h-5 text-purple-400" />
                    <h3 className="text-lg font-semibold text-sentinel-100">Price Correlations</h3>
                </div>
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-xs text-sentinel-500">
                            Updated {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={fetchCorrelations}
                        disabled={loading || activeTickers.length < 2}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-300 rounded-lg text-xs font-medium transition-colors border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Building...' : 'Analyze'}
                    </button>
                </div>
            </div>

            {activeTickers.length < 2 ? (
                <p className="text-sm text-sentinel-500 text-center py-8">
                    Add at least 2 tickers to your watchlist to analyze correlations.
                </p>
            ) : pairs.length === 0 && !loading ? (
                <p className="text-sm text-sentinel-500 text-center py-8">
                    Click "Analyze" to build the correlation matrix from 1-month historical prices.
                </p>
            ) : (
                <>
                    {highRiskPairs.length > 0 && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs font-medium text-red-400">Concentration Risk</p>
                                <p className="text-xs text-sentinel-400 mt-0.5">
                                    {highRiskPairs.length} pair{highRiskPairs.length !== 1 ? 's' : ''} with correlation above 0.80 — these tickers move together and increase portfolio risk.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-2 max-h-80 overflow-y-auto">
                        {pairs.slice(0, 20).map(({ tickerA, tickerB, correlation }) => (
                            <div
                                key={`${tickerA}-${tickerB}`}
                                className={`flex items-center justify-between p-3 rounded-lg ${getCorrelationBg(correlation)}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-sentinel-200">{tickerA}</span>
                                    <span className="text-xs text-sentinel-600">↔</span>
                                    <span className="text-sm font-medium text-sentinel-200">{tickerB}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-sentinel-500">
                                        {getCorrelationLabel(correlation)}
                                    </span>
                                    <span className={`text-sm font-mono font-bold ${getCorrelationColor(correlation)}`}>
                                        {correlation >= 0 ? '+' : ''}{correlation.toFixed(3)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-wrap gap-3 text-[10px] text-sentinel-500 pt-2 border-t border-sentinel-800/50">
                        <span><span className="inline-block w-2 h-2 rounded-full bg-red-400 mr-1" />Strong positive (move together)</span>
                        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />Strong negative (move opposite)</span>
                        <span><span className="inline-block w-2 h-2 rounded-full bg-sentinel-600 mr-1" />Weak / no correlation</span>
                    </div>
                </>
            )}
        </div>
    );
}
