/**
 * Backtest & Performance — Unified signal evaluation page.
 *
 * Two tabs:
 * - "Live Performance" — real outcome tracking (from Performance page)
 * - "Backtest Engine"  — configurable historical replay
 */

import { DEFAULT_STARTING_CAPITAL, DEFAULT_MIN_CONFIDENCE } from '@/config/constants';
import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    History, Play, BarChart3, TrendingUp, TrendingDown,
    Target, Shield, DollarSign, Activity, Download,
    AlertTriangle, Loader2, Award, Flame, Zap,
    Calendar, Filter, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { runBacktest, BacktestResult, BacktestParams, WinRateBreakdown, ConfidenceCalibrationPoint, MonthlyReturn } from '@/services/backtestEngine';
import { EmptyState } from '@/components/shared/EmptyState';
import { exportBacktestToCSV, downloadCSV } from '@/utils/exportData';
import { Performance } from '@/pages/Performance';

// ────────────── helpers ──────────────

const fadeUp = {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4 },
};

function StatCard({ label, value, sub, icon: Icon, color }: {
    label: string; value: string; sub: string;
    icon: React.ComponentType<{ className?: string }>; color: string;
}) {
    return (
        <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-4 backdrop-blur-sm relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex items-center gap-2 text-sentinel-400 text-xs uppercase tracking-wider mb-2">
                <Icon className="w-3.5 h-3.5" /> {label}
            </div>
            <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
            <p className="text-xs text-sentinel-500 mt-1">{sub}</p>
        </motion.div>
    );
}

// ────────────── Win-Rate Breakdown Bars ──────────────

function BreakdownBars({ title, data }: { title: string; data: WinRateBreakdown[] }) {
    if (data.length === 0) return null;
    return (
        <div className="space-y-3">
            <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider">{title}</h3>
            {data.map(item => {
                const barColor = item.winRate >= 60 ? 'bg-emerald-500' : item.winRate >= 40 ? 'bg-amber-500' : 'bg-red-500';
                const textColor = item.winRate >= 60 ? 'text-emerald-400' : item.winRate >= 40 ? 'text-amber-400' : 'text-red-400';
                return (
                    <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-sentinel-300 capitalize">{item.label.replace(/_/g, ' ')}</span>
                            <span className={`font-mono font-bold ${textColor}`}>{item.winRate.toFixed(0)}%
                                <span className="text-sentinel-500 font-normal ml-1">({item.wins}W/{item.losses}L)</span>
                            </span>
                        </div>
                        <div className="h-2 bg-sentinel-800/60 rounded-full overflow-hidden">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(item.winRate, 100)}%` }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                                className={`h-full rounded-full ${barColor}`}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ────────────── Confidence Calibration Chart ──────────────

function CalibrationChart({ data }: { data: ConfidenceCalibrationPoint[] }) {
    if (data.length === 0) return null;
    const maxActual = Math.max(...data.map(d => d.actual), 100);
    const barHeight = 120;

    return (
        <div className="space-y-3">
            <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider">Confidence Calibration</h3>
            <p className="text-[11px] text-sentinel-500">Is the AI's confidence score accurate? Bars show actual win rate vs predicted confidence.</p>
            <div className="flex items-end gap-1.5 h-[140px] pt-4">
                {data.map(point => {
                    const barH = (point.actual / maxActual) * barHeight;
                    const refH = (point.predicted / maxActual) * barHeight;
                    const isOver = point.actual >= point.predicted;
                    return (
                        <div key={point.bucket} className="flex-1 flex flex-col items-center gap-1 relative group">
                            {/* Tooltip */}
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-sentinel-800 border border-sentinel-700 text-[10px] text-sentinel-200 px-2 py-1 rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                Predicted: {point.predicted}% · Actual: {point.actual}% · n={point.count}
                            </div>
                            <div className="w-full flex flex-col items-center justify-end" style={{ height: barHeight }}>
                                {/* Reference line (predicted) */}
                                <div className="absolute w-full" style={{ bottom: refH }}>
                                    <div className="h-px bg-sentinel-500/40 w-full" />
                                </div>
                                {/* Bar (actual) */}
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: barH }}
                                    transition={{ duration: 0.6, ease: 'easeOut' }}
                                    className={`w-full rounded-t ${isOver ? 'bg-emerald-500/70' : 'bg-red-500/70'}`}
                                />
                            </div>
                            <span className="text-[9px] text-sentinel-500 font-mono">{point.bucket}</span>
                        </div>
                    );
                })}
            </div>
            <div className="flex items-center justify-center gap-4 text-[10px] text-sentinel-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500/70" /> Actual ≥ Predicted</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/70" /> Actual &lt; Predicted</span>
                <span className="flex items-center gap-1"><span className="w-full h-px bg-sentinel-500/40 min-w-[12px]" /> Predicted</span>
            </div>
        </div>
    );
}

// ────────────── Monthly Returns Heatmap ──────────────

function MonthlyHeatmap({ data }: { data: MonthlyReturn[] }) {
    if (data.length === 0) return null;
    const maxAbs = Math.max(...data.map(d => Math.abs(d.returnPct)), 1);

    return (
        <div className="space-y-3">
            <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> Monthly Returns
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {data.map(m => {
                    const intensity = Math.min(Math.abs(m.returnPct) / maxAbs, 1);
                    const isPositive = m.returnPct >= 0;
                    const bg = isPositive
                        ? `rgba(16, 185, 129, ${0.1 + intensity * 0.5})`
                        : `rgba(239, 68, 68, ${0.1 + intensity * 0.5})`;
                    return (
                        <motion.div
                            key={m.month}
                            {...fadeUp}
                            className="rounded-lg p-3 text-center border border-sentinel-800/30"
                            style={{ backgroundColor: bg }}
                        >
                            <p className="text-[10px] text-sentinel-400 mb-1">{m.label}</p>
                            <p className={`text-sm font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                                {isPositive ? '+' : ''}{m.returnPct.toFixed(1)}%
                            </p>
                            <p className="text-[9px] text-sentinel-500 mt-0.5">{m.tradeCount} trades</p>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}

// ────────────── Lazy-load merged page components ──────────────

const Leaderboard = lazy(() => import('@/pages/Leaderboard').then(m => ({ default: m.Leaderboard })));
const EarningsCalendar = lazy(() => import('@/pages/EarningsCalendar').then(m => ({ default: m.EarningsCalendar })));
const DecisionAccuracy = lazy(() => import('@/pages/DecisionAccuracy').then(m => ({ default: m.DecisionAccuracy })));

// ────────────── Main Component ──────────────

const ANALYTICS_TABS = [
    { id: 'backtest', label: 'Backtest Engine', icon: History, color: 'purple' },
    { id: 'performance', label: 'Performance', icon: BarChart3, color: 'emerald' },
    { id: 'accuracy', label: 'Accuracy', icon: Target, color: 'blue' },
    { id: 'leaderboard', label: 'Leaderboard', icon: Award, color: 'amber' },
    { id: 'earnings', label: 'Earnings', icon: Calendar, color: 'cyan' },
] as const;

type ActiveTab = typeof ANALYTICS_TABS[number]['id'];

export function Backtest() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeTab, setActiveTab] = useState<ActiveTab>(
        (ANALYTICS_TABS.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab') as ActiveTab : 'backtest')
    );

    const handleTabChange = (tab: ActiveTab) => {
        setActiveTab(tab);
        setSearchParams(tab === 'backtest' ? {} : { tab });
    };

    const currentTab = ANALYTICS_TABS.find(t => t.id === activeTab) ?? ANALYTICS_TABS[0];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Tab Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center ring-1 ring-purple-500/20">
                            <currentTab.icon className="w-5 h-5 text-purple-400" />
                        </div>
                        Analytics
                    </h1>
                    <p className="text-sentinel-400 mt-1.5 text-sm">
                        Performance tracking, backtesting, accuracy calibration, and source leaderboards
                    </p>
                </div>
            </div>

            {/* Tab Bar */}
            <div className="flex items-center gap-1 p-1 bg-sentinel-900/50 rounded-xl ring-1 ring-sentinel-800/50 overflow-x-auto mobile-scroll-x">
                {ANALYTICS_TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap border-none cursor-pointer ${
                                isActive
                                    ? 'bg-sentinel-800/80 text-sentinel-100'
                                    : 'text-sentinel-500 hover:text-sentinel-300 hover:bg-sentinel-800/30 bg-transparent'
                            }`}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <Suspense fallback={<div className="flex items-center justify-center py-16"><div className="w-6 h-6 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin" /></div>}>
                {activeTab === 'performance' && <Performance embedded />}
                {activeTab === 'backtest' && <BacktestEngine />}
                {activeTab === 'accuracy' && <DecisionAccuracy />}
                {activeTab === 'leaderboard' && <Leaderboard />}
                {activeTab === 'earnings' && <EarningsCalendar />}
            </Suspense>
        </div>
    );
}

function BacktestEngine() {
    // Parameters
    const [agentFilter, setAgentFilter] = useState<BacktestParams['agentFilter']>('all');
    const [minConfidence, setMinConfidence] = useState(DEFAULT_MIN_CONFIDENCE);
    const [startingCapital, setStartingCapital] = useState(DEFAULT_STARTING_CAPITAL);
    const [positionSizePct, setPositionSizePct] = useState(10);
    const [returnHorizon, setReturnHorizon] = useState<BacktestParams['returnHorizon']>('best');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [tickerFilter, setTickerFilter] = useState('');

    // State
    const [results, setResults] = useState<BacktestResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Trade log pagination
    const [tradePage, setTradePage] = useState(0);
    const TRADES_PER_PAGE = 25;

    const runTest = useCallback(async () => {
        setLoading(true);
        setError(null);
        setResults(null);
        setTradePage(0);

        try {
            // Fetch signal outcomes joined with signal metadata
            const { data: outcomes, error: outcomeErr } = await supabase
                .from('signal_outcomes')
                .select('*, signals!inner(signal_type, confidence_score, ticker, bias_type, thesis)')
                .order('tracked_at', { ascending: true });

            if (outcomeErr) throw outcomeErr;
            if (!outcomes || outcomes.length === 0) {
                setError('No signal outcome data found. Run the scanner and wait for outcomes to be tracked.');
                setLoading(false);
                return;
            }

            // Flatten the joined data
            const flatData = outcomes.map((o: any) => ({
                ...o,
                ticker: o.signals?.ticker || o.ticker,
                signal_type: o.signals?.signal_type || 'unknown',
                confidence_score: o.signals?.confidence_score || 0,
                bias_type: o.signals?.bias_type || 'unknown',
                created_at: o.tracked_at,
            }));

            const result = runBacktest(flatData, {
                startingCapital,
                minConfidence,
                agentFilter,
                positionSizePct,
                returnHorizon,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                tickerFilter: tickerFilter || undefined,
            });

            setResults(result);
        } catch (err: any) {
            setError(err.message || 'Failed to run backtest');
        } finally {
            setLoading(false);
        }
    }, [startingCapital, minConfidence, agentFilter, positionSizePct, returnHorizon, startDate, endDate, tickerFilter]);

    // Equity curve dimensions
    const curveWidth = 800;
    const curveHeight = 220;

    const equityPath = useMemo(() => {
        if (!results || results.equityCurve.length < 2) return '';
        const points = results.equityCurve;
        const minEq = Math.min(...points.map(p => p.equity));
        const maxEq = Math.max(...points.map(p => p.equity));
        const range = maxEq - minEq || 1;
        const padding = 10;

        return points.map((p, i) => {
            const x = padding + (i / (points.length - 1)) * (curveWidth - 2 * padding);
            const y = curveHeight - padding - ((p.equity - minEq) / range) * (curveHeight - 2 * padding);
            return `${i === 0 ? 'M' : 'L'}${x},${y}`;
        }).join(' ');
    }, [results]);

    const areaPath = useMemo(() => {
        if (!equityPath) return '';
        const padding = 10;
        return `${equityPath} L${curveWidth - padding},${curveHeight - padding} L${padding},${curveHeight - padding} Z`;
    }, [equityPath]);

    // Baseline Y (starting capital position)
    const baselineY = useMemo(() => {
        if (!results || results.equityCurve.length < 2) return 0;
        const points = results.equityCurve;
        const minEq = Math.min(...points.map(p => p.equity));
        const maxEq = Math.max(...points.map(p => p.equity));
        const range = maxEq - minEq || 1;
        const padding = 10;
        return curveHeight - padding - ((startingCapital - minEq) / range) * (curveHeight - 2 * padding);
    }, [results, startingCapital]);

    // Paginated trades
    const paginatedTrades = useMemo(() => {
        if (!results) return [];
        const start = tradePage * TRADES_PER_PAGE;
        return results.trades.slice(start, start + TRADES_PER_PAGE);
    }, [results, tradePage]);

    const totalPages = results ? Math.ceil(results.trades.length / TRADES_PER_PAGE) : 0;

    return (
        <div className="space-y-6">
            {/* ── Parameter Panel ── */}
            <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.03] to-transparent pointer-events-none" />
                <h2 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2 relative">
                    <Filter className="w-3.5 h-3.5 text-purple-400" /> Configuration
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 items-end relative">
                    {/* Agent Filter */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Agent Type</label>
                        <select
                            value={agentFilter}
                            onChange={e => setAgentFilter(e.target.value as any)}
                            className="w-full px-3 py-2.5 bg-sentinel-950 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                        >
                            <option value="all">All Agents</option>
                            <option value="overreaction">Overreaction Only</option>
                            <option value="contagion">Contagion Only</option>
                        </select>
                    </div>

                    {/* Return Horizon */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Return Horizon</label>
                        <select
                            value={returnHorizon}
                            onChange={e => setReturnHorizon(e.target.value as any)}
                            className="w-full px-3 py-2.5 bg-sentinel-950 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                        >
                            <option value="best">Best Available</option>
                            <option value="1d">1-Day Returns</option>
                            <option value="5d">5-Day Returns</option>
                            <option value="10d">10-Day Returns</option>
                            <option value="30d">30-Day Returns</option>
                        </select>
                    </div>

                    {/* Min Confidence */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Min Confidence: {minConfidence}%</label>
                        <input
                            type="range"
                            min={0}
                            max={100}
                            value={minConfidence}
                            onChange={e => setMinConfidence(Number(e.target.value))}
                            className="w-full accent-purple-500"
                        />
                    </div>

                    {/* Position Size */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Position Size: {positionSizePct}%</label>
                        <input
                            type="range"
                            min={1}
                            max={100}
                            value={positionSizePct}
                            onChange={e => setPositionSizePct(Number(e.target.value))}
                            className="w-full accent-purple-500"
                        />
                    </div>

                    {/* Starting Capital */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Starting Capital</label>
                        <input
                            value={startingCapital}
                            onChange={e => setStartingCapital(Number(e.target.value))}
                            type="number"
                            className="w-full px-3 py-2.5 bg-sentinel-950 border border-sentinel-800 rounded-lg text-sm font-mono text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                        />
                    </div>

                    {/* Ticker Filter */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Ticker Filter</label>
                        <input
                            value={tickerFilter}
                            onChange={e => setTickerFilter(e.target.value)}
                            placeholder="AAPL, MSFT..."
                            className="w-full px-3 py-2.5 bg-sentinel-950 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors placeholder:text-sentinel-600"
                        />
                    </div>

                    {/* Start Date */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Start Date</label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={e => setStartDate(e.target.value)}
                            className="w-full px-3 py-2.5 bg-sentinel-950 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                        />
                    </div>

                    {/* End Date */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">End Date</label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={e => setEndDate(e.target.value)}
                            className="w-full px-3 py-2.5 bg-sentinel-950 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                        />
                    </div>
                </div>

                {/* Run Button */}
                <div className="mt-5 flex justify-end relative">
                    <button
                        onClick={runTest}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 py-2.5 px-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer border-none shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Running Simulation...</>
                        ) : (
                            <><Play className="w-4 h-4" /> Run Backtest</>
                        )}
                    </button>
                </div>
            </motion.div>

            {/* ── Error ── */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3"
                    >
                        <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                        <span className="text-sm text-red-300">{error}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Loading Skeleton ── */}
            {loading && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-4 backdrop-blur-sm animate-pulse">
                                <div className="h-3 bg-sentinel-800 rounded w-20 mb-3" />
                                <div className="h-6 bg-sentinel-800 rounded w-16 mb-2" />
                                <div className="h-2.5 bg-sentinel-800 rounded w-24" />
                            </div>
                        ))}
                    </div>
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 h-64 animate-pulse" />
                </div>
            )}

            {/* ── Results ── */}
            <AnimatePresence>
                {results && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        {/* Summary Stats — Row 1: Core */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                            <StatCard
                                label="Total Return"
                                value={`${results.summary.totalReturnPct >= 0 ? '+' : ''}${results.summary.totalReturnPct.toFixed(2)}%`}
                                sub={`$${results.summary.totalReturn.toFixed(0)}`}
                                icon={DollarSign}
                                color={results.summary.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}
                            />
                            <StatCard
                                label="Win Rate"
                                value={`${results.summary.winRate.toFixed(1)}%`}
                                sub={`${results.summary.winners}W / ${results.summary.losers}L`}
                                icon={Target}
                                color={results.summary.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400'}
                            />
                            <StatCard
                                label="Sharpe Ratio"
                                value={results.summary.sharpeRatio.toFixed(2)}
                                sub="Risk-adjusted"
                                icon={Activity}
                                color={results.summary.sharpeRatio >= 1 ? 'text-emerald-400' : results.summary.sharpeRatio >= 0 ? 'text-amber-400' : 'text-red-400'}
                            />
                            <StatCard
                                label="Max Drawdown"
                                value={`−${results.summary.maxDrawdownPct.toFixed(1)}%`}
                                sub={`$${results.summary.maxDrawdown.toFixed(0)}`}
                                icon={TrendingDown}
                                color="text-red-400"
                            />
                            <StatCard
                                label="Profit Factor"
                                value={results.summary.profitFactor === Infinity ? '∞' : results.summary.profitFactor.toFixed(2)}
                                sub="Win/Loss ratio"
                                icon={Award}
                                color={results.summary.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400'}
                            />
                            <StatCard
                                label="Total Trades"
                                value={results.summary.totalTrades.toString()}
                                sub={`Avg Win: ${results.summary.avgWin.toFixed(1)}%`}
                                icon={BarChart3}
                                color="text-blue-400"
                            />
                        </div>

                        {/* Summary Stats — Row 2: Extended */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatCard
                                label="Expectancy"
                                value={`${results.summary.expectancy >= 0 ? '+' : ''}${results.summary.expectancy.toFixed(2)}%`}
                                sub="Avg profit per trade"
                                icon={Zap}
                                color={results.summary.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}
                            />
                            <StatCard
                                label="Best Trade"
                                value={results.summary.bestTrade ? `+${results.summary.bestTrade.pnl_pct.toFixed(1)}%` : '—'}
                                sub={results.summary.bestTrade?.ticker || '—'}
                                icon={ArrowUpRight}
                                color="text-emerald-400"
                            />
                            <StatCard
                                label="Worst Trade"
                                value={results.summary.worstTrade ? `${results.summary.worstTrade.pnl_pct.toFixed(1)}%` : '—'}
                                sub={results.summary.worstTrade?.ticker || '—'}
                                icon={ArrowDownRight}
                                color="text-red-400"
                            />
                            <StatCard
                                label="Streaks"
                                value={`${results.summary.longestWinStreak}W / ${results.summary.longestLossStreak}L`}
                                sub={`Current: ${results.summary.currentStreak.length} ${results.summary.currentStreak.type}`}
                                icon={Flame}
                                color="text-purple-400"
                            />
                        </div>

                        {/* ── Equity Curve ── */}
                        <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.02] to-transparent pointer-events-none" />
                            <h2 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2 relative">
                                <TrendingUp className="w-4 h-4 text-purple-400" /> Equity Curve
                            </h2>
                            <div className="overflow-x-auto relative">
                                <svg viewBox={`0 0 ${curveWidth} ${curveHeight}`} className="w-full h-48 md:h-64">
                                    <defs>
                                        <linearGradient id="equityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                            <stop offset="0%" stopColor={results.summary.totalReturn >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
                                            <stop offset="100%" stopColor={results.summary.totalReturn >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    {/* Baseline at starting capital */}
                                    <line x1="10" y1={baselineY} x2={curveWidth - 10} y2={baselineY} stroke="#6366f1" strokeWidth="1" strokeDasharray="6 4" opacity="0.4" />
                                    <text x="15" y={baselineY - 5} fill="#6366f1" fontSize="9" fontFamily="monospace" opacity="0.6">Starting Capital</text>
                                    {/* Fill area */}
                                    <path d={areaPath} fill="url(#equityGrad)" />
                                    {/* Line */}
                                    <path
                                        d={equityPath}
                                        fill="none"
                                        stroke={results.summary.totalReturn >= 0 ? '#10b981' : '#ef4444'}
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                    {/* Start label */}
                                    <text x="15" y="15" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                                        ${startingCapital.toLocaleString()}
                                    </text>
                                    {/* End label */}
                                    <text x={curveWidth - 15} y="15" fill={results.summary.totalReturn >= 0 ? '#10b981' : '#ef4444'} fontSize="10" fontFamily="monospace" textAnchor="end">
                                        ${Math.round(startingCapital + results.summary.totalReturn).toLocaleString()}
                                    </text>
                                </svg>
                            </div>
                        </motion.div>

                        {/* ── Analytics Grid: Breakdowns + Calibration ── */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Win Rate by Signal Type */}
                            <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                                <BreakdownBars title="Win Rate by Signal Type" data={results.breakdowns.bySignalType} />
                                {results.breakdowns.bySignalType.length === 0 && (
                                    <p className="text-xs text-sentinel-500 italic">No signal type data available.</p>
                                )}
                            </motion.div>

                            {/* Win Rate by Bias Type */}
                            <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                                <BreakdownBars title="Win Rate by Bias Type" data={results.breakdowns.byBiasType} />
                                {results.breakdowns.byBiasType.length === 0 && (
                                    <p className="text-xs text-sentinel-500 italic">No bias type data available.</p>
                                )}
                            </motion.div>

                            {/* Confidence Calibration */}
                            <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                                <CalibrationChart data={results.confidenceCalibration} />
                                {results.confidenceCalibration.length === 0 && (
                                    <p className="text-xs text-sentinel-500 italic">No calibration data available.</p>
                                )}
                            </motion.div>
                        </div>

                        {/* ── Monthly Returns Heatmap ── */}
                        <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                            <MonthlyHeatmap data={results.monthlyReturns} />
                            {results.monthlyReturns.length === 0 && (
                                <p className="text-xs text-sentinel-500 italic">No monthly data available.</p>
                            )}
                        </motion.div>

                        {/* ── Trade Log ── */}
                        <motion.div {...fadeUp} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm">
                            <div className="px-5 py-4 border-b border-sentinel-800/50 flex items-center justify-between">
                                <h2 className="text-sm font-semibold text-sentinel-200 uppercase tracking-wider flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-purple-400" /> Trade Log ({results.trades.length} trades)
                                    <button
                                        onClick={() => {
                                            const csv = exportBacktestToCSV(results.trades);
                                            downloadCSV(`backtest-${new Date().toISOString().split('T')[0]}`, csv);
                                        }}
                                        className="ml-2 px-2 py-1 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-400 hover:text-sentinel-200 rounded text-[10px] font-medium transition-colors flex items-center gap-1 ring-1 ring-sentinel-700 border-none cursor-pointer"
                                        title="Export trades as CSV"
                                    >
                                        <Download className="w-3 h-3" /> CSV
                                    </button>
                                </h2>
                                {totalPages > 1 && (
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setTradePage(p => Math.max(0, p - 1))}
                                            disabled={tradePage === 0}
                                            className="px-2.5 py-1 text-xs text-sentinel-400 hover:text-sentinel-200 bg-sentinel-800/50 rounded-lg disabled:opacity-30 cursor-pointer border-none transition-colors"
                                        >
                                            Prev
                                        </button>
                                        <span className="text-xs text-sentinel-500 font-mono">{tradePage + 1}/{totalPages}</span>
                                        <button
                                            onClick={() => setTradePage(p => Math.min(totalPages - 1, p + 1))}
                                            disabled={tradePage >= totalPages - 1}
                                            className="px-2.5 py-1 text-xs text-sentinel-400 hover:text-sentinel-200 bg-sentinel-800/50 rounded-lg disabled:opacity-30 cursor-pointer border-none transition-colors"
                                        >
                                            Next
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-sentinel-900">
                                        <tr className="text-sentinel-400 text-xs uppercase tracking-wider border-b border-sentinel-800/30">
                                            <th className="px-4 py-2.5 text-left">#</th>
                                            <th className="px-4 py-2.5 text-left">Date</th>
                                            <th className="px-4 py-2.5 text-left">Ticker</th>
                                            <th className="px-4 py-2.5 text-left">Signal</th>
                                            <th className="px-4 py-2.5 text-left">Bias</th>
                                            <th className="px-4 py-2.5 text-right">Conf.</th>
                                            <th className="px-4 py-2.5 text-right">Entry</th>
                                            <th className="px-4 py-2.5 text-right">P&L %</th>
                                            <th className="px-4 py-2.5 text-right">P&L $</th>
                                            <th className="px-4 py-2.5 text-center">Result</th>
                                            <th className="px-4 py-2.5 text-right">Equity</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedTrades.map((trade, i) => {
                                            const isWin = trade.pnl_usd > 0;
                                            const globalIdx = tradePage * TRADES_PER_PAGE + i;
                                            return (
                                                <tr key={globalIdx} className="border-b border-sentinel-800/20 hover:bg-sentinel-800/20 transition-colors">
                                                    <td className="px-4 py-2 text-sentinel-500 text-xs">{globalIdx + 1}</td>
                                                    <td className="px-4 py-2 text-sentinel-300 text-xs font-mono">{trade.date ? new Date(trade.date).toLocaleDateString() : '—'}</td>
                                                    <td className="px-4 py-2 font-mono font-bold text-sentinel-100">{trade.ticker}</td>
                                                    <td className="px-4 py-2">
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400 uppercase">
                                                            {trade.signal_type.replace(/_/g, ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-400 capitalize">
                                                            {trade.bias_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono text-sentinel-300">{trade.confidence}%</td>
                                                    <td className="px-4 py-2 text-right font-mono text-sentinel-300">${trade.entry_price.toFixed(2)}</td>
                                                    <td className={`px-4 py-2 text-right font-mono font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {isWin ? '+' : ''}{trade.pnl_pct.toFixed(2)}%
                                                    </td>
                                                    <td className={`px-4 py-2 text-right font-mono font-bold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {isWin ? '+' : ''}${trade.pnl_usd.toFixed(0)}
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isWin ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
                                                            {isWin ? '✓ Win' : '✗ Loss'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-2 text-right font-mono text-sentinel-200">${trade.equity_after.toFixed(0)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Empty state (no results yet) ── */}
            {!results && !loading && !error && (
                <motion.div {...fadeUp}>
                    <EmptyState
                        icon={<BarChart3 className="w-8 h-8 text-purple-400" />}
                        title="Configure & Run"
                        description="Set your parameters above and click 'Run Backtest' to replay historical signal outcomes and evaluate AI agent accuracy."
                        action={
                            <button
                                onClick={runTest}
                                className="mt-2 px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer border-none shadow-lg shadow-purple-500/20 flex items-center gap-2"
                            >
                                <Play className="w-4 h-4" /> Run Backtest
                            </button>
                        }
                    />
                </motion.div>
            )}
        </div>
    );
}
