/**
 * Positions — Live Portfolio & Risk Management Page
 *
 * Tracks active trades with live price polling, P&L calculation,
 * stop-loss breach detection, and position sizing metrics.
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';
import { PostMortemService } from '@/services/postMortemService';
import {
    Briefcase, Plus, X, TrendingUp, TrendingDown,
    AlertTriangle, DollarSign,
    Loader2, BarChart3, ArrowUpRight, ArrowDownRight,
    CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SkeletonTable } from '@/components/shared/SkeletonPrimitives';
import { EmptyState } from '@/components/shared/EmptyState';

interface Position {
    id: string;
    ticker: string;
    side: string;
    shares: number | null;
    entry_price: number | null;
    exit_price: number | null;
    position_size_usd: number | null;
    position_pct: number | null;
    status: string;
    opened_at: string | null;
    closed_at: string | null;
    realized_pnl: number | null;
    realized_pnl_pct: number | null;
    close_reason: string | null;
    notes: string | null;
    signal_id: string | null;
}

interface LiveQuote {
    price: number;
    changePercent: number;
}

export function Positions() {
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showCloseModal, setShowCloseModal] = useState<string | null>(null);
    const [liveQuotes, setLiveQuotes] = useState<Record<string, LiveQuote>>({});
    const [quotesLoading, setQuotesLoading] = useState(false);
    const [generatingPostMortem, setGeneratingPostMortem] = useState<string | null>(null);
    const [expandedNotes, setExpandedNotes] = useState<string | null>(null);

    // Form state
    const [formTicker, setFormTicker] = useState('');
    const [formSide, setFormSide] = useState<'long' | 'short'>('long');
    const [formShares, setFormShares] = useState('');
    const [formEntryPrice, setFormEntryPrice] = useState('');
    const [formNotes, setFormNotes] = useState('');

    // Close form state
    const [closePrice, setClosePrice] = useState('');
    const [closeReason, setCloseReason] = useState('manual');

    const fetchPositions = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('positions')
            .select('*')
            .order('opened_at', { ascending: false });

        if (!error && data) {
            setPositions(data as Position[]);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchPositions(); }, [fetchPositions]);

    // Get unique open tickers for live polling
    const openTickers = useMemo(() => {
        return [...new Set(
            positions
                .filter(p => p.status === 'open')
                .map(p => p.ticker)
        )];
    }, [positions]);

    // Poll live quotes for open positions
    const fetchQuotes = useCallback(async () => {
        if (openTickers.length === 0) return;
        setQuotesLoading(true);
        const newQuotes: Record<string, LiveQuote> = {};

        await Promise.all(
            openTickers.map(async (ticker) => {
                try {
                    const quote = await MarketDataService.getQuote(ticker);
                    newQuotes[ticker] = { price: quote.price, changePercent: quote.changePercent };
                } catch {
                    // Keep previous quote if fetch fails
                }
            })
        );

        setLiveQuotes(prev => ({ ...prev, ...newQuotes }));
        setQuotesLoading(false);
    }, [openTickers]);

    // Initial + periodic polling (60s)
    useEffect(() => {
        fetchQuotes();
        const interval = setInterval(fetchQuotes, 60_000);
        return () => clearInterval(interval);
    }, [fetchQuotes]);

    // Calculate live P&L for a position
    const calcPnL = useCallback((pos: Position) => {
        const livePrice = liveQuotes[pos.ticker]?.price;
        if (!livePrice || !pos.entry_price || !pos.shares) return null;

        const multiplier = pos.side === 'short' ? -1 : 1;
        const pnlUsd = (livePrice - pos.entry_price) * pos.shares * multiplier;
        const pnlPct = ((livePrice - pos.entry_price) / pos.entry_price) * 100 * multiplier;
        return { pnlUsd, pnlPct, livePrice };
    }, [liveQuotes]);

    // Summary stats
    const summaryStats = useMemo(() => {
        const openPositions = positions.filter(p => p.status === 'open');
        let totalPnl = 0;
        let winnersCount = 0;
        let losersCount = 0;
        let biggestWin = 0;
        let biggestLoss = 0;

        openPositions.forEach(pos => {
            const pnl = calcPnL(pos);
            if (pnl) {
                totalPnl += pnl.pnlUsd;
                if (pnl.pnlUsd >= 0) { winnersCount++; biggestWin = Math.max(biggestWin, pnl.pnlUsd); }
                else { losersCount++; biggestLoss = Math.min(biggestLoss, pnl.pnlUsd); }
            }
        });

        // Include realized P&L from closed positions
        const closedPnl = positions
            .filter(p => p.status === 'closed' && p.realized_pnl)
            .reduce((sum, p) => sum + (p.realized_pnl || 0), 0);

        return { totalPnl, closedPnl, openCount: openPositions.length, winnersCount, losersCount, biggestWin, biggestLoss };
    }, [positions, calcPnL]);

    async function handleAddPosition(e: React.FormEvent) {
        e.preventDefault();
        const ticker = formTicker.trim().toUpperCase();
        if (!ticker) return;

        const entryPrice = parseFloat(formEntryPrice) || 0;
        const shares = parseFloat(formShares) || 0;

        const { error } = await supabase.from('positions').insert({
            ticker,
            side: formSide,
            shares,
            entry_price: entryPrice,
            position_size_usd: entryPrice * shares,
            status: 'open',
            opened_at: new Date().toISOString(),
            notes: formNotes || null
        } as any);

        if (!error) {
            setShowForm(false);
            setFormTicker(''); setFormShares(''); setFormEntryPrice('');
            setFormNotes('');
            fetchPositions();
        }
    }

    async function handleClosePosition() {
        if (!showCloseModal) return;
        const exitPrice = parseFloat(closePrice);
        if (!exitPrice) return;

        const pos = positions.find(p => p.id === showCloseModal);
        if (!pos || !pos.entry_price || !pos.shares) return;

        const multiplier = pos.side === 'short' ? -1 : 1;
        const realizedPnl = (exitPrice - pos.entry_price) * pos.shares * multiplier;
        const realizedPnlPct = ((exitPrice - pos.entry_price) / pos.entry_price) * 100 * multiplier;

        const { error } = await supabase.from('positions')
            .update({
                status: 'closed',
                exit_price: exitPrice,
                closed_at: new Date().toISOString(),
                realized_pnl: realizedPnl,
                realized_pnl_pct: realizedPnlPct,
                close_reason: closeReason
            } as any)
            .eq('id', showCloseModal);

        if (!error) {
            setShowCloseModal(null);
            setClosePrice('');
            setCloseReason('manual');
            fetchPositions();

            // Fire-and-forget AI post-mortem generation
            setGeneratingPostMortem(pos.id);
            PostMortemService.generateAndSave(pos.id, {
                ticker: pos.ticker,
                side: pos.side,
                entry_price: pos.entry_price,
                exit_price: exitPrice,
                shares: pos.shares,
                realized_pnl: realizedPnl,
                realized_pnl_pct: realizedPnlPct,
                opened_at: pos.opened_at || new Date().toISOString(),
                closed_at: new Date().toISOString(),
                close_reason: closeReason,
                original_notes: pos.notes || undefined,
            }).finally(() => {
                setGeneratingPostMortem(null);
                fetchPositions(); // Refresh to show generated notes
            });
        }
    }

    const openPositions = positions.filter(p => p.status === 'open');
    const closedPositions = positions.filter(p => p.status === 'closed');

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <Briefcase className="w-8 h-8 text-emerald-400" /> Portfolio
                    </h1>
                    <p className="text-sentinel-400 mt-1">Live position tracking with real-time P&L</p>
                </div>
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer border-none shadow-lg shadow-emerald-500/20"
                >
                    <Plus className="w-4 h-4" /> New Position
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <motion.div
                    className="glass-panel p-4 rounded-xl"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                >
                    <div className="flex items-center gap-2 text-sentinel-400 text-xs uppercase tracking-wider mb-2">
                        <DollarSign className="w-3.5 h-3.5" /> Unrealized P&L
                    </div>
                    <p className={`text-2xl font-bold font-mono ${summaryStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {summaryStats.totalPnl >= 0 ? '+' : ''}{summaryStats.totalPnl.toFixed(2)}
                    </p>
                </motion.div>
                <motion.div
                    className="glass-panel p-4 rounded-xl"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                >
                    <div className="flex items-center gap-2 text-sentinel-400 text-xs uppercase tracking-wider mb-2">
                        <BarChart3 className="w-3.5 h-3.5" /> Open Positions
                    </div>
                    <p className="text-2xl font-bold font-mono text-sentinel-100">{summaryStats.openCount}</p>
                </motion.div>
                <motion.div
                    className="glass-panel p-4 rounded-xl"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                >
                    <div className="flex items-center gap-2 text-sentinel-400 text-xs uppercase tracking-wider mb-2">
                        <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" /> Best Position
                    </div>
                    <p className="text-2xl font-bold font-mono text-emerald-400">
                        {summaryStats.biggestWin > 0 ? `+$${summaryStats.biggestWin.toFixed(0)}` : '—'}
                    </p>
                </motion.div>
                <motion.div
                    className="glass-panel p-4 rounded-xl"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.15 }}
                    whileHover={{ y: -2, transition: { duration: 0.2 } }}
                >
                    <div className="flex items-center gap-2 text-sentinel-400 text-xs uppercase tracking-wider mb-2">
                        <ArrowDownRight className="w-3.5 h-3.5 text-red-400" /> Worst Position
                    </div>
                    <p className="text-2xl font-bold font-mono text-red-400">
                        {summaryStats.biggestLoss < 0 ? `-$${Math.abs(summaryStats.biggestLoss).toFixed(0)}` : '—'}
                    </p>
                </motion.div>
            </div>

            {/* Open Positions Table */}
            <motion.div
                className="glass-panel rounded-xl overflow-hidden"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
            >
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-sentinel-200 uppercase tracking-wider">Open Positions</h2>
                    {quotesLoading && <Loader2 className="w-4 h-4 text-sentinel-500 animate-spin" />}
                </div>

                {loading ? (
                    <div className="p-6">
                        <SkeletonTable rows={4} cols={7} />
                    </div>
                ) : openPositions.length === 0 ? (
                    <EmptyState
                        icon={<Briefcase className="w-8 h-8 text-blue-400" />}
                        title="No open positions"
                        description='Click "New Position" to log a trade and start tracking P&L.'
                        action={
                            <button
                                onClick={() => setShowForm(true)}
                                className="mt-2 px-5 py-2.5 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-xl text-sm font-medium transition-colors ring-1 ring-sentinel-700 hover:ring-sentinel-600 flex items-center gap-2 cursor-pointer border-none"
                            >
                                <Plus className="w-4 h-4 text-emerald-400" /> New Position
                            </button>
                        }
                    />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-sentinel-400 text-xs uppercase tracking-wider border-b border-white/5">
                                    <th className="px-5 py-3 text-left">Ticker</th>
                                    <th className="px-5 py-3 text-left">Side</th>
                                    <th className="px-5 py-3 text-right">Shares</th>
                                    <th className="px-5 py-3 text-right">Entry</th>
                                    <th className="px-5 py-3 text-right">Current</th>
                                    <th className="px-5 py-3 text-right">P&L ($)</th>
                                    <th className="px-5 py-3 text-right">P&L (%)</th>
                                    <th className="px-5 py-3 text-center">Status</th>
                                    <th className="px-5 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {openPositions.map(pos => {
                                    const pnl = calcPnL(pos);
                                    const isProfit = pnl ? pnl.pnlUsd >= 0 : true;

                                    return (
                                        <tr key={pos.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="px-5 py-3">
                                                <span className="font-mono font-bold text-sentinel-100">{pos.ticker}</span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${pos.side === 'long' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                                    {pos.side === 'long' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                    {pos.side.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right font-mono text-sentinel-200">{pos.shares}</td>
                                            <td className="px-5 py-3 text-right font-mono text-sentinel-200">${pos.entry_price?.toFixed(2)}</td>
                                            <td className="px-5 py-3 text-right font-mono text-sentinel-200">
                                                {pnl ? `$${pnl.livePrice.toFixed(2)}` : <Loader2 className="w-3 h-3 animate-spin inline" />}
                                            </td>
                                            <td className={`px-5 py-3 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {pnl ? `${isProfit ? '+' : ''}$${pnl.pnlUsd.toFixed(2)}` : '—'}
                                            </td>
                                            <td className={`px-5 py-3 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {pnl ? `${isProfit ? '+' : ''}${pnl.pnlPct.toFixed(2)}%` : '—'}
                                            </td>
                                            <td className="px-5 py-3 text-center">
                                                {pnl && pnl.pnlPct < -5 ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-red-500/15 text-red-400 animate-pulse">
                                                        <AlertTriangle className="w-3 h-3" /> RISK
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400">
                                                        <CheckCircle2 className="w-3 h-3" /> OK
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 text-right">
                                                <button
                                                    onClick={() => setShowCloseModal(pos.id)}
                                                    className="px-3 py-1.5 bg-sentinel-800 hover:bg-red-500/20 hover:text-red-400 text-sentinel-300 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-sentinel-700 hover:border-red-500/30"
                                                >
                                                    Close
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>

            {/* Closed Positions */}
            {
                closedPositions.length > 0 && (
                    <motion.div
                        className="glass-panel rounded-xl overflow-hidden mt-6"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.3 }}
                    >
                        <div className="px-5 py-4 border-b border-white/5">
                            <h2 className="text-sm font-semibold text-sentinel-200 uppercase tracking-wider">Closed Positions</h2>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-sentinel-400 text-xs uppercase tracking-wider border-b border-sentinel-800/30">
                                        <th className="px-5 py-3 text-left">Ticker</th>
                                        <th className="px-5 py-3 text-left">Side</th>
                                        <th className="px-5 py-3 text-right">Entry</th>
                                        <th className="px-5 py-3 text-right">Exit</th>
                                        <th className="px-5 py-3 text-right">P&L</th>
                                        <th className="px-5 py-3 text-right">Return</th>
                                        <th className="px-5 py-3 text-left">Reason</th>
                                        <th className="px-5 py-3 text-left">Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {closedPositions.slice(0, 10).map(pos => {
                                        const isProfit = (pos.realized_pnl || 0) >= 0;
                                        return (
                                            <Fragment key={pos.id}>
                                                <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                                    <td className="px-5 py-3 font-mono font-bold text-sentinel-300">{pos.ticker}</td>
                                                    <td className="px-5 py-3 text-xs text-sentinel-400">{pos.side?.toUpperCase()}</td>
                                                    <td className="px-5 py-3 text-right font-mono text-sentinel-400">${pos.entry_price?.toFixed(2)}</td>
                                                    <td className="px-5 py-3 text-right font-mono text-sentinel-400">${pos.exit_price?.toFixed(2)}</td>
                                                    <td className={`px-5 py-3 text-right font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {isProfit ? '+' : ''}${(pos.realized_pnl || 0).toFixed(2)}
                                                    </td>
                                                    <td className={`px-5 py-3 text-right font-mono ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {isProfit ? '+' : ''}{(pos.realized_pnl_pct || 0).toFixed(2)}%
                                                    </td>
                                                    <td className="px-5 py-3 text-xs text-sentinel-500">{pos.close_reason || '—'}</td>
                                                    <td className="px-5 py-3">
                                                        {generatingPostMortem === pos.id ? (
                                                            <span className="inline-flex items-center gap-1 text-xs text-purple-400 animate-pulse">
                                                                <Loader2 className="w-3 h-3 animate-spin" /> Generating...
                                                            </span>
                                                        ) : pos.notes ? (
                                                            <button
                                                                onClick={() => setExpandedNotes(expandedNotes === pos.id ? null : pos.id)}
                                                                className="text-xs text-blue-400 hover:text-blue-300 transition-colors cursor-pointer border-none bg-transparent underline"
                                                            >
                                                                {expandedNotes === pos.id ? 'Hide' : 'View'}
                                                            </button>
                                                        ) : (
                                                            <span className="text-xs text-sentinel-600">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                                {expandedNotes === pos.id && pos.notes && (
                                                    <tr>
                                                        <td colSpan={8} className="px-5 py-3 bg-white/5">
                                                            <p className="text-xs text-sentinel-300 leading-relaxed whitespace-pre-wrap max-w-2xl">{pos.notes}</p>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </motion.div>
                )
            }

            {/* Add Position Modal */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowForm(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/10 p-6 w-full max-w-md shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-lg font-bold text-sentinel-100">New Position</h3>
                                <button onClick={() => setShowForm(false)} className="text-sentinel-400 hover:text-sentinel-200 cursor-pointer border-none bg-transparent">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleAddPosition} className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-sentinel-400 mb-1">Ticker</label>
                                        <input
                                            value={formTicker}
                                            onChange={e => setFormTicker(e.target.value)}
                                            placeholder="AAPL"
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-sentinel-100 placeholder-sentinel-600 outline-none focus:border-blue-500/50 transition-colors"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-sentinel-400 mb-1">Side</label>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setFormSide('long')}
                                                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${formSide === 'long' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-white/5 border-white/10 text-sentinel-400'}`}
                                            >
                                                LONG
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFormSide('short')}
                                                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${formSide === 'short' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-white/5 border-white/10 text-sentinel-400'}`}
                                            >
                                                SHORT
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs text-sentinel-400 mb-1">Shares</label>
                                        <input
                                            value={formShares}
                                            onChange={e => setFormShares(e.target.value)}
                                            placeholder="100"
                                            type="number"
                                            step="any"
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-sentinel-100 placeholder-sentinel-600 outline-none focus:border-blue-500/50 transition-colors"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-sentinel-400 mb-1">Entry Price</label>
                                        <input
                                            value={formEntryPrice}
                                            onChange={e => setFormEntryPrice(e.target.value)}
                                            placeholder="150.00"
                                            type="number"
                                            step="any"
                                            className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-sentinel-100 placeholder-sentinel-600 outline-none focus:border-blue-500/50 transition-colors"
                                            required
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Notes (optional)</label>
                                    <textarea
                                        value={formNotes}
                                        onChange={e => setFormNotes(e.target.value)}
                                        placeholder="Trade thesis, setup notes..."
                                        rows={2}
                                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-sentinel-100 placeholder-sentinel-600 outline-none focus:border-blue-500/50 resize-none transition-colors"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer border-none"
                                >
                                    Open Position
                                </button>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Close Position Modal */}
            <AnimatePresence>
                {showCloseModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowCloseModal(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-black/60 backdrop-blur-2xl rounded-2xl border border-white/10 p-6 w-full max-w-sm shadow-2xl"
                            onClick={e => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold text-sentinel-100 mb-4">Close Position</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Exit Price</label>
                                    <input
                                        value={closePrice}
                                        onChange={e => setClosePrice(e.target.value)}
                                        placeholder="155.00"
                                        type="number"
                                        step="any"
                                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-mono text-sentinel-100 placeholder-sentinel-600 outline-none focus:border-blue-500/50 transition-colors"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Reason</label>
                                    <select
                                        value={closeReason}
                                        onChange={e => setCloseReason(e.target.value)}
                                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-sentinel-100 outline-none transition-colors"
                                    >
                                        <option value="manual">Manual Close</option>
                                        <option value="target_hit">Hit Target</option>
                                        <option value="stop_loss">Stop Loss</option>
                                        <option value="thesis_broken">Thesis Broken</option>
                                    </select>
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowCloseModal(null)}
                                        className="flex-1 py-2.5 bg-sentinel-800 text-sentinel-300 rounded-xl text-sm font-medium transition-colors cursor-pointer border border-sentinel-700"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleClosePosition}
                                        className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer border-none"
                                    >
                                        Close Trade
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
}
