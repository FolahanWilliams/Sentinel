/**
 * EarningsCalendar — Upcoming Earnings for Watchlist & Portfolio Tickers
 *
 * Uses the EarningsGuard service (Gemini grounded search) to check
 * upcoming earnings dates for all watched and held tickers.
 * Helps users manage risk around earnings events.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatchlist } from '@/hooks/useWatchlist';
import { usePortfolio } from '@/hooks/usePortfolio';
import { EarningsGuard, EarningsGuardResult } from '@/services/earningsGuard';
import {
    Calendar, Loader2, AlertTriangle, Clock,
    TrendingUp, Shield, Briefcase, List,
    CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/EmptyState';

// ─── Types ───

interface EarningsEntry {
    ticker: string;
    companyName: string;
    source: 'watchlist' | 'portfolio' | 'both';
    result: EarningsGuardResult | null;
    loading: boolean;
    error: string | null;
}

type FilterView = 'all' | 'upcoming' | 'imminent' | 'clear';

// ─── Component ───

export function EarningsCalendar() {
    const { tickers: watchlistTickers, loading: wlLoading } = useWatchlist();
    const { openPositions, loading: portLoading } = usePortfolio();
    const navigate = useNavigate();
    const [entries, setEntries] = useState<EarningsEntry[]>([]);
    const [checking, setChecking] = useState(false);
    const [checkedCount, setCheckedCount] = useState(0);
    const [filter, setFilter] = useState<FilterView>('all');

    // Build unique ticker list from watchlist + positions
    const allTickers = useMemo(() => {
        const tickerMap = new Map<string, { companyName: string; source: EarningsEntry['source'] }>();

        for (const w of watchlistTickers) {
            if (w.is_active) {
                tickerMap.set(w.ticker, { companyName: w.company_name, source: 'watchlist' });
            }
        }

        for (const p of openPositions) {
            const existing = tickerMap.get(p.ticker);
            if (existing) {
                tickerMap.set(p.ticker, { ...existing, source: 'both' });
            } else {
                tickerMap.set(p.ticker, { companyName: p.ticker, source: 'portfolio' });
            }
        }

        return Array.from(tickerMap.entries()).map(([ticker, info]) => ({
            ticker,
            ...info,
        }));
    }, [watchlistTickers, openPositions]);

    // Check earnings for all tickers
    const checkAllEarnings = useCallback(async () => {
        if (allTickers.length === 0) return;

        setChecking(true);
        setCheckedCount(0);

        // Initialize entries
        const initial: EarningsEntry[] = allTickers.map(t => ({
            ticker: t.ticker,
            companyName: t.companyName,
            source: t.source,
            result: null,
            loading: true,
            error: null,
        }));
        setEntries(initial);

        // Check in batches of 3 to respect rate limits
        const batchSize = 3;
        const results = [...initial];

        for (let i = 0; i < allTickers.length; i += batchSize) {
            const batch = allTickers.slice(i, i + batchSize);
            const batchResults = await Promise.allSettled(
                batch.map(t => EarningsGuard.check(t.ticker))
            );

            batchResults.forEach((res, j) => {
                const idx = i + j;
                if (res.status === 'fulfilled') {
                    results[idx] = { ...results[idx], result: res.value, loading: false };
                } else {
                    results[idx] = { ...results[idx], error: 'Failed to check', loading: false };
                }
            });

            setEntries([...results]);
            setCheckedCount(Math.min(i + batchSize, allTickers.length));

            // Small delay between batches
            if (i + batchSize < allTickers.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }

        setChecking(false);
    }, [allTickers]);

    // Auto-check on mount when data is ready
    useEffect(() => {
        if (!wlLoading && !portLoading && allTickers.length > 0 && entries.length === 0) {
            checkAllEarnings();
        }
    }, [wlLoading, portLoading, allTickers.length, entries.length, checkAllEarnings]);

    // Filter entries
    const filteredEntries = useMemo(() => {
        return entries.filter(e => {
            if (filter === 'all') return true;
            if (!e.result) return filter === 'all';
            if (filter === 'upcoming') return e.result.hasUpcomingEarnings;
            if (filter === 'imminent') return e.result.hasUpcomingEarnings && (e.result.daysUntilEarnings ?? 999) <= 7;
            if (filter === 'clear') return !e.result.hasUpcomingEarnings;
            return true;
        });
    }, [entries, filter]);

    // Stats
    const totalChecked = entries.filter(e => !e.loading).length;
    const withEarnings = entries.filter(e => e.result?.hasUpcomingEarnings).length;
    const imminent = entries.filter(e => e.result?.hasUpcomingEarnings && (e.result.daysUntilEarnings ?? 999) <= 7).length;
    const blocked = entries.filter(e => e.result?.shouldBlock).length;

    const isLoading = wlLoading || portLoading;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 text-sentinel-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-center flex-wrap gap-4">
                <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                    <Calendar className="w-8 h-8 text-purple-400" />
                    Earnings Calendar
                </h1>
                <button
                    onClick={checkAllEarnings}
                    disabled={checking}
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 text-purple-400 rounded-xl text-sm font-medium hover:bg-purple-500/20 transition-colors cursor-pointer border border-purple-500/20 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
                    {checking ? `Checking ${checkedCount}/${allTickers.length}...` : 'Refresh All'}
                </button>
            </div>

            {allTickers.length === 0 ? (
                <EmptyState
                    icon={<Calendar className="w-10 h-10" />}
                    title="No tickers to check"
                    description="Add tickers to your watchlist or open positions to check their upcoming earnings dates."
                    action={{ label: 'Go to Watchlist', onClick: () => navigate('/watchlist') }}
                />
            ) : (
                <>
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Tickers Checked', value: `${totalChecked}/${allTickers.length}`, icon: CheckCircle2, color: 'text-blue-400' },
                            { label: 'Upcoming Earnings', value: withEarnings, icon: Calendar, color: 'text-purple-400' },
                            { label: 'Within 7 Days', value: imminent, icon: AlertTriangle, color: 'text-amber-400' },
                            { label: 'Blocked (≤2 Days)', value: blocked, icon: XCircle, color: 'text-red-400' },
                        ].map(({ label, value, icon: Icon, color }) => (
                            <div key={label} className="glass-panel p-4 rounded-xl">
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon className={`w-4 h-4 ${color}`} />
                                    <span className="text-xs text-sentinel-400">{label}</span>
                                </div>
                                <span className="text-2xl font-bold text-sentinel-100">{value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center gap-2">
                        {([
                            { key: 'all' as const, label: 'All', count: entries.length },
                            { key: 'upcoming' as const, label: 'Upcoming', count: withEarnings },
                            { key: 'imminent' as const, label: 'Imminent', count: imminent },
                            { key: 'clear' as const, label: 'Clear', count: entries.length - withEarnings },
                        ]).map(({ key, label, count }) => (
                            <button
                                key={key}
                                onClick={() => setFilter(key)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer border-none ${
                                    filter === key
                                        ? 'bg-blue-500/20 text-blue-400'
                                        : 'bg-sentinel-800/50 text-sentinel-400 hover:text-sentinel-200'
                                }`}
                            >
                                {label} ({count})
                            </button>
                        ))}
                    </div>

                    {/* Earnings List */}
                    <div className="space-y-2">
                        {filteredEntries.map((entry, idx) => (
                            <motion.div
                                key={entry.ticker}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.02 }}
                                onClick={() => navigate(`/analysis/${entry.ticker}`)}
                                className="glass-panel p-4 rounded-xl flex items-center justify-between gap-4 cursor-pointer hover:bg-sentinel-800/30 transition-colors"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    {/* Status Icon */}
                                    <div className={`p-2 rounded-lg shrink-0 ${
                                        entry.loading ? 'bg-sentinel-800/50' :
                                        entry.result?.shouldBlock ? 'bg-red-500/10' :
                                        entry.result?.hasUpcomingEarnings ? 'bg-amber-500/10' :
                                        'bg-emerald-500/10'
                                    }`}>
                                        {entry.loading ? (
                                            <Loader2 className="w-5 h-5 text-sentinel-400 animate-spin" />
                                        ) : entry.result?.shouldBlock ? (
                                            <XCircle className="w-5 h-5 text-red-400" />
                                        ) : entry.result?.hasUpcomingEarnings ? (
                                            <AlertTriangle className="w-5 h-5 text-amber-400" />
                                        ) : (
                                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                                        )}
                                    </div>

                                    {/* Ticker Info */}
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-sentinel-100">{entry.ticker}</span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                entry.source === 'portfolio' || entry.source === 'both'
                                                    ? 'bg-blue-500/10 text-blue-400'
                                                    : 'bg-sentinel-800/50 text-sentinel-400'
                                            }`}>
                                                {entry.source === 'both' ? (
                                                    <span className="flex items-center gap-1">
                                                        <Briefcase className="w-3 h-3" />
                                                        <List className="w-3 h-3" />
                                                    </span>
                                                ) : entry.source === 'portfolio' ? (
                                                    <Briefcase className="w-3 h-3" />
                                                ) : (
                                                    <List className="w-3 h-3" />
                                                )}
                                            </span>
                                            {entry.companyName !== entry.ticker && (
                                                <span className="text-xs text-sentinel-500 truncate">{entry.companyName}</span>
                                            )}
                                        </div>
                                        {entry.result && (
                                            <p className="text-xs text-sentinel-400 mt-0.5 truncate">
                                                {entry.result.reason}
                                            </p>
                                        )}
                                        {entry.error && (
                                            <p className="text-xs text-red-400/70 mt-0.5">{entry.error}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Right side: days until & penalty */}
                                <div className="flex items-center gap-4 shrink-0">
                                    {entry.result?.hasUpcomingEarnings && (
                                        <>
                                            <div className="text-right">
                                                <span className={`text-lg font-bold ${
                                                    (entry.result.daysUntilEarnings ?? 999) <= 2 ? 'text-red-400' :
                                                    (entry.result.daysUntilEarnings ?? 999) <= 7 ? 'text-amber-400' :
                                                    'text-sentinel-200'
                                                }`}>
                                                    {entry.result.daysUntilEarnings ?? '?'}d
                                                </span>
                                                <p className="text-xs text-sentinel-500">
                                                    {entry.result.earningsDate ?? 'unknown'}
                                                </p>
                                            </div>
                                            {entry.result.confidencePenalty < 0 && (
                                                <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                                                    entry.result.shouldBlock
                                                        ? 'bg-red-500/10 text-red-400'
                                                        : 'bg-amber-500/10 text-amber-400'
                                                }`}>
                                                    {entry.result.shouldBlock ? 'BLOCKED' : `${entry.result.confidencePenalty}`}
                                                </span>
                                            )}
                                        </>
                                    )}
                                    {entry.result && !entry.result.hasUpcomingEarnings && (
                                        <span className="text-xs text-emerald-400/70">Clear</span>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-6 text-xs text-sentinel-500 px-2">
                        <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /> Blocked (≤2 days)</span>
                        <span className="flex items-center gap-1"><AlertTriangle className="w-3 h-3 text-amber-400" /> Upcoming earnings</span>
                        <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> No earnings soon</span>
                        <span className="flex items-center gap-1"><Briefcase className="w-3 h-3 text-blue-400" /> In portfolio</span>
                        <span className="flex items-center gap-1"><List className="w-3 h-3 text-sentinel-400" /> In watchlist</span>
                    </div>
                </>
            )}
        </div>
    );
}
