/**
 * Sentinel — Unified Trading Dashboard
 *
 * Single-view dashboard combining AI Signals, Portfolio, Watchlist,
 * and Performance tabs. Replaces the fragmented multi-page view
 * with one cohesive trading intelligence interface.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { usePortfolio } from '@/hooks/usePortfolio';
import { MarketDataService } from '@/services/marketData';
import { formatPrice, formatPercent } from '@/utils/formatters';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { SignalsSection } from '@/components/dashboard/SignalsSection';
import { UnifiedPortfolioView } from '@/components/dashboard/UnifiedPortfolioView';
import { WatchlistSection } from '@/components/dashboard/WatchlistSection';
import { PerformanceMetrics } from '@/components/dashboard/PerformanceMetrics';
import {
    Activity, Briefcase, Eye, BarChart3, Zap, User, TrendingUp,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MarketSnapshot } from '@/components/dashboard/MarketSnapshot';
import { GlassMaterialize } from '@/components/shared/GlassMaterialize';
import type { Signal } from '@/types/signals';
import type { DashboardTab } from '@/types/dashboard';

const TABS: { id: DashboardTab; label: string; icon: typeof Activity }[] = [
    { id: 'signals', label: 'AI Signals', icon: Zap },
    { id: 'portfolio', label: 'My Portfolio', icon: Briefcase },
    { id: 'watchlist', label: 'Watchlist', icon: Eye },
    { id: 'performance', label: 'Performance', icon: BarChart3 },
];

export function UnifiedDashboard() {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<DashboardTab>('signals');

    // Top-bar live data
    const { config, openPositions } = usePortfolio();
    const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
    const [dailyRoi, setDailyRoi] = useState<number | null>(null);
    const [activeSignalCount, setActiveSignalCount] = useState(0);
    const [portfolioRefreshKey, setPortfolioRefreshKey] = useState(0);
    const [topSignals, setTopSignals] = useState<Signal[]>([]);

    // Fetch active signal count from DB
    const fetchActiveCount = useCallback(async () => {
        const { count } = await supabase
            .from('signals')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');
        setActiveSignalCount(count ?? 0);
    }, []);

    useEffect(() => {
        fetchActiveCount();
    }, [fetchActiveCount]);

    // Fetch top 3 signals by projected ROI for mobile pill bar
    useEffect(() => {
        async function fetchTopSignals() {
            const { data } = await supabase
                .from('signals')
                .select('id, ticker, projected_roi, confidence_score, signal_type')
                .eq('status', 'active')
                .not('projected_roi', 'is', null)
                .order('projected_roi', { ascending: false })
                .limit(3);
            if (data) setTopSignals(data as unknown as Signal[]);
        }
        fetchTopSignals();
    }, [activeSignalCount]);

    // Realtime subscriptions for live dashboard updates
    useEffect(() => {
        const channel = supabase.channel('dashboard_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => {
                fetchActiveCount();
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => {
                // Portfolio hook handles its own refresh; just bump the key to recompute value
                setPortfolioRefreshKey(k => k + 1);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchActiveCount]);

    // Compute portfolio value with live prices
    useEffect(() => {
        async function computeValue() {
            const totalCapital = config?.total_capital ?? 10000;

            if (openPositions.length === 0) {
                setPortfolioValue(totalCapital);
                setDailyRoi(0);
                return;
            }

            const tickers = [...new Set(openPositions.map(p => p.ticker))];
            try {
                const quotes = await MarketDataService.getQuotesBulk(tickers);

                let unrealizedPnl = 0;
                let dailyChange = 0;

                for (const pos of openPositions) {
                    const quote = quotes[pos.ticker];
                    const currentPrice = quote?.price ?? pos.entry_price ?? 0;
                    const entryPrice = pos.entry_price ?? 0;
                    const shares = pos.shares ?? 0;
                    unrealizedPnl += (currentPrice - entryPrice) * shares;

                    // Daily change from quote
                    if (quote) {
                        dailyChange += (quote.change ?? 0) * shares;
                    }
                }

                setPortfolioValue(totalCapital + unrealizedPnl);
                setDailyRoi(totalCapital > 0 ? (dailyChange / totalCapital) * 100 : 0);
            } catch {
                setPortfolioValue(totalCapital);
                setDailyRoi(0);
            }
        }
        computeValue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, openPositions, portfolioRefreshKey]);

    return (
        <ErrorBoundary>
            <div className="space-y-0 animate-in fade-in duration-500">

                {/* Top Navigation Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    {/* Left: Logo + portfolio value */}
                    <div className="flex items-center gap-6">
                        <div>
                            <h1 className="text-2xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-2">
                                <Zap className="w-6 h-6 text-emerald-400" />
                                Sentinel
                            </h1>
                        </div>

                        {/* Portfolio value */}
                        {portfolioValue != null && (
                            <div className="hidden sm:flex items-center gap-4 pl-6 border-l border-sentinel-800/50">
                                <div>
                                    <span className="text-[10px] text-sentinel-500 uppercase tracking-wider block">Portfolio</span>
                                    <span className="text-lg font-bold font-mono text-sentinel-100">
                                        {formatPrice(portfolioValue)}
                                    </span>
                                </div>
                                {dailyRoi != null && (
                                    <span className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${
                                        dailyRoi >= 0
                                            ? 'bg-emerald-500/10 text-emerald-400'
                                            : 'bg-red-500/10 text-red-400'
                                    }`}>
                                        {dailyRoi >= 0 ? '+' : ''}{dailyRoi.toFixed(2)}% today
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right: Active signals badge */}
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-bold ring-1 ring-emerald-500/20 flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5" />
                            {activeSignalCount} Active Signal{activeSignalCount !== 1 ? 's' : ''}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-sentinel-800 ring-1 ring-sentinel-700 flex items-center justify-center" aria-label="User avatar">
                            <User className="w-4 h-4 text-sentinel-400" />
                        </div>
                    </div>
                </div>

                {/* Mobile portfolio value */}
                {portfolioValue != null && (
                    <div className="sm:hidden flex items-center gap-4 mb-4 glass-panel rounded-xl p-3">
                        <div className="flex-1">
                            <span className="text-[10px] text-sentinel-500 uppercase tracking-wider block">Portfolio Value</span>
                            <span className="text-lg font-bold font-mono text-sentinel-100">{formatPrice(portfolioValue)}</span>
                        </div>
                        {dailyRoi != null && (
                            <span className={`text-sm font-bold font-mono ${dailyRoi >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatPercent(dailyRoi)} today
                            </span>
                        )}
                    </div>
                )}

                {/* Market Overview */}
                <div className="mb-6">
                    <GlassMaterialize delay={0}><MarketSnapshot /></GlassMaterialize>
                </div>

                {/* Tab Bar */}
                <div className="flex items-center gap-1 p-1 bg-sentinel-900/70 rounded-xl ring-1 ring-sentinel-800/50 mb-6 overflow-x-auto" role="tablist" aria-label="Dashboard sections">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap border-none cursor-pointer relative ${
                                    isActive
                                        ? 'text-sentinel-100 bg-sentinel-800/80'
                                        : 'text-sentinel-500 hover:text-sentinel-300 hover:bg-sentinel-800/30 bg-transparent'
                                }`}
                                role="tab"
                                aria-selected={isActive}
                                aria-controls={`tab-panel-${tab.id}`}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                                {/* Active signal count badge on signals tab */}
                                {tab.id === 'signals' && activeSignalCount > 0 && (
                                    <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full">
                                        {activeSignalCount}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        role="tabpanel"
                        id={`tab-panel-${activeTab}`}
                        aria-label={TABS.find(t => t.id === activeTab)?.label}
                    >
                        {activeTab === 'signals' && <SignalsSection />}
                        {activeTab === 'portfolio' && <UnifiedPortfolioView />}
                        {activeTab === 'watchlist' && <WatchlistSection />}
                        {activeTab === 'performance' && <PerformanceMetrics />}
                    </motion.div>
                </AnimatePresence>

                {/* Mobile floating Top 3 Signals pill bar */}
                {topSignals.length > 0 && activeTab !== 'signals' && (
                    <div className="fixed bottom-4 left-4 right-4 z-50 sm:hidden">
                        <motion.div
                            initial={{ y: 50, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            className="flex items-center gap-2 p-2 bg-sentinel-900/95 backdrop-blur-lg rounded-xl ring-1 ring-sentinel-700/50 shadow-xl overflow-x-auto"
                        >
                            <TrendingUp className="w-4 h-4 text-emerald-400 flex-shrink-0 ml-1" />
                            {topSignals.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => {
                                        setActiveTab('signals');
                                        navigate(`/analysis/${s.ticker}`);
                                    }}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sentinel-800/70 rounded-lg text-xs font-mono whitespace-nowrap ring-1 ring-sentinel-700/40 hover:ring-emerald-500/30 transition-colors border-none cursor-pointer flex-shrink-0"
                                >
                                    <span className="text-sentinel-100 font-bold">{s.ticker}</span>
                                    {s.projected_roi != null && (
                                        <span className="text-emerald-400 font-bold">+{s.projected_roi}%</span>
                                    )}
                                </button>
                            ))}
                        </motion.div>
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}
