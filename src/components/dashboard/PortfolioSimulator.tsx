/**
 * PortfolioSimulator — Phase 6
 *
 * Reads from the positions table to show real P&L simulation.
 * Displays: open positions, total exposure, unrealized P&L,
 * sector concentration, and risk metrics.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';
import { Briefcase, Loader2, RefreshCw } from 'lucide-react';

interface Position {
    id: string;
    signal_id: string | null;
    ticker: string;
    status: string;
    side: string;
    entry_price: number | null;
    exit_price: number | null;
    shares: number | null;
    position_size_usd: number | null;
    position_pct: number | null;
    realized_pnl: number | null;
    realized_pnl_pct: number | null;
    opened_at: string | null;
    closed_at: string | null;
    close_reason: string | null;
    notes: string | null;
}

interface LiveQuote {
    price: number;
    changePercent: number;
}

export function PortfolioSimulator() {
    const [positions, setPositions] = useState<Position[]>([]);
    const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [portfolioConfig, setPortfolioConfig] = useState<{ total_capital: number }>({ total_capital: 10000 });

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const [{ data: posData }, { data: configData }] = await Promise.all([
                supabase.from('positions').select('*').order('opened_at', { ascending: false }),
                supabase.from('portfolio_config').select('total_capital').limit(1).maybeSingle(),
            ]);

            if (posData) setPositions(posData as Position[]);
            if (configData) setPortfolioConfig(configData as any);

            // Fetch live quotes for open positions
            const openTickers = (posData || [])
                .filter((p: any) => p.status === 'open')
                .map((p: any) => p.ticker);

            const uniqueTickers = [...new Set(openTickers)];
            const quoteMap: Record<string, LiveQuote> = {};
            await Promise.allSettled(
                uniqueTickers.map(async (ticker) => {
                    try {
                        const q = await MarketDataService.getQuote(ticker);
                        if (q?.price) quoteMap[ticker] = { price: q.price, changePercent: q.changePercent || 0 };
                    } catch { /* ignore */ }
                })
            );
            setQuotes(quoteMap);
        } catch (err) {
            console.error('[PortfolioSimulator] Failed to load:', err);
        }
        setLoading(false);
    }

    async function handleRefresh() {
        setRefreshing(true);
        await fetchData();
        setRefreshing(false);
    }

    const openPositions = useMemo(() => positions.filter(p => p.status === 'open'), [positions]);
    const closedPositions = useMemo(() => positions.filter(p => p.status === 'closed'), [positions]);

    const stats = useMemo(() => {
        const capital = portfolioConfig.total_capital;

        // Open position metrics
        let totalExposure = 0;
        let unrealizedPnl = 0;
        const sectorExposure: Record<string, number> = {};

        for (const pos of openPositions) {
            const size = pos.position_size_usd || 0;
            totalExposure += size;

            const quote = quotes[pos.ticker];
            if (quote && pos.entry_price && pos.shares) {
                const currentValue = quote.price * pos.shares;
                const entryValue = pos.entry_price * pos.shares;
                const pnl = pos.side === 'long' ? currentValue - entryValue : entryValue - currentValue;
                unrealizedPnl += pnl;
            }

            // Approximate sector from ticker (simplified — in production would use watchlist sector)
            const sector = 'mixed';
            sectorExposure[sector] = (sectorExposure[sector] || 0) + size;
        }

        // Closed position metrics
        let totalRealizedPnl = 0;
        let wins = 0;
        let losses = 0;
        for (const pos of closedPositions) {
            const pnl = pos.realized_pnl || 0;
            totalRealizedPnl += pnl;
            if (pnl > 0) wins++;
            else if (pnl < 0) losses++;
        }

        const exposurePct = capital > 0 ? (totalExposure / capital) * 100 : 0;
        const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

        return {
            capital,
            totalExposure,
            exposurePct,
            unrealizedPnl,
            totalRealizedPnl,
            openCount: openPositions.length,
            closedCount: closedPositions.length,
            winRate,
            wins,
            losses,
        };
    }, [openPositions, closedPositions, quotes, portfolioConfig]);

    if (loading) {
        return (
            <div className="glass-panel p-5">
                <div className="flex items-center gap-2 text-sentinel-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading portfolio...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-sentinel-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Briefcase className="w-5 h-5 text-blue-400" />
                    <div>
                        <h2 className="text-sm font-semibold text-sentinel-200 uppercase tracking-wider">Portfolio Simulator</h2>
                        <p className="text-xs text-sentinel-500 mt-0.5">{stats.openCount} open / {stats.closedCount} closed</p>
                    </div>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="p-2 bg-sentinel-800/50 hover:bg-sentinel-700/50 rounded-lg transition-colors cursor-pointer border border-sentinel-700/30"
                    title="Refresh quotes"
                >
                    <RefreshCw className={`w-3.5 h-3.5 text-sentinel-400 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-5 border-b border-sentinel-800/30">
                <div>
                    <p className="text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Capital</p>
                    <p className="text-sm font-bold text-sentinel-100 font-mono">${stats.capital.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Exposure</p>
                    <p className={`text-sm font-bold font-mono ${stats.exposurePct > 50 ? 'text-amber-400' : 'text-sentinel-200'}`}>
                        {stats.exposurePct.toFixed(1)}%
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Unrealized P&L</p>
                    <p className={`text-sm font-bold font-mono ${stats.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {stats.unrealizedPnl >= 0 ? '+' : ''}{stats.unrealizedPnl.toFixed(2)}
                    </p>
                </div>
                <div>
                    <p className="text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Win Rate</p>
                    <p className={`text-sm font-bold font-mono ${stats.winRate >= 50 ? 'text-emerald-400' : stats.winRate > 0 ? 'text-amber-400' : 'text-sentinel-500'}`}>
                        {stats.winRate.toFixed(0)}% ({stats.wins}W/{stats.losses}L)
                    </p>
                </div>
            </div>

            {/* Open Positions */}
            <div className="p-5">
                {openPositions.length === 0 ? (
                    <p className="text-sm text-sentinel-500 text-center py-4">No open positions</p>
                ) : (
                    <div className="space-y-2">
                        {openPositions.map(pos => {
                            const quote = quotes[pos.ticker];
                            let unrealizedPnl = 0;
                            let unrealizedPct = 0;
                            if (quote && pos.entry_price && pos.shares) {
                                const currentValue = quote.price * pos.shares;
                                const entryValue = pos.entry_price * pos.shares;
                                unrealizedPnl = pos.side === 'long' ? currentValue - entryValue : entryValue - currentValue;
                                unrealizedPct = pos.entry_price > 0 ? (unrealizedPnl / entryValue) * 100 : 0;
                            }

                            return (
                                <div key={pos.id} className="flex items-center justify-between p-3 rounded-lg bg-sentinel-900/40 border border-sentinel-800/40">
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold text-sentinel-100 text-sm font-mono">{pos.ticker}</span>
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                            pos.side === 'long' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                        }`}>
                                            {pos.side.toUpperCase()}
                                        </span>
                                        {pos.shares && <span className="text-[10px] text-sentinel-500 font-mono">{pos.shares} sh</span>}
                                    </div>
                                    <div className="flex items-center gap-4 text-xs font-mono">
                                        <span className="text-sentinel-500">
                                            ${pos.entry_price?.toFixed(2)} → {quote ? `$${quote.price.toFixed(2)}` : '...'}
                                        </span>
                                        <span className={unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                            {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)} ({unrealizedPct >= 0 ? '+' : ''}{unrealizedPct.toFixed(1)}%)
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Realized P&L Summary */}
                {closedPositions.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-sentinel-800/30">
                        <div className="flex items-center justify-between">
                            <span className="text-xs text-sentinel-500">Total Realized P&L</span>
                            <span className={`text-sm font-bold font-mono ${stats.totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {stats.totalRealizedPnl >= 0 ? '+' : ''}${stats.totalRealizedPnl.toFixed(2)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
