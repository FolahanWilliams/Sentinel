import { Activity, Target, TrendingUp, AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { formatPrice, formatPercent } from '@/utils/formatters';
import { PortfolioOverview } from '@/components/dashboard/PortfolioOverview';
import { WeeklyDigest } from '@/components/dashboard/WeeklyDigest';

export function Dashboard() {
    const stats = useDashboardStats();
    const [recentSignals, setRecentSignals] = useState<any[]>([]);
    const [loadingSignals, setLoadingSignals] = useState(true);
    const [watchlistTickers, setWatchlistTickers] = useState<{ ticker: string; is_active: boolean }[]>([]);

    useEffect(() => {
        async function fetchRecent() {
            const { data, error } = await supabase
                .from('signals')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            if (!error && data) {
                setRecentSignals(data);
            }
            setLoadingSignals(false);
        }

        fetchRecent();

        // Fetch real watchlist tickers
        async function fetchWatchlist() {
            const { data } = await supabase
                .from('watchlist')
                .select('ticker, is_active')
                .eq('is_active', true)
                .order('added_at', { ascending: false })
                .limit(8);
            if (data) setWatchlistTickers(data);
        }
        fetchWatchlist();

        const channel = supabase.channel('recent_signals')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
                // Auto-prepend new signals hitting the DB from the scanner
                setRecentSignals(prev => [payload.new, ...prev].slice(0, 5));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [])

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100">
                        Intelligence Overview
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        System active • Last scan: 2 mins ago
                    </p>
                </div>
                <button className="px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700 hover:ring-sentinel-600 flex items-center gap-2 w-fit">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Force Global Scan
                </button>
            </div>

            {/* KPI CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Active Signals"
                    value={stats.loading ? '...' : stats.activeSignals}
                    icon={<Target className="w-5 h-5 text-blue-400" />}
                    trend="Currently open"
                />
                <StatCard
                    title="Avg Win Rate (30d)"
                    value={stats.loading ? '...' : `${stats.winRate}%`}
                    icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
                    trend={stats.winRate > 50 ? 'Profitable edge' : 'Needs calibration'}
                    trendColor={stats.winRate > 50 ? 'text-emerald-400' : 'text-amber-400'}
                />
                <StatCard
                    title="Cumulative PnL"
                    value={stats.loading ? '...' : formatPercent(stats.totalPnL)}
                    icon={<Activity className="w-5 h-5 text-purple-400" />}
                    trend="Based on 1 unit sizing"
                />
                <StatCard
                    title="Events Processed"
                    value={stats.loading ? '...' : stats.eventsScanned}
                    icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
                    trend="Lifetime anomalies"
                />
            </div>

            {/* MAIN CONTENT GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* FEED */}
                <div className="xl:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-sentinel-200">Recent Signals</h2>
                        <a href="/analysis" className="text-sm text-sentinel-400 hover:text-sentinel-100 transition-colors flex items-center gap-1">
                            View all <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>

                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 backdrop-blur-sm overflow-hidden">
                        {loadingSignals ? (
                            <div className="p-8 justify-center flex">
                                <div className="w-6 h-6 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div>
                            </div>
                        ) : recentSignals.length === 0 ? (
                            <div className="p-8 text-center text-sentinel-400">
                                No signals generated yet. The agents are watching.
                            </div>
                        ) : (
                            <div className="divide-y divide-sentinel-800/50">
                                {recentSignals.map(signal => (
                                    <div key={signal.id} className="p-4 hover:bg-sentinel-800/30 transition-colors group cursor-pointer">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-1 bg-sentinel-800 text-sentinel-100 text-xs font-bold rounded ring-1 ring-sentinel-700">
                                                    {signal.ticker}
                                                </span>
                                                <span className="text-sm font-medium text-sentinel-300 capitalize">
                                                    {signal.signal_type.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-sentinel-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(signal.created_at).toLocaleDateString()}
                                                </span>
                                                <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded ring-1 ring-emerald-500/20">
                                                    {signal.confidence_score}% CONFIDENCE
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-sm text-sentinel-400 line-clamp-2">
                                            {signal.thesis}
                                        </p>
                                        <div className="mt-4 flex items-center gap-6 text-xs text-sentinel-500 font-mono">
                                            <div>ENTRY: <span className="text-sentinel-300">{formatPrice(signal.suggested_entry_low)} - {formatPrice(signal.suggested_entry_high)}</span></div>
                                            <div>TARGET: <span className="text-emerald-400">{formatPrice(signal.target_price)}</span></div>
                                            <div>STOP: <span className="text-red-400">{formatPrice(signal.stop_loss)}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* SIDEBAR WIDGETS */}
                <div className="space-y-6">

                    {/* PORTFOLIO OVERVIEW */}
                    <PortfolioOverview />

                    {/* WEEKLY DIGEST */}
                    <WeeklyDigest />

                    {/* QUICK WATCHLIST (Live) */}
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider">Active Watchlist</h3>
                            <a href="/watchlist" className="text-xs text-blue-400 hover:text-blue-300">Edit</a>
                        </div>
                        <div className="space-y-2">
                            {watchlistTickers.length === 0 ? (
                                <p className="text-sm text-sentinel-500 text-center py-2">No tickers in watchlist</p>
                            ) : (
                                watchlistTickers.map(t => (
                                    <div key={t.ticker} className="flex justify-between items-center text-sm p-2 rounded hover:bg-sentinel-800/30 transition-colors">
                                        <span className="font-medium text-sentinel-200">{t.ticker}</span>
                                        <span className="text-emerald-400/70 text-xs flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70"></span>
                                            Active
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* SCANNER STATUS */}
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4">Scanner Status</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-sentinel-400">Master Loop</span>
                                <span className="flex items-center gap-2 text-emerald-400 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                    Active
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-sentinel-400">RSS Feeds</span>
                                <span className="text-sentinel-200">Synced</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-sentinel-400">Agent Quota</span>
                                <span className="text-sentinel-200">Healthy</span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon, trend, trendColor = "text-sentinel-500" }: any) {
    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 flex flex-col backdrop-blur-sm group hover:bg-sentinel-800/30 transition-colors">
            <div className="flex justify-between items-start mb-4">
                <span className="text-sm font-medium text-sentinel-400">{title}</span>
                <div className="p-2 bg-sentinel-800 rounded-lg ring-1 ring-sentinel-700 group-hover:bg-sentinel-700 transition-colors">
                    {icon}
                </div>
            </div>
            <div className="text-3xl font-bold text-sentinel-100 font-display tracking-tight">
                {value}
            </div>
            {trend && (
                <div className={`mt-2 text-xs ${trendColor}`}>
                    {trend}
                </div>
            )}
        </div>
    )
}
