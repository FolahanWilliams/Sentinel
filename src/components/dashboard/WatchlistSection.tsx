/**
 * Sentinel — Watchlist Tab
 *
 * Displays the user's watchlist with live prices, one-click add from signals,
 * and quick navigation to full analysis.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';
import { useWatchlistStore } from '@/stores/watchlistStore';
import { formatPrice, formatPercent } from '@/utils/formatters';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonTable } from '@/components/shared/SkeletonPrimitives';
import {
    Eye, Plus, Trash2, RefreshCw, Search, TrendingUp, TrendingDown, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Quote } from '@/types/market';

interface WatchlistSectionProps {
    className?: string;
}

export function WatchlistSection({ className = '' }: WatchlistSectionProps) {
    const navigate = useNavigate();
    const { tickers, loading: storeLoading, setTickers, addTicker, removeTicker, setLoading } = useWatchlistStore();
    const [quotes, setQuotes] = useState<Record<string, Quote>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch watchlist from Supabase
    useEffect(() => {
        async function fetchWatchlist() {
            setLoading(true);
            const { data, error } = await supabase
                .from('watchlist')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (!error && data) {
                setTickers(data);
            }
            setLoading(false);
        }
        fetchWatchlist();
    }, [setTickers, setLoading]);

    // Fetch live quotes
    const fetchQuotes = useCallback(async () => {
        if (tickers.length === 0) return;
        const tickerSymbols = tickers.map(t => t.ticker);
        try {
            const q = await MarketDataService.getQuotesBulk(tickerSymbols);
            setQuotes(q);
        } catch (err) {
            console.warn('[WatchlistSection] Failed to fetch quotes:', err);
        }
    }, [tickers]);

    useEffect(() => {
        fetchQuotes();
    }, [fetchQuotes]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchQuotes();
        setRefreshing(false);
    }, [fetchQuotes]);

    const handleRemove = async (id: string) => {
        const { error } = await supabase.from('watchlist').update({ is_active: false }).eq('id', id);
        if (error) {
            console.error('[WatchlistSection] Failed to remove ticker:', error);
            return;
        }
        removeTicker(id);
    };

    // Filter by search
    const filteredTickers = searchQuery
        ? tickers.filter(t =>
            t.ticker.toLowerCase().includes(searchQuery.toLowerCase()) ||
            t.company_name.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : tickers;

    if (storeLoading) {
        return <SkeletonTable rows={6} cols={5} />;
    }

    return (
        <ErrorBoundary>
            <div className={className}>
                {/* Controls */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <button
                        onClick={() => setShowAddModal(true)}
                        className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors ring-1 ring-emerald-500/30 flex items-center gap-2 border-none cursor-pointer"
                        aria-label="Add ticker to watchlist"
                    >
                        <Plus className="w-4 h-4" /> Add Ticker
                    </button>

                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2 bg-sentinel-800/50 hover:bg-sentinel-700/50 text-sentinel-400 rounded-lg transition-colors ring-1 ring-sentinel-700/50 border-none cursor-pointer"
                        aria-label="Refresh watchlist prices"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>

                    {/* Search */}
                    <div className="flex items-center gap-2 bg-sentinel-800/50 rounded-lg px-3 py-1.5 ring-1 ring-sentinel-700/50 ml-auto">
                        <Search className="w-4 h-4 text-sentinel-500" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search watchlist..."
                            className="bg-transparent text-sentinel-200 text-sm outline-none border-none w-32 placeholder-sentinel-600"
                            aria-label="Search watchlist"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="text-sentinel-500 hover:text-sentinel-300 bg-transparent border-none cursor-pointer" aria-label="Clear search">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    <span className="text-xs text-sentinel-500 font-mono">
                        {filteredTickers.length} tickers
                    </span>
                </div>

                {/* Watchlist grid */}
                {filteredTickers.length === 0 ? (
                    <EmptyState
                        icon={<Eye className="w-8 h-8 text-sentinel-400" />}
                        title={tickers.length === 0 ? 'Watchlist empty' : 'No matches'}
                        description={tickers.length === 0
                            ? 'Add tickers to track their price and signals.'
                            : 'Try a different search term.'
                        }
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        <AnimatePresence>
                            {filteredTickers.map((item, idx) => {
                                const quote = quotes[item.ticker];

                                return (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.2, delay: idx * 0.02 }}
                                        className="glass-panel rounded-xl p-4 hover:ring-1 hover:ring-sentinel-600/40 transition-all cursor-pointer group"
                                        onClick={() => navigate(`/analysis/${item.ticker}`)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`View analysis for ${item.ticker}`}
                                        onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/analysis/${item.ticker}`); }}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold font-mono text-sentinel-100">{item.ticker}</span>
                                                    {item.sector && (
                                                        <span className="text-[10px] text-sentinel-500 bg-sentinel-800/50 px-1.5 py-0.5 rounded">{item.sector}</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-sentinel-500 mt-0.5 line-clamp-1">{item.company_name}</p>
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemove(item.id);
                                                }}
                                                className="p-1 text-sentinel-600 hover:text-red-400 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label={`Remove ${item.ticker} from watchlist`}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        {quote ? (
                                            <div className="mt-3 flex items-end justify-between">
                                                <div>
                                                    <span className="text-lg font-bold font-mono text-sentinel-100">{formatPrice(quote.price)}</span>
                                                    <span className={`ml-2 text-xs font-mono ${quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {formatPercent(quote.changePercent)}
                                                    </span>
                                                </div>
                                                <div className={`${quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {quote.changePercent >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="mt-3 h-7 skeleton-shimmer rounded" />
                                        )}

                                        {item.notes && (
                                            <p className="mt-2 text-[10px] text-sentinel-600 line-clamp-1 italic">{item.notes}</p>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}

                {/* Add Ticker Modal */}
                <AnimatePresence>
                    {showAddModal && (
                        <AddTickerModal
                            onClose={() => setShowAddModal(false)}
                            onAdd={(item) => {
                                addTicker(item);
                                setShowAddModal(false);
                            }}
                        />
                    )}
                </AnimatePresence>
            </div>
        </ErrorBoundary>
    );
}

/** Add ticker modal */
function AddTickerModal({ onClose, onAdd }: {
    onClose: () => void;
    onAdd: (item: { id: string; ticker: string; company_name: string; sector: string; is_active: boolean; notes: string | null }) => void;
}) {
    const [ticker, setTicker] = useState('');
    const [companyName, setCompanyName] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!ticker) return;
        setSaving(true);

        try {
            const { data, error } = await supabase.from('watchlist').insert({
                ticker: ticker.toUpperCase(),
                company_name: companyName || ticker.toUpperCase(),
                sector: '',
                is_active: true,
                notes: notes || null,
            }).select().single();

            if (!error && data) {
                onAdd(data);
            }
        } catch (err) {
            console.error('[AddTickerModal] Save failed:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-sentinel-900 border border-sentinel-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Add ticker to watchlist"
            >
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold text-sentinel-100">Add to Watchlist</h3>
                    <button onClick={onClose} className="text-sentinel-500 hover:text-sentinel-300 bg-transparent border-none cursor-pointer" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="wl-ticker">Ticker</label>
                        <input
                            id="wl-ticker"
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())}
                            placeholder="AAPL"
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="wl-name">Company Name (optional)</label>
                        <input
                            id="wl-name"
                            type="text"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Apple Inc."
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="wl-notes">Notes (optional)</label>
                        <input
                            id="wl-notes"
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Watching for earnings dip..."
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600"
                        />
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={!ticker || saving}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
                    >
                        {saving ? 'Adding...' : 'Add to Watchlist'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
