/**
 * RiskDashboard — Unified Risk Overview
 *
 * Shows portfolio heat, max drawdown scenarios, sector concentration,
 * correlation risk, and position-level risk metrics in one view.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { usePortfolio } from '@/hooks/usePortfolio';
import { MarketDataService } from '@/services/marketData';
import {
    Shield, AlertTriangle, TrendingDown, PieChart,
    Activity, Loader2, Flame, Target,
    ArrowDownRight, ArrowUpRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { EmptyState } from '@/components/shared/EmptyState';

// ─── Types ───

interface PositionRisk {
    ticker: string;
    side: string;
    entryPrice: number;
    currentPrice: number;
    positionSizeUsd: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
    riskContribution: number; // % of total capital at risk
    sector: string;
}

interface SectorExposure {
    sector: string;
    exposure: number;
    pct: number;
    positions: number;
    color: string;
}

const SECTOR_COLORS: Record<string, string> = {
    Technology: '#3B82F6',
    Healthcare: '#10B981',
    Finance: '#F59E0B',
    Energy: '#EF4444',
    Consumer: '#8B5CF6',
    Industrial: '#EC4899',
    'Real Estate': '#06B6D4',
    Utilities: '#84CC16',
    Materials: '#F97316',
    Communications: '#6366F1',
    Other: '#6B7280',
};

// ─── Component ───

export function RiskDashboard() {
    const { config, openPositions, closedPositions, loading: portfolioLoading } = usePortfolio();
    const navigate = useNavigate();
    const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
    const [liveQuotes, setLiveQuotes] = useState<Record<string, number>>({});
    const [loadingQuotes, setLoadingQuotes] = useState(false);

    const totalCapital = config?.total_capital ?? 10000;
    const maxExposurePct = config?.max_total_exposure_pct ?? 50;
    const maxSectorPct = config?.max_sector_exposure_pct ?? 25;

    // Fetch sector data from watchlist
    useEffect(() => {
        async function fetchSectors() {
            const { data } = await supabase.from('watchlist').select('ticker, sector');
            if (data) {
                const map: Record<string, string> = {};
                data.forEach(w => { map[w.ticker] = w.sector || 'Other'; });
                setSectorMap(map);
            }
        }
        fetchSectors();
    }, []);

    // Fetch live quotes for open positions
    // Depend on ticker list string (not array ref) to avoid re-fetching on every render
    const tickerList = useMemo(
        () => [...new Set(openPositions.map(p => p.ticker))].sort().join(','),
        [openPositions]
    );

    useEffect(() => {
        if (!tickerList) return;
        let cancelled = false;
        setLoadingQuotes(true);
        const tickers = tickerList.split(',');
        Promise.all(
            tickers.map(async t => {
                try {
                    const q = await MarketDataService.getQuote(t);
                    return { ticker: t, price: q?.price ?? 0 };
                } catch {
                    return { ticker: t, price: 0 };
                }
            })
        ).then(results => {
            if (cancelled) return;
            const quotes: Record<string, number> = {};
            results.forEach(r => { if (r.price > 0) quotes[r.ticker] = r.price; });
            setLiveQuotes(quotes);
            setLoadingQuotes(false);
        });
        return () => { cancelled = true; };
    }, [tickerList]);

    // Calculate position-level risk
    const positionRisks: PositionRisk[] = useMemo(() => {
        return openPositions.map(p => {
            const entry = p.entry_price ?? 0;
            const current = liveQuotes[p.ticker] ?? entry;
            const sizeUsd = p.position_size_usd ?? (entry * (p.shares ?? 0));
            const isShort = p.side === 'short';
            const pnlPct = entry > 0 ? ((current - entry) / entry) * (isShort ? -1 : 1) : 0;
            const pnl = sizeUsd * pnlPct;

            return {
                ticker: p.ticker,
                side: p.side || 'long',
                entryPrice: entry,
                currentPrice: current,
                positionSizeUsd: sizeUsd,
                unrealizedPnl: pnl,
                unrealizedPnlPct: pnlPct * 100,
                riskContribution: totalCapital > 0 ? (sizeUsd / totalCapital) * 100 : 0,
                sector: sectorMap[p.ticker] || 'Other',
            };
        }).sort((a, b) => a.unrealizedPnlPct - b.unrealizedPnlPct);
    }, [openPositions, liveQuotes, sectorMap, totalCapital]);

    // Sector exposure breakdown
    const sectorExposures: SectorExposure[] = useMemo(() => {
        const map = new Map<string, { exposure: number; count: number }>();
        positionRisks.forEach(p => {
            const cur = map.get(p.sector) || { exposure: 0, count: 0 };
            cur.exposure += p.positionSizeUsd;
            cur.count += 1;
            map.set(p.sector, cur);
        });
        return Array.from(map.entries())
            .map(([sector, { exposure, count }]) => ({
                sector,
                exposure,
                pct: totalCapital > 0 ? (exposure / totalCapital) * 100 : 0,
                positions: count,
                color: SECTOR_COLORS[sector] ?? '#6B7280',
            }))
            .sort((a, b) => b.pct - a.pct);
    }, [positionRisks, totalCapital]);

    // Aggregate risk metrics
    const totalExposure = positionRisks.reduce((s, p) => s + p.positionSizeUsd, 0);
    const totalExposurePct = totalCapital > 0 ? (totalExposure / totalCapital) * 100 : 0;
    const totalUnrealizedPnl = positionRisks.reduce((s, p) => s + p.unrealizedPnl, 0);
    const worstPosition = positionRisks[0] ?? null;
    const maxSectorConcentration = sectorExposures[0]?.pct ?? 0;

    // Win rate from closed positions
    const wins = closedPositions.filter(p => (p.realized_pnl ?? 0) > 0).length;
    const winRate = closedPositions.length > 0 ? (wins / closedPositions.length) * 100 : 0;

    // Drawdown scenarios
    const drawdownScenarios = useMemo(() => {
        if (positionRisks.length === 0) return [];
        return [
            { label: '5% market drop', pct: 5, estimated: totalExposure * 0.05 },
            { label: '10% market drop', pct: 10, estimated: totalExposure * 0.10 },
            { label: '20% market crash', pct: 20, estimated: totalExposure * 0.20 },
        ];
    }, [totalExposure, positionRisks.length]);

    // Risk score: 0-100 (higher = more risk)
    const riskScore = useMemo(() => {
        let score = 0;
        // Exposure level
        score += Math.min(30, (totalExposurePct / maxExposurePct) * 30);
        // Sector concentration
        score += Math.min(25, (maxSectorConcentration / maxSectorPct) * 25);
        // Position count
        score += Math.min(15, (openPositions.length / (config?.max_concurrent_positions ?? 5)) * 15);
        // Unrealized losses
        if (totalUnrealizedPnl < 0) {
            score += Math.min(20, (Math.abs(totalUnrealizedPnl) / totalCapital) * 200);
        }
        // Win rate penalty
        if (closedPositions.length >= 5 && winRate < 40) {
            score += 10;
        }
        return Math.min(100, Math.round(score));
    }, [totalExposurePct, maxExposurePct, maxSectorConcentration, maxSectorPct, openPositions.length, config, totalUnrealizedPnl, totalCapital, closedPositions.length, winRate]);

    const riskLevel = riskScore >= 70 ? 'High' : riskScore >= 40 ? 'Moderate' : 'Low';
    const riskColor = riskScore >= 70 ? 'text-red-400' : riskScore >= 40 ? 'text-amber-400' : 'text-emerald-400';
    const riskBg = riskScore >= 70 ? 'bg-red-500/10' : riskScore >= 40 ? 'bg-amber-500/10' : 'bg-emerald-500/10';

    const isLoading = portfolioLoading || loadingQuotes;

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
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                    <Shield className="w-8 h-8 text-blue-400" />
                    Risk Dashboard
                </h1>
                <div className={`px-4 py-2 rounded-xl text-sm font-semibold ${riskBg} ${riskColor}`}>
                    Risk Score: {riskScore}/100 — {riskLevel}
                </div>
            </div>

            {openPositions.length === 0 ? (
                <EmptyState
                    icon={<Shield className="w-10 h-10" />}
                    title="No open positions"
                    description="Open positions to see your portfolio risk analysis. Risk metrics will update in real-time."
                    action={
                        <button
                            onClick={() => navigate('/positions')}
                            className="px-4 py-2 bg-blue-500/10 text-blue-400 rounded-xl text-sm font-medium hover:bg-blue-500/20 transition-colors cursor-pointer border border-blue-500/20"
                        >
                            Go to Positions
                        </button>
                    }
                />
            ) : (
                <>
                    {/* Risk Score + Key Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            {
                                label: 'Portfolio Heat',
                                value: `${totalExposurePct.toFixed(1)}%`,
                                sub: `of ${maxExposurePct}% limit`,
                                icon: Flame,
                                color: totalExposurePct > maxExposurePct ? 'text-red-400' : totalExposurePct > maxExposurePct * 0.8 ? 'text-amber-400' : 'text-blue-400',
                            },
                            {
                                label: 'Unrealized P&L',
                                value: `${totalUnrealizedPnl >= 0 ? '+' : ''}$${Math.abs(totalUnrealizedPnl).toFixed(0)}`,
                                sub: `${((totalUnrealizedPnl / totalCapital) * 100).toFixed(2)}% of capital`,
                                icon: totalUnrealizedPnl >= 0 ? ArrowUpRight : ArrowDownRight,
                                color: totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
                            },
                            {
                                label: 'Open Positions',
                                value: `${openPositions.length}`,
                                sub: `of ${config?.max_concurrent_positions ?? 5} max`,
                                icon: Activity,
                                color: 'text-blue-400',
                            },
                            {
                                label: 'Top Sector',
                                value: `${maxSectorConcentration.toFixed(1)}%`,
                                sub: sectorExposures[0]?.sector ?? '—',
                                icon: PieChart,
                                color: maxSectorConcentration > maxSectorPct ? 'text-red-400' : 'text-amber-400',
                            },
                            {
                                label: 'Win Rate',
                                value: closedPositions.length > 0 ? `${winRate.toFixed(0)}%` : '—',
                                sub: `${wins}/${closedPositions.length} trades`,
                                icon: Target,
                                color: winRate >= 50 ? 'text-emerald-400' : winRate >= 40 ? 'text-amber-400' : 'text-red-400',
                            },
                        ].map(({ label, value, sub, icon: Icon, color }) => (
                            <motion.div
                                key={label}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="glass-panel p-4 rounded-xl"
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <Icon className={`w-4 h-4 ${color}`} />
                                    <span className="text-xs text-sentinel-400">{label}</span>
                                </div>
                                <span className={`text-xl font-bold ${color}`}>{value}</span>
                                <p className="text-xs text-sentinel-500 mt-0.5">{sub}</p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Exposure Bar */}
                    <div className="glass-panel p-6 rounded-xl">
                        <h2 className="text-lg font-semibold text-sentinel-100 mb-4">Portfolio Exposure</h2>
                        <div className="relative h-6 bg-sentinel-800 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, totalExposurePct)}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                className={`h-full rounded-full ${
                                    totalExposurePct > maxExposurePct
                                        ? 'bg-gradient-to-r from-red-500 to-red-400'
                                        : totalExposurePct > maxExposurePct * 0.8
                                            ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                                            : 'bg-gradient-to-r from-blue-500 to-blue-400'
                                }`}
                            />
                            {/* Limit marker */}
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-sentinel-300/50"
                                style={{ left: `${Math.min(100, maxExposurePct)}%` }}
                            />
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-sentinel-400">
                            <span>0%</span>
                            <span className="text-sentinel-300">{maxExposurePct}% limit</span>
                            <span>100%</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Sector Concentration */}
                        <div className="glass-panel p-6 rounded-xl">
                            <h2 className="text-lg font-semibold text-sentinel-100 mb-4">Sector Concentration</h2>
                            <div className="space-y-3">
                                {sectorExposures.map(s => (
                                    <div key={s.sector}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                                                <span className="text-sm text-sentinel-200">{s.sector}</span>
                                                <span className="text-xs text-sentinel-500">({s.positions} pos)</span>
                                            </div>
                                            <span className={`text-sm font-medium ${
                                                s.pct > maxSectorPct ? 'text-red-400' : 'text-sentinel-200'
                                            }`}>
                                                {s.pct.toFixed(1)}%
                                            </span>
                                        </div>
                                        <div className="relative h-2 bg-sentinel-800 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(100, (s.pct / maxSectorPct) * 100)}%` }}
                                                transition={{ duration: 0.6 }}
                                                className="h-full rounded-full"
                                                style={{ backgroundColor: s.color }}
                                            />
                                        </div>
                                    </div>
                                ))}
                                {sectorExposures.length === 0 && (
                                    <p className="text-sm text-sentinel-500">No sector data available.</p>
                                )}
                            </div>
                        </div>

                        {/* Drawdown Scenarios */}
                        <div className="glass-panel p-6 rounded-xl">
                            <h2 className="text-lg font-semibold text-sentinel-100 mb-4 flex items-center gap-2">
                                <TrendingDown className="w-5 h-5 text-red-400" />
                                Drawdown Scenarios
                            </h2>
                            <div className="space-y-3">
                                {drawdownScenarios.map(scenario => (
                                    <div key={scenario.label} className="p-3 bg-sentinel-900/50 rounded-lg">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-sentinel-200">{scenario.label}</span>
                                            <span className="text-sm font-bold text-red-400">
                                                -${scenario.estimated.toFixed(0)}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-xs text-sentinel-500">
                                                Impact on capital
                                            </span>
                                            <span className="text-xs text-red-400/70">
                                                -{((scenario.estimated / totalCapital) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Worst position callout */}
                            {worstPosition && worstPosition.unrealizedPnlPct < 0 && (
                                <div className="mt-4 p-3 bg-red-500/5 border border-red-500/15 rounded-lg">
                                    <div className="flex items-center gap-2 mb-1">
                                        <AlertTriangle className="w-4 h-4 text-red-400" />
                                        <span className="text-sm font-medium text-red-400">Worst Position</span>
                                    </div>
                                    <p className="text-sm text-sentinel-200">
                                        {worstPosition.ticker} ({worstPosition.side}) — {worstPosition.unrealizedPnlPct.toFixed(2)}% (${worstPosition.unrealizedPnl.toFixed(0)})
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Position Risk Table */}
                    <div className="glass-panel p-6 rounded-xl">
                        <h2 className="text-lg font-semibold text-sentinel-100 mb-4">Position Risk Breakdown</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-sentinel-400 border-b border-sentinel-800">
                                        <th className="py-2 pr-4">Ticker</th>
                                        <th className="py-2 pr-4">Side</th>
                                        <th className="py-2 pr-4">Sector</th>
                                        <th className="py-2 pr-4 text-right">Entry</th>
                                        <th className="py-2 pr-4 text-right">Current</th>
                                        <th className="py-2 pr-4 text-right">Size</th>
                                        <th className="py-2 pr-4 text-right">P&L</th>
                                        <th className="py-2 text-right">Risk %</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {positionRisks.map(p => (
                                        <tr
                                            key={p.ticker}
                                            className="border-b border-sentinel-800/50 hover:bg-sentinel-800/30 cursor-pointer transition-colors"
                                            onClick={() => navigate(`/analysis/${p.ticker}`)}
                                        >
                                            <td className="py-3 pr-4 font-bold text-sentinel-100">{p.ticker}</td>
                                            <td className="py-3 pr-4">
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                                    p.side === 'long' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                                }`}>
                                                    {p.side}
                                                </span>
                                            </td>
                                            <td className="py-3 pr-4 text-sentinel-300">{p.sector}</td>
                                            <td className="py-3 pr-4 text-right text-sentinel-300">${p.entryPrice.toFixed(2)}</td>
                                            <td className="py-3 pr-4 text-right text-sentinel-200">${p.currentPrice.toFixed(2)}</td>
                                            <td className="py-3 pr-4 text-right text-sentinel-300">${p.positionSizeUsd.toFixed(0)}</td>
                                            <td className={`py-3 pr-4 text-right font-medium ${
                                                p.unrealizedPnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                                            }`}>
                                                {p.unrealizedPnlPct >= 0 ? '+' : ''}{p.unrealizedPnlPct.toFixed(2)}%
                                            </td>
                                            <td className="py-3 text-right text-sentinel-200">{p.riskContribution.toFixed(1)}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
