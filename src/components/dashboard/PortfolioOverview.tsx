/**
 * PortfolioOverview — Dashboard widget showing positions, exposure, and sector breakdown.
 * Reads from `positions` + `portfolio_config` tables via usePortfolio hook.
 */

import { usePortfolio } from '@/hooks/usePortfolio';
import { formatPrice, formatPercent } from '@/utils/formatters';
import { TrendingUp, TrendingDown, Briefcase, PieChart, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { motion } from 'framer-motion';
import { DonutChart } from '@/components/shared/DonutChart';
import { EmptyState } from '@/components/shared/EmptyState';
import { useNavigate } from 'react-router-dom';

// Sector colours for the visual breakdown
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

export function PortfolioOverview() {
    const { config, openPositions, closedPositions, loading } = usePortfolio();
    const [sectorMap, setSectorMap] = useState<Record<string, string>>({});
    const navigate = useNavigate();

    // Fetch watchlist to get sector data for tickers
    useEffect(() => {
        async function fetchSectors() {
            const { data } = await supabase
                .from('watchlist')
                .select('ticker, sector');
            if (data) {
                const map: Record<string, string> = {};
                data.forEach(w => { map[w.ticker] = w.sector || 'Other'; });
                setSectorMap(map);
            }
        }
        fetchSectors();
    }, []);

    if (loading) {
        return (
            <div className="glass-panel rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-5 h-5 rounded bg-sentinel-700 animate-pulse" />
                    <div className="w-32 h-4 rounded bg-sentinel-700 animate-pulse" />
                </div>
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-12 rounded bg-sentinel-800/50 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    const totalCapital = config?.total_capital || 10000;
    const maxExposure = config?.max_total_exposure_pct || 50;

    // Calculate exposure
    const totalExposure = openPositions.reduce((sum, p) => sum + (Number(p.position_size_usd) || 0), 0);
    const exposurePct = totalCapital > 0 ? (totalExposure / totalCapital) * 100 : 0;

    // Closed PnL
    const totalRealizedPnl = closedPositions.reduce((sum, p) => sum + (Number(p.realized_pnl) || 0), 0);

    // Sector breakdown
    const sectorExposure: Record<string, number> = {};
    openPositions.forEach(p => {
        const sector = sectorMap[p.ticker] || 'Other';
        sectorExposure[sector] = (sectorExposure[sector] || 0) + (Number(p.position_size_usd) || 0);
    });

    const winCount = closedPositions.filter(p => (Number(p.realized_pnl) || 0) > 0).length;
    const lossCount = closedPositions.filter(p => (Number(p.realized_pnl) || 0) <= 0).length;

    return (
        <div className="space-y-4">
            {/* SUMMARY CARD */}
            <div className="glass-panel p-6 rounded-xl relative overflow-hidden">
                {/* Ambient glow behind metrics */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-radial-glow opacity-50 pointer-events-none" />

                <div className="relative z-10">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-blue-400" /> Portfolio
                        </h3>
                        <span className="text-xs text-sentinel-500">{formatPrice(totalCapital)} capital</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="bg-sentinel-950/50 p-3 rounded-lg border border-sentinel-800/30">
                            <div className="text-xs text-sentinel-500 mb-1">Open Positions</div>
                            <div className="text-xl font-bold text-sentinel-100">{openPositions.length}</div>
                            <div className="text-xs text-sentinel-500">of {config?.max_concurrent_positions || 5} max</div>
                        </div>
                        <div className="bg-sentinel-950/50 p-3 rounded-lg border border-sentinel-800/30">
                            <div className="text-xs text-sentinel-500 mb-1">Realized PnL</div>
                            <div className={`text-2xl font-bold font-mono tracking-tight ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {totalRealizedPnl >= 0 ? '+' : ''}{formatPrice(totalRealizedPnl)}
                            </div>
                            <div className="text-xs text-sentinel-500 mt-1 flex items-center gap-2">
                                {closedPositions.length > 0 ? `${winCount}W / ${lossCount}L` : 'No closed trades'}
                            </div>
                        </div>
                    </div>

                    {/* EXPOSURE BAR */}
                    <div className="mb-1">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-sentinel-400">Exposure</span>
                            <span className={`font-mono ${exposurePct > maxExposure ? 'text-red-400' : 'text-sentinel-300'}`}>
                                {exposurePct.toFixed(1)}% / {maxExposure}%
                            </span>
                        </div>
                        <div className="h-2 bg-sentinel-950/80 rounded-full overflow-hidden shadow-inner ring-1 ring-white/5">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(exposurePct, 100)}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                className="h-full rounded-full"
                                style={{
                                    backgroundColor: exposurePct > maxExposure ? '#EF4444' : exposurePct > maxExposure * 0.8 ? '#F59E0B' : '#3B82F6',
                                    boxShadow: exposurePct > maxExposure ? 'var(--shadow-glow-red)' : exposurePct > maxExposure * 0.8 ? '0 0 10px rgba(245,158,11,0.5)' : 'var(--shadow-glow-blue)'
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* OPEN POSITIONS */}
            {openPositions.length > 0 && (
                <div className="glass-panel rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-sentinel-800/50 bg-sentinel-950/30">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider">Active Positions</h3>
                    </div>
                    <div className="divide-y divide-sentinel-800/30">
                        {openPositions.map(pos => {
                            const pnl = Number(pos.realized_pnl) || 0;
                            const pnlPct = Number(pos.realized_pnl_pct) || 0;
                            const isProfit = pnl >= 0;

                            return (
                                <div key={pos.id} className="p-3 hover:bg-sentinel-800/20 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-sentinel-100 font-mono text-sm">{pos.ticker}</span>
                                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${pos.side === 'long' ? 'bg-blue-500/15 text-blue-400' : 'bg-rose-500/15 text-rose-400'}`}>
                                                {pos.side.toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {isProfit ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : <TrendingDown className="w-3 h-3 text-red-400" />}
                                            <span className={`text-xs font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {formatPercent(pnlPct)}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 mt-1 text-[11px] text-sentinel-500 font-mono">
                                        {pos.entry_price && <span>Entry: {formatPrice(Number(pos.entry_price))}</span>}
                                        {pos.shares && <span>{Number(pos.shares)} shares</span>}
                                        {pos.position_size_usd && <span>{formatPrice(Number(pos.position_size_usd))}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* SECTOR BREAKDOWN — DONUT CHART */}
            {Object.keys(sectorExposure).length > 0 && (
                <div className="glass-panel p-5 rounded-xl">
                    <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider flex items-center gap-2 mb-4">
                        <PieChart className="w-4 h-4 text-purple-400" /> Sector Exposure
                    </h3>
                    <div className="flex items-center gap-6">
                        <DonutChart
                            segments={Object.entries(sectorExposure)
                                .sort(([, a], [, b]) => b - a)
                                .map(([sector, amount]) => ({
                                    label: sector,
                                    value: amount,
                                    color: SECTOR_COLORS[sector] || SECTOR_COLORS.Other || '#6b7280',
                                }))}
                            size={130}
                            thickness={16}
                            centerLabel="Total"
                            centerValue={`${exposurePct.toFixed(0)}%`}
                        />
                        <div className="flex-1 space-y-2">
                            {Object.entries(sectorExposure)
                                .sort(([, a], [, b]) => b - a)
                                .map(([sector, amount]) => {
                                    const pct = totalCapital > 0 ? (amount / totalCapital) * 100 : 0;
                                    const color = SECTOR_COLORS[sector] || SECTOR_COLORS.Other || '#6b7280';
                                    return (
                                        <div key={sector} className="flex items-center gap-2 text-xs">
                                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                            <span className="text-sentinel-300 flex-1">{sector}</span>
                                            <span className="text-sentinel-400 font-mono">{pct.toFixed(1)}%</span>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}

            {/* EMPTY STATE */}
            {openPositions.length === 0 && closedPositions.length === 0 && (
                <EmptyState
                    icon={<Briefcase className="w-8 h-8 text-blue-400" />}
                    title="No positions tracked yet"
                    description="Log your trades to track performance, exposure, and get AI-powered post-mortem analysis."
                    action={
                        <button
                            onClick={() => navigate('/positions')}
                            className="mt-2 px-5 py-2.5 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-xl text-sm font-medium transition-colors ring-1 ring-sentinel-700 hover:ring-sentinel-600 flex items-center gap-2"
                        >
                            <ArrowRight className="w-4 h-4 text-emerald-400" /> Go to Positions
                        </button>
                    }
                />
            )}
        </div>
    );
}
