import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { ListPlus, Trash2, ShieldAlert, Zap } from 'lucide-react';
import { MarketDataService } from '@/services/marketData';
import { formatPrice, formatPercent } from '@/utils/formatters';

export function Watchlist() {
    const [watchlist, setWatchlist] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Realtime Market Data
    const [quotes, setQuotes] = useState<Record<string, any>>({});

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
            }
        }
        setLoading(false);
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
        fetchWatchlist(); // Optimistic update would be better here, but re-fetching ensures sync
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
                    <div className="p-12 flex justify-center"><div className="w-6 h-6 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div></div>
                ) : watchlist.length === 0 ? (
                    <div className="p-12 text-center text-sentinel-500">
                        Watchlist is empty. Add a ticker to begin scanning.
                    </div>
                ) : (
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs uppercase bg-sentinel-950/50 text-sentinel-500 border-b border-sentinel-800/50">
                            <tr>
                                <th className="px-6 py-4 font-semibold">Asset</th>
                                <th className="px-6 py-4 font-semibold">Sector</th>
                                <th className="px-6 py-4 font-semibold text-right">Last Price</th>
                                <th className="px-6 py-4 font-semibold">Status</th>
                                <th className="px-6 py-4 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-sentinel-800/50">
                            {watchlist.map(item => {
                                const quote = quotes[item.ticker];
                                const isUp = quote?.changePercent >= 0;

                                return (
                                    <tr key={item.id} className="hover:bg-sentinel-800/20 transition-colors group">
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
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => toggleActive(item.id, item.is_active)}
                                                className={`px-3 py-1 text-xs font-bold rounded-full transition-colors ${item.is_active
                                                    ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/20'
                                                    : 'bg-sentinel-800 text-sentinel-500 ring-1 ring-sentinel-700 hover:bg-sentinel-700 hover:text-sentinel-400'
                                                    }`}
                                            >
                                                {item.is_active ? 'SCANNING' : 'PAUSED'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => removeTicker(item.id)}
                                                className="p-2 text-sentinel-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
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
