import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { ListPlus, Trash2, ShieldAlert, Zap, ArrowRight, Activity, TrendingUp, TrendingDown } from 'lucide-react';
import { MarketDataService } from '@/services/marketData';
import { TechnicalAnalysisService } from '@/services/technicalAnalysis';
import { computeStrategySignals, type StrategySignal } from '@/hooks/useStrategySignals';
import { formatPrice, formatPercent } from '@/utils/formatters';
import { SkeletonTable } from '@/components/shared/SkeletonPrimitives';
import { EmptyState } from '@/components/shared/EmptyState';

/** Cached strategy signal per ticker */
interface TickerStrategySignal {
    signal: StrategySignal;
    loading: boolean;
}

export function Watchlist() {
    const [watchlist, setWatchlist] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Realtime Market Data
    const [quotes, setQuotes] = useState<Record<string, any>>({});

    // Phase 3: Strategy signals per ticker
    const [strategySignals, setStrategySignals] = useState<Record<string, TickerStrategySignal>>({});

    // Form State
    const [ticker, setTicker] = useState('');
    const [sector, setSector] = useState('');

    useEffect(() => {
        fetchWatchlist();
    }, []);

    async function fetchWatchlist() {
        setLoading(true);
        const { data } = await supabase
            .from('watchlist')
            .select('*')
            .order('added_at', { ascending: false });

        if (data) {
            setWatchlist(data);
            // Fetch quotes for the active tickers
            const activeTickers = data.filter(w => w.is_active).map(w => w.ticker);
            if (activeTickers.length > 0) {
                try {
                    const bulkQuotes = await MarketDataService.getQuotesBulk(activeTickers);
                    setQuotes(bulkQuotes);
                } catch (e) {
                    console.warn('Market data fetch failed on watchlist load', e);
                }

                // Phase 3: Fetch strategy signals for active tickers (async, non-blocking)
                fetchStrategySignals(activeTickers);
            }
        }
        setLoading(false);
    }

    async function fetchStrategySignals(tickers: string[]) {
        // Mark all as loading
        const loadingState: Record<string, TickerStrategySignal> = {};
        tickers.forEach(t => {
            loadingState[t] = { signal: null as unknown as StrategySignal, loading: true };
        });
        setStrategySignals(prev => ({ ...prev, ...loadingState }));

        // Fetch in parallel (max 5 concurrent to avoid overwhelming API)
        const batchSize = 5;
        for (let i = 0; i < tickers.length; i += batchSize) {
            const batch = tickers.slice(i, i + batchSize);
            await Promise.allSettled(
                batch.map(async (t) => {
                    try {
                        const bars = await TechnicalAnalysisService.fetchHistoricalBars(t);
                        if (bars.length < 201) {
                            setStrategySignals(prev => ({
                                ...prev,
                                [t]: { signal: null as unknown as StrategySignal, loading: false },
                            }));
                            return;
                        }
                        const signals = computeStrategySignals(bars);
                        const latest = signals.length > 0 ? signals[signals.length - 1]! : null;
                        setStrategySignals(prev => ({
                            ...prev,
                            [t]: { signal: latest as StrategySignal, loading: false },
                        }));
                    } catch {
                        setStrategySignals(prev => ({
                            ...prev,
                            [t]: { signal: null as unknown as StrategySignal, loading: false },
                        }));
                    }
                })
            );
        }
    }

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!ticker.trim()) return;

        await supabase.from('watchlist').insert({
            ticker: ticker.toUpperCase(),
            company_name: ticker.toUpperCase(),
            sector: sector || 'General',
        });

        setTicker('');
        setSector('');
        fetchWatchlist();
    }

    async function toggleActive(id: string, currentStatus: boolean) {
        await supabase.from('watchlist').update({ is_active: !currentStatus }).eq('id', id);
        fetchWatchlist();
    }

    async function removeTicker(id: string) {
        if (confirm("Stop tracking this ticker?")) {
            await supabase.from('watchlist').delete().eq('id', id);
            fetchWatchlist();
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <Zap className="w-8 h-8 text-yellow-400" /> Scanner Watchlist
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Tickers the AI currently monitors for severe market anomalies.
                    </p>
                </div>

                <form onSubmit={handleAdd} className="flex gap-2">
                    <input
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        placeholder="Ticker (e.g. NVDA)"
                        className="bg-sentinel-900 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100 uppercase w-32 focus:ring-1 focus:ring-sentinel-500 outline-none"
                        required
                    />
                    <input
                        type="text"
                        value={sector}
                        onChange={(e) => setSector(e.target.value)}
                        placeholder="Sector (Optional)"
                        className="bg-sentinel-900 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100 w-40 focus:ring-1 focus:ring-sentinel-500 outline-none"
                    />
                    <button type="submit" className="px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg transition-colors ring-1 ring-sentinel-700 flex items-center gap-2">
                        <ListPlus className="w-4 h-4" /> Add
                    </button>
                </form>
            </div>

            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm">
                {loading ? (
                    <SkeletonTable rows={5} cols={6} />
                ) : watchlist.length === 0 ? (
                    <EmptyState
                        icon={<Zap className="w-8 h-8 text-yellow-400" />}
                        title="Your watchlist is empty"
                        description="Add tickers to start monitoring them for market anomalies with AI-powered analysis."
                        action={
                            <button
                                onClick={() => document.querySelector<HTMLInputElement>('input[placeholder*="Ticker"]')?.focus()}
                                className="mt-2 px-5 py-2.5 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-xl text-sm font-medium transition-colors ring-1 ring-sentinel-700 hover:ring-sentinel-600 flex items-center gap-2"
                            >
                                <ListPlus className="w-4 h-4 text-yellow-400" /> Add your first ticker
                            </button>
                        }
                    />
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs uppercase bg-sentinel-950/50 text-sentinel-500 border-b border-sentinel-800/50">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Asset</th>
                                <th className="px-6 py-4 font-semibold">Sector</th>
                                <th className="px-6 py-4 font-semibold text-right">Last Price</th>
                                <th className="px-6 py-4 font-semibold">Strategy Signal</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-sentinel-800/50">
                            {watchlist.map(item => {
                                const quote = quotes[item.ticker];
                                const isUp = quote?.changePercent >= 0;
                                const strat = strategySignals[item.ticker];

                                return (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-sentinel-800/20 transition-colors group cursor-pointer"
                                        onClick={() => navigate(`/analysis/${item.ticker}`)}
                                        draggable
                                        onDragStart={(e) => {
                                            e.dataTransfer.setData('application/json', JSON.stringify({
                                                type: 'ticker',
                                                payload: item.ticker
                                            }));
                                            e.dataTransfer.effectAllowed = 'copyLink';
                                        }}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <span className="font-bold text-sentinel-100">{item.ticker}</span>
                                                {quote?.priority_level > 7 && <div title="High Volatility Alert"><ShieldAlert className="w-4 h-4 text-rose-500" /></div>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sentinel-400">{item.sector}</td>
                                        <td className="px-6 py-4 text-right font-mono">
                                            {quote ? (
                                                <div>
                                                    <div className="text-sentinel-200">{formatPrice(quote.price)}</div>
                                                    <div className={`text-xs ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {isUp ? '+' : ''}{formatPercent(quote.changePercent)}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-sentinel-600">--</span>
                                            )}
                                        </td>
                                        {/* Phase 3: Strategy Signal column */}
                                        <td className="px-6 py-4">
                                            {strat?.loading ? (
                                                <span className="text-[11px] text-sentinel-500 animate-pulse">Loading...</span>
                                            ) : strat?.signal ? (
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        strat.signal.direction === 'long'
                                                            ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                                                            : 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                                                    }`}>
                                                        {strat.signal.direction === 'long' ? (
                                                            <TrendingUp className="w-3 h-3" />
                                                        ) : (
                                                            <TrendingDown className="w-3 h-3" />
                                                        )}
                                                        {strat.signal.direction === 'long' ? 'BUY' : 'SELL'}
                                                    </span>
                                                    <span className={`text-[10px] font-mono ${
                                                        strat.signal.confluenceLevel === 'strong' ? 'text-emerald-400' :
                                                        strat.signal.confluenceLevel === 'moderate' ? 'text-blue-400' : 'text-sentinel-500'
                                                    }`}>
                                                        {strat.signal.confluence}%
                                                    </span>
                                                    <span className="text-[10px] text-sentinel-600">{strat.signal.date}</span>
                                                </div>
                                            ) : (
                                                <span className="text-[11px] text-sentinel-600">—</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleActive(item.id, item.is_active); }}
                                                className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${item.is_active
                                                    ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20'
                                                    : 'bg-sentinel-800 text-sentinel-500 ring-1 ring-sentinel-700 hover:bg-sentinel-700 hover:text-sentinel-400'
                                                    }`}
                                            >
                                                {item.is_active ? 'SCANNING' : 'PAUSED'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); removeTicker(item.id); }}
                                                    className="p-2 text-sentinel-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                                <ArrowRight className="w-4 h-4 text-sentinel-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
