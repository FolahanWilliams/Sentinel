/**
 * Sentinel — Unified Portfolio Tab
 *
 * Real-time portfolio overview: summary cards, holdings table with live prices,
 * risk metrics, sector allocation donut, and a "Log New Trade" modal.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';
import { usePortfolio } from '@/hooks/usePortfolio';
import { formatPrice, formatPercent } from '@/utils/formatters';
import { DonutChart } from '@/components/shared/DonutChart';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { EmptyState } from '@/components/shared/EmptyState';
import { SkeletonSummaryCards, SkeletonTable } from '@/components/shared/SkeletonPrimitives';
import {
    DollarSign, TrendingUp, TrendingDown, ShieldAlert, PieChart,
    Plus, X, RefreshCw, Briefcase, ArrowUpRight, ArrowDownRight, FileUp,
} from 'lucide-react';
import { ImportHLCSV } from './ImportHLCSV';
import { calcUnrealizedPnl, calcUnrealizedPnlPct, getPositionPrice, getPositionExposure, inferCurrency } from '@/utils/portfolio';
import { motion, AnimatePresence } from 'framer-motion';
import type { Quote } from '@/types/market';
import type { PortfolioSummary, SectorAllocation } from '@/types/dashboard';

interface UnifiedPortfolioViewProps {
    className?: string;
}

/** Sector colors for donut chart */
const SECTOR_COLORS: Record<string, string> = {
    Technology: '#3b82f6',
    Healthcare: '#10b981',
    Finance: '#f59e0b',
    Energy: '#ef4444',
    Consumer: '#8b5cf6',
    Industrial: '#06b6d4',
    Utilities: '#84cc16',
    Materials: '#f97316',
    'Real Estate': '#ec4899',
    Communication: '#14b8a6',
    Other: '#6b7280',
};

export function UnifiedPortfolioView({ className = '' }: UnifiedPortfolioViewProps) {
    const navigate = useNavigate();
    const { config, openPositions, closedPositions, loading: portfolioLoading } = usePortfolio();
    const [quotes, setQuotes] = useState<Record<string, Quote>>({});
    const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [showTradeModal, setShowTradeModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);

    // Fetch sector data from watchlist
    useEffect(() => {
        async function fetchSectors() {
            const { data } = await supabase
                .from('watchlist')
                .select('ticker, sector');
            if (data) {
                const map: Record<string, string> = {};
                data.forEach((w: any) => { map[w.ticker] = w.sector || 'Other'; });
                setSectorMap(map);
            }
        }
        fetchSectors();
    }, []);

    // Fetch live quotes for open positions
    const fetchQuotes = useCallback(async () => {
        if (openPositions.length === 0) return;
        const tickers = [...new Set(openPositions.map(p => p.ticker))];
        try {
            const q = await MarketDataService.getQuotesBulk(tickers);
            setQuotes(q);
        } catch (err) {
            console.warn('[UnifiedPortfolioView] Failed to fetch quotes:', err);
        }
    }, [openPositions]);

    useEffect(() => {
        fetchQuotes();
    }, [fetchQuotes]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchQuotes();
        setRefreshing(false);
    }, [fetchQuotes]);

    // Compute portfolio summary
    const summary = useMemo((): PortfolioSummary => {
        const totalCapital = config?.total_capital ?? 10000;

        // Open positions with live prices
        let totalExposure = 0;
        let unrealizedPnl = 0;

        for (const pos of openPositions) {
            const size = getPositionExposure(pos);
            totalExposure += size;

            const currentPrice = getPositionPrice(pos, quotes);
            unrealizedPnl += calcUnrealizedPnl(pos, currentPrice);
        }

        // Closed positions stats
        let realizedPnl = 0;
        let winCount = 0;
        let lossCount = 0;
        let maxDrawdown = 0;

        for (const pos of closedPositions) {
            const pnl = pos.realized_pnl ?? 0;
            realizedPnl += pnl;
            if (pnl > 0) winCount++;
            else if (pnl < 0) lossCount++;
            if (pnl < maxDrawdown) maxDrawdown = pnl;
        }

        const totalPnl = realizedPnl + unrealizedPnl;
        const totalValue = totalCapital + totalPnl;
        const totalCash = totalCapital - totalExposure;
        const closedCount = closedPositions.length;
        const winRate = closedCount > 0 ? (winCount / closedCount) * 100 : 0;

        return {
            totalValue,
            totalCash,
            totalExposure,
            exposurePct: totalCapital > 0 ? (totalExposure / totalCapital) * 100 : 0,
            unrealizedPnl,
            unrealizedPnlPct: totalExposure > 0 ? (unrealizedPnl / totalExposure) * 100 : 0,
            realizedPnl,
            realizedPnlPct: totalCapital > 0 ? (realizedPnl / totalCapital) * 100 : 0,
            totalPnl,
            totalPnlPct: totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0,
            maxDrawdown,
            winCount,
            lossCount,
            winRate,
            openPositionCount: openPositions.length,
            closedPositionCount: closedPositions.length,
            riskPct: config ? (totalExposure / totalCapital) * (config.risk_per_trade_pct / 100) * 100 : 0,
        };
    }, [config, openPositions, closedPositions, quotes]);

    // Sector allocation for donut — uses watchlist sector data
    const sectorAllocations = useMemo((): SectorAllocation[] => {
        const sectors: Record<string, number> = {};
        for (const pos of openPositions) {
            const sector = sectorMap[pos.ticker] || sectorMap[pos.ticker.replace('.L', '')] || 'Other';
            const size = pos.position_size_usd ?? ((pos.entry_price ?? 0) * (pos.shares ?? 0));
            sectors[sector] = (sectors[sector] ?? 0) + size;
        }
        return Object.entries(sectors).map(([sector, value]) => ({
            sector,
            value,
            color: SECTOR_COLORS[sector] ?? SECTOR_COLORS['Other'] ?? '#6b7280',
        }));
    }, [openPositions, sectorMap]);

    if (portfolioLoading) {
        return (
            <div className={`space-y-6 ${className}`}>
                <SkeletonSummaryCards />
                <SkeletonTable rows={5} cols={6} />
            </div>
        );
    }

    return (
        <ErrorBoundary>
            <div className={`space-y-6 ${className}`}>
                {/* Summary cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <SummaryCard
                        label="Total Value"
                        value={formatPrice(summary.totalValue)}
                        change={summary.totalPnlPct}
                        icon={<DollarSign className="w-4 h-4" />}
                    />
                    <SummaryCard
                        label="Unrealized P&L"
                        value={formatPrice(summary.unrealizedPnl)}
                        change={summary.unrealizedPnlPct}
                        icon={summary.unrealizedPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    />
                    <SummaryCard
                        label="Realized P&L"
                        value={formatPrice(summary.realizedPnl)}
                        change={summary.realizedPnlPct}
                        icon={summary.realizedPnl >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    />
                    <SummaryCard
                        label="Risk Exposure"
                        value={`${summary.exposurePct.toFixed(1)}%`}
                        subtitle={`${summary.openPositionCount} open / ${config?.max_concurrent_positions ?? 5} max`}
                        icon={<ShieldAlert className="w-4 h-4" />}
                        warning={summary.exposurePct > (config?.max_total_exposure_pct ?? 50)}
                    />
                </div>

                {/* Risk metrics + Sector chart row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Risk metrics */}
                    <div className="lg:col-span-2 glass-panel rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-sentinel-200 flex items-center gap-2">
                                <ShieldAlert className="w-4 h-4 text-sentinel-400" /> Risk Metrics
                            </h3>
                            <button
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className="p-1.5 bg-sentinel-800/50 hover:bg-sentinel-700/50 text-sentinel-400 rounded-lg transition-colors ring-1 ring-sentinel-700/50 border-none cursor-pointer"
                                aria-label="Refresh quotes"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                            </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <MetricItem label="Total Risk %" value={`${summary.riskPct.toFixed(1)}%`} />
                            <MetricItem label="Max Drawdown" value={formatPrice(Math.abs(summary.maxDrawdown))} negative />
                            <MetricItem label="Win Rate" value={`${summary.winRate.toFixed(0)}%`} />
                            <MetricItem label="Cash Available" value={formatPrice(summary.totalCash)} />
                        </div>

                        {/* Exposure bar */}
                        <div className="mt-4">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-sentinel-500 uppercase tracking-wider">Portfolio Exposure</span>
                                <span className="text-xs font-mono text-sentinel-400">{summary.exposurePct.toFixed(1)}% / {config?.max_total_exposure_pct ?? 50}%</span>
                            </div>
                            <div className="h-2 bg-sentinel-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${
                                        summary.exposurePct > (config?.max_total_exposure_pct ?? 50)
                                            ? 'bg-red-500'
                                            : summary.exposurePct > 30
                                            ? 'bg-amber-500'
                                            : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min(100, summary.exposurePct)}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Sector allocation donut */}
                    <div className="glass-panel rounded-xl p-5 flex flex-col items-center justify-center">
                        <h3 className="text-sm font-semibold text-sentinel-200 flex items-center gap-2 mb-4 self-start">
                            <PieChart className="w-4 h-4 text-sentinel-400" /> Sector Allocation
                        </h3>
                        {sectorAllocations.length > 0 ? (
                            <DonutChart
                                segments={sectorAllocations.map(s => ({ label: s.sector, value: s.value, color: s.color }))}
                                size={140}
                                thickness={18}
                                centerLabel="Sectors"
                                centerValue={`${sectorAllocations.length}`}
                            />
                        ) : (
                            <p className="text-xs text-sentinel-500 text-center py-8">No open positions</p>
                        )}
                    </div>
                </div>

                {/* Holdings table */}
                <div className="glass-panel rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-sentinel-800/50">
                        <h3 className="text-sm font-semibold text-sentinel-200 flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-sentinel-400" /> Holdings
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowImportModal(true)}
                                className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-medium transition-colors ring-1 ring-blue-500/30 flex items-center gap-1.5 border-none cursor-pointer"
                                aria-label="Import HL CSV"
                            >
                                <FileUp className="w-3.5 h-3.5" /> Import CSV
                            </button>
                            <button
                                onClick={() => setShowTradeModal(true)}
                                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-xs font-medium transition-colors ring-1 ring-emerald-500/30 flex items-center gap-1.5 border-none cursor-pointer"
                                aria-label="Log a new trade"
                            >
                                <Plus className="w-3.5 h-3.5" /> Log New Trade
                            </button>
                        </div>
                    </div>

                    {openPositions.length === 0 ? (
                        <EmptyState
                            icon={<Briefcase className="w-8 h-8 text-sentinel-400" />}
                            title="No open positions"
                            description="Log a trade or navigate to positions to get started."
                            action={
                                <button
                                    onClick={() => navigate('/positions')}
                                    className="mt-2 px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-xl text-sm font-medium transition-colors ring-1 ring-sentinel-700 border-none cursor-pointer"
                                >
                                    Go to Positions
                                </button>
                            }
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm" role="table">
                                <thead>
                                    <tr className="text-[10px] text-sentinel-500 uppercase tracking-wider border-b border-sentinel-800/30">
                                        <th className="text-left px-5 py-3 font-medium">Ticker</th>
                                        <th className="text-right px-3 py-3 font-medium">Shares</th>
                                        <th className="text-right px-3 py-3 font-medium">Avg Price</th>
                                        <th className="text-right px-3 py-3 font-medium">Current</th>
                                        <th className="text-right px-3 py-3 font-medium">P&L</th>
                                        <th className="text-right px-3 py-3 font-medium">% of Portfolio</th>
                                        <th className="text-right px-5 py-3 font-medium">Size</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {openPositions.map((pos) => {
                                        const quote = quotes[pos.ticker];
                                        const currentPrice = getPositionPrice(pos, quotes);
                                        const entryPrice = pos.entry_price ?? 0;
                                        const shares = pos.shares ?? 0;
                                        const pnl = calcUnrealizedPnl(pos, currentPrice);
                                        const pnlPct = calcUnrealizedPnlPct(pos, currentPrice);
                                        const portfolioPct = config ? ((pos.position_size_usd ?? 0) / config.total_capital) * 100 : 0;

                                        return (
                                            <tr
                                                key={pos.id}
                                                className="border-b border-sentinel-800/20 hover:bg-sentinel-800/30 transition-colors cursor-pointer"
                                                onClick={() => navigate(`/analysis/${pos.ticker}`)}
                                            >
                                                <td className="px-5 py-3">
                                                    <span className="font-mono font-bold text-sentinel-200">{pos.ticker}</span>
                                                    <span className="ml-2 text-[10px] text-sentinel-500 uppercase">{pos.side}</span>
                                                </td>
                                                <td className="text-right px-3 py-3 font-mono text-sentinel-300">{shares}</td>
                                                <td className="text-right px-3 py-3 font-mono text-sentinel-300">{formatPrice(entryPrice, pos.currency)}</td>
                                                <td className="text-right px-3 py-3 font-mono text-sentinel-200">
                                                    {formatPrice(currentPrice, pos.currency)}
                                                    {quote && (
                                                        <span className={`ml-1 text-[10px] ${quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                            {formatPercent(quote.changePercent)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className={`text-right px-3 py-3 font-mono font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {formatPrice(pnl, pos.currency)} ({formatPercent(pnlPct)})
                                                </td>
                                                <td className="text-right px-3 py-3 font-mono text-sentinel-400">{portfolioPct.toFixed(1)}%</td>
                                                <td className="text-right px-5 py-3 font-mono text-sentinel-400">{formatPrice(pos.position_size_usd ?? 0, pos.currency)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Log Trade Modal */}
                <AnimatePresence>
                    {showTradeModal && (
                        <LogTradeModal onClose={() => setShowTradeModal(false)} />
                    )}
                    {showImportModal && (
                        <ImportHLCSV
                            onClose={() => setShowImportModal(false)}
                            existingTickers={openPositions.map(p => p.ticker)}
                            existingPositions={openPositions}
                        />
                    )}
                </AnimatePresence>
            </div>
        </ErrorBoundary>
    );
}

/** Summary card sub-component */
function SummaryCard({ label, value, change, subtitle, icon, warning }: {
    label: string;
    value: string;
    change?: number;
    subtitle?: string;
    icon: React.ReactNode;
    warning?: boolean;
}) {
    return (
        <div className={`glass-panel rounded-xl p-4 ${warning ? 'ring-1 ring-red-500/30' : ''}`}>
            <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-sentinel-500 uppercase tracking-wider font-medium">{label}</span>
                <span className={`${warning ? 'text-red-400' : 'text-sentinel-500'}`}>{icon}</span>
            </div>
            <div className="text-xl font-bold font-mono text-sentinel-100">{value}</div>
            {change != null && (
                <span className={`text-xs font-mono ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {formatPercent(change)}
                </span>
            )}
            {subtitle && (
                <span className="text-[10px] text-sentinel-500 block mt-0.5">{subtitle}</span>
            )}
        </div>
    );
}

/** Risk metric item */
function MetricItem({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
    return (
        <div>
            <span className="text-[10px] text-sentinel-500 uppercase tracking-wider">{label}</span>
            <div className={`text-sm font-bold font-mono ${negative ? 'text-red-400' : 'text-sentinel-200'}`}>{value}</div>
        </div>
    );
}

/** Log Trade Modal */
function LogTradeModal({ onClose }: { onClose: () => void }) {
    const [ticker, setTicker] = useState('');
    const [side, setSide] = useState<'long' | 'short'>('long');
    const [entryPrice, setEntryPrice] = useState('');
    const [shares, setShares] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!ticker || !entryPrice || !shares) return;
        setSaving(true);

        try {
            const entry = parseFloat(entryPrice);
            const shareCount = parseInt(shares, 10);

            await supabase.from('positions').insert({
                ticker: ticker.toUpperCase(),
                side,
                entry_price: entry,
                shares: shareCount,
                position_size_usd: entry * shareCount,
                currency: inferCurrency(ticker.toUpperCase()),
                status: 'open',
                notes: notes || null,
                opened_at: new Date().toISOString(),
            });

            onClose();
        } catch (err) {
            console.error('[LogTradeModal] Save failed:', err);
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
                className="bg-sentinel-900 border border-sentinel-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Log new trade"
            >
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold text-sentinel-100">Log New Trade</h3>
                    <button onClick={onClose} className="text-sentinel-500 hover:text-sentinel-300 bg-transparent border-none cursor-pointer" aria-label="Close modal">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-ticker">Ticker</label>
                        <input
                            id="trade-ticker"
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())}
                            placeholder="AAPL"
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                        />
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-side">Side</label>
                            <select
                                id="trade-side"
                                value={side}
                                onChange={(e) => setSide(e.target.value as 'long' | 'short')}
                                className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none"
                            >
                                <option value="long">Long (Buy)</option>
                                <option value="short">Short (Sell)</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-shares">Shares</label>
                            <input
                                id="trade-shares"
                                type="number"
                                value={shares}
                                onChange={(e) => setShares(e.target.value)}
                                placeholder="10"
                                className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-price">Entry Price</label>
                        <input
                            id="trade-price"
                            type="number"
                            step="0.01"
                            value={entryPrice}
                            onChange={(e) => setEntryPrice(e.target.value)}
                            placeholder="150.00"
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-notes">Notes (optional)</label>
                        <textarea
                            id="trade-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Trade rationale..."
                            rows={2}
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 resize-none"
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={!ticker || !entryPrice || !shares || saving}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
                    >
                        {saving ? 'Saving...' : 'Save Trade'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
