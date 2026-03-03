/**
 * Backtest — Historical signal verification engine.
 *
 * Queries signal_outcomes + signals, runs a simulated backtest
 * using configurable parameters, and renders an equity curve,
 * summary statistics, and a trade log table.
 */

import { useState, useMemo, useCallback } from 'react';
import {
    History, Play, BarChart3, TrendingUp, TrendingDown,
    Target, Shield, Percent, DollarSign, Activity,
    AlertTriangle, Loader2, Award
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { runBacktest, BacktestResult, BacktestParams } from '@/services/backtestEngine';

export function Backtest() {
    // Parameters
    const [agentFilter, setAgentFilter] = useState<BacktestParams['agentFilter']>('all');
    const [minConfidence, setMinConfidence] = useState(60);
    const [startingCapital, setStartingCapital] = useState(10000);
    const [positionSizePct, setPositionSizePct] = useState(10);

    // State
    const [results, setResults] = useState<BacktestResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runTest = useCallback(async () => {
        setLoading(true);
        setError(null);
        setResults(null);

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
                bias_type: o.signals?.bias_type,
                created_at: o.tracked_at,
            }));

            const result = runBacktest(flatData, {
                startingCapital,
                minConfidence,
                agentFilter,
                positionSizePct,
            });

            setResults(result);
        } catch (err: any) {
            setError(err.message || 'Failed to run backtest');
        } finally {
            setLoading(false);
        }
    }, [startingCapital, minConfidence, agentFilter, positionSizePct]);

    // Equity curve dimensions
    const curveWidth = 800;
    const curveHeight = 200;

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

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <History className="w-8 h-8 text-purple-400" /> Backtest Engine
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Historical verification of AI signal performance
                    </p>
                </div>
            </div>

            {/* Parameter Panel */}
            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                <h2 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4">Parameters</h2>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    {/* Agent Filter */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Agent Type</label>
                        <select
                            value={agentFilter}
                            onChange={e => setAgentFilter(e.target.value as any)}
                            className="w-full px-3 py-2.5 bg-sentinel-950 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50"
                        >
                            <option value="all">All Agents</option>
                            <option value="overreaction">Overreaction Only</option>
                            <option value="contagion">Contagion Only</option>
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

                    {/* Starting Capital */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1.5">Starting Capital</label>
                        <input
                            value={startingCapital}
                            onChange={e => setStartingCapital(Number(e.target.value))}
                            type="number"
                            className="w-full px-3 py-2.5 bg-sentinel-950 border border-sentinel-800 rounded-lg text-sm font-mono text-sentinel-100 outline-none focus:border-purple-500/50"
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

                    {/* Run Button */}
                    <button
                        onClick={runTest}
                        disabled={loading}
                        className="flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer border-none shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
                        ) : (
                            <><Play className="w-4 h-4" /> Run Backtest</>
                        )}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                    <span className="text-sm text-red-300">{error}</span>
                </div>
            )}

            {/* Results */}
            {results && (
                <>
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {[
                            { label: 'Total Return', value: `${results.summary.totalReturnPct >= 0 ? '+' : ''}${results.summary.totalReturnPct.toFixed(2)}%`, sub: `$${results.summary.totalReturn.toFixed(0)}`, icon: DollarSign, color: results.summary.totalReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400' },
                            { label: 'Win Rate', value: `${results.summary.winRate.toFixed(1)}%`, sub: `${results.summary.winners}W / ${results.summary.losers}L`, icon: Target, color: results.summary.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400' },
                            { label: 'Sharpe Ratio', value: results.summary.sharpeRatio.toFixed(2), sub: 'Risk-adjusted', icon: Activity, color: results.summary.sharpeRatio >= 1 ? 'text-emerald-400' : results.summary.sharpeRatio >= 0 ? 'text-amber-400' : 'text-red-400' },
                            { label: 'Max Drawdown', value: `−${results.summary.maxDrawdownPct.toFixed(1)}%`, sub: `$${results.summary.maxDrawdown.toFixed(0)}`, icon: TrendingDown, color: 'text-red-400' },
                            { label: 'Profit Factor', value: results.summary.profitFactor === Infinity ? '∞' : results.summary.profitFactor.toFixed(2), sub: 'Win/Loss ratio', icon: Award, color: results.summary.profitFactor >= 1.5 ? 'text-emerald-400' : 'text-amber-400' },
                            { label: 'Total Trades', value: results.summary.totalTrades.toString(), sub: `Avg Win: ${results.summary.avgWin.toFixed(1)}%`, icon: BarChart3, color: 'text-blue-400' },
                        ].map(stat => (
                            <div key={stat.label} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-4 backdrop-blur-sm">
                                <div className="flex items-center gap-2 text-sentinel-400 text-xs uppercase tracking-wider mb-2">
                                    <stat.icon className="w-3.5 h-3.5" /> {stat.label}
                                </div>
                                <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                                <p className="text-xs text-sentinel-500 mt-1">{stat.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Equity Curve */}
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                        <h2 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-purple-400" /> Equity Curve
                        </h2>
                        <div className="overflow-x-auto">
                            <svg viewBox={`0 0 ${curveWidth} ${curveHeight}`} className="w-full h-48 md:h-64">
                                <defs>
                                    <linearGradient id="equityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor={results.summary.totalReturn >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0.3" />
                                        <stop offset="100%" stopColor={results.summary.totalReturn >= 0 ? '#10b981' : '#ef4444'} stopOpacity="0" />
                                    </linearGradient>
                                </defs>
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
                    </div>

                    {/* Trade Log */}
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm">
                        <div className="px-5 py-4 border-b border-sentinel-800/50">
                            <h2 className="text-sm font-semibold text-sentinel-200 uppercase tracking-wider flex items-center gap-2">
                                <Shield className="w-4 h-4 text-purple-400" /> Trade Log ({results.trades.length} trades)
                            </h2>
                        </div>
                        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-sentinel-900">
                                    <tr className="text-sentinel-400 text-xs uppercase tracking-wider border-b border-sentinel-800/30">
                                        <th className="px-4 py-2.5 text-left">#</th>
                                        <th className="px-4 py-2.5 text-left">Date</th>
                                        <th className="px-4 py-2.5 text-left">Ticker</th>
                                        <th className="px-4 py-2.5 text-left">Signal</th>
                                        <th className="px-4 py-2.5 text-right">Conf.</th>
                                        <th className="px-4 py-2.5 text-right">Entry</th>
                                        <th className="px-4 py-2.5 text-right">P&L %</th>
                                        <th className="px-4 py-2.5 text-right">P&L $</th>
                                        <th className="px-4 py-2.5 text-right">Equity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.trades.map((trade, i) => {
                                        const isWin = trade.pnl_usd > 0;
                                        return (
                                            <tr key={i} className="border-b border-sentinel-800/20 hover:bg-sentinel-800/20 transition-colors">
                                                <td className="px-4 py-2 text-sentinel-500 text-xs">{i + 1}</td>
                                                <td className="px-4 py-2 text-sentinel-300 text-xs font-mono">{trade.date ? new Date(trade.date).toLocaleDateString() : '—'}</td>
                                                <td className="px-4 py-2 font-mono font-bold text-sentinel-100">{trade.ticker}</td>
                                                <td className="px-4 py-2">
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/15 text-purple-400 uppercase">
                                                        {trade.signal_type.replace(/_/g, ' ')}
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
                                                <td className="px-4 py-2 text-right font-mono text-sentinel-200">${trade.equity_after.toFixed(0)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {/* Empty state (no results yet) */}
            {!results && !loading && !error && (
                <div className="bg-sentinel-900/30 rounded-xl border border-sentinel-800/30 p-16 text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-sentinel-950 pointer-events-none" />
                    <div className="relative z-10 max-w-lg mx-auto space-y-4">
                        <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto ring-1 ring-purple-500/20">
                            <BarChart3 className="w-8 h-8 text-purple-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-sentinel-200">Configure & Run</h3>
                        <p className="text-sm text-sentinel-500 leading-relaxed">
                            Set your parameters above and click "Run Backtest" to replay historical signal outcomes
                            and evaluate AI agent accuracy. The engine uses your real <code className="text-purple-400">signal_outcomes</code> data.
                        </p>
                        <div className="flex items-center justify-center gap-3 mt-4">
                            <span className="px-3 py-1 bg-sentinel-800/50 rounded text-xs text-sentinel-400 flex items-center gap-1.5">
                                <Percent className="w-3 h-3" /> Win Rate
                            </span>
                            <span className="px-3 py-1 bg-sentinel-800/50 rounded text-xs text-sentinel-400 flex items-center gap-1.5">
                                <Activity className="w-3 h-3" /> Sharpe Ratio
                            </span>
                            <span className="px-3 py-1 bg-sentinel-800/50 rounded text-xs text-sentinel-400 flex items-center gap-1.5">
                                <TrendingDown className="w-3 h-3" /> Max Drawdown
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
