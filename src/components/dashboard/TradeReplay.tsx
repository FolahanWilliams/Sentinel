/**
 * TradeReplay — Visualizes historical signal outcomes by replaying the price
 * path alongside entry, stop-loss, and target reference lines.
 *
 * Data sources:
 * - Signals with outcomes: Supabase `signals` table (closed/triggered statuses)
 * - Historical prices: proxy-market-data Edge Function (`historical` endpoint)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ReferenceLine,
    ResponsiveContainer,
    Dot,
} from 'recharts';
import { Play, ChevronDown, TrendingUp, TrendingDown, Clock, Target, ShieldAlert } from 'lucide-react';
import { supabase } from '@/config/supabase';
import type { Signal, SignalStatus } from '@/types/signals';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HistoricalBar {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface SignalSummary {
    id: string;
    ticker: string;
    signal_type: string;
    bias_type: string;
    status: SignalStatus;
    suggested_entry_low: number | null;
    suggested_entry_high: number | null;
    stop_loss: number | null;
    target_price: number | null;
    created_at: string;
    updated_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const CLOSED_STATUSES: SignalStatus[] = ['stopped_out', 'target_hit', 'manually_closed', 'expired', 'triggered'];

function daysBetween(a: string, b: string): number {
    const msPerDay = 86_400_000;
    return Math.round((new Date(b).getTime() - new Date(a).getTime()) / msPerDay);
}

function formatSignalType(type: string): string {
    return type
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TradeReplay() {
    const [signals, setSignals] = useState<SignalSummary[]>([]);
    const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
    const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
    const [bars, setBars] = useState<HistoricalBar[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingSignals, setLoadingSignals] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // ── Fetch closed signals for the dropdown ──
    useEffect(() => {
        async function fetchSignals() {
            setLoadingSignals(true);
            try {
                const { data, error: fetchErr } = await supabase
                    .from('signals')
                    .select('id, ticker, signal_type, bias_type, status, suggested_entry_low, suggested_entry_high, stop_loss, target_price, created_at, updated_at')
                    .in('status', CLOSED_STATUSES)
                    .order('updated_at', { ascending: false })
                    .limit(50);

                if (fetchErr) throw fetchErr;
                setSignals((data as SignalSummary[]) || []);
            } catch (err) {
                console.error('[TradeReplay] Failed to fetch signals:', err);
            } finally {
                setLoadingSignals(false);
            }
        }
        fetchSignals();
    }, []);

    // ── Fetch full signal + historical bars when selection changes ──
    const loadReplay = useCallback(async (signalId: string) => {
        setLoading(true);
        setError(null);
        setBars([]);
        setSelectedSignal(null);

        try {
            // Fetch the full signal row
            const { data: sigData, error: sigErr } = await supabase
                .from('signals')
                .select('*')
                .eq('id', signalId)
                .single();

            if (sigErr || !sigData) throw new Error(sigErr?.message || 'Signal not found');
            const signal = sigData as Signal;
            setSelectedSignal(signal);

            // Fetch historical prices via proxy-market-data
            const { data: histData, error: histErr } = await supabase.functions.invoke('proxy-market-data', {
                body: { endpoint: 'historical', ticker: signal.ticker },
            });

            if (histErr || !histData?.success) {
                throw new Error(histData?.error || histErr?.message || 'Failed to fetch historical prices');
            }

            const allBars: HistoricalBar[] = histData.data || [];

            // Trim bars to the relevant window: 5 days before signal creation to
            // 5 days after signal close (or end of available data)
            const signalDate = signal.created_at.split('T')[0];
            const closeDate = signal.updated_at.split('T')[0];

            const startIdx = Math.max(0, allBars.findIndex(b => b.date >= signalDate) - 5);
            const endIdx = (() => {
                const closeIdx = allBars.findIndex(b => b.date >= closeDate);
                return closeIdx >= 0 ? Math.min(allBars.length, closeIdx + 6) : allBars.length;
            })();

            setBars(allBars.slice(startIdx, endIdx));
        } catch (err: any) {
            console.error('[TradeReplay] Load error:', err);
            setError(err.message || 'Failed to load replay data');
        } finally {
            setLoading(false);
        }
    }, []);

    // Trigger load when selection changes
    useEffect(() => {
        if (selectedSignalId) {
            loadReplay(selectedSignalId);
        }
    }, [selectedSignalId, loadReplay]);

    // ── Derived values ──
    const entryPrice = useMemo(() => {
        if (!selectedSignal) return null;
        const { suggested_entry_low, suggested_entry_high } = selectedSignal;
        if (suggested_entry_low != null && suggested_entry_high != null) {
            return (suggested_entry_low + suggested_entry_high) / 2;
        }
        return suggested_entry_low ?? suggested_entry_high ?? null;
    }, [selectedSignal]);

    const exitPrice = useMemo(() => {
        if (!bars.length) return null;
        return bars[bars.length - 1].close;
    }, [bars]);

    const pnlPct = useMemo(() => {
        if (entryPrice == null || exitPrice == null || entryPrice === 0) return null;
        return ((exitPrice - entryPrice) / entryPrice) * 100;
    }, [entryPrice, exitPrice]);

    const durationDays = useMemo(() => {
        if (!selectedSignal) return null;
        return daysBetween(selectedSignal.created_at, selectedSignal.updated_at);
    }, [selectedSignal]);

    const isWin = useMemo(() => {
        if (!selectedSignal) return null;
        if (selectedSignal.status === 'target_hit') return true;
        if (selectedSignal.status === 'stopped_out') return false;
        if (pnlPct != null) return pnlPct > 0;
        return null;
    }, [selectedSignal, pnlPct]);

    // Signal creation date for chart annotation
    const signalDate = selectedSignal?.created_at.split('T')[0] ?? null;

    // Y-axis domain: include entry/stop/target in range
    const yDomain = useMemo(() => {
        if (!bars.length) return [0, 100] as [number, number];
        const prices = bars.map(b => b.close);
        const extras = [entryPrice, selectedSignal?.stop_loss, selectedSignal?.target_price].filter(
            (v): v is number => v != null
        );
        const allValues = [...prices, ...extras];
        const min = Math.min(...allValues);
        const max = Math.max(...allValues);
        const padding = (max - min) * 0.08 || 1;
        return [min - padding, max + padding] as [number, number];
    }, [bars, entryPrice, selectedSignal]);

    // ── Custom dot for the signal creation date ──
    const renderDot = useCallback(
        (props: any) => {
            const { cx, cy, payload } = props;
            if (payload?.date === signalDate) {
                return (
                    <Dot
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill="#a78bfa"
                        stroke="#1e1b4b"
                        strokeWidth={2}
                    />
                );
            }
            return <Dot cx={cx} cy={cy} r={0} fill="transparent" />;
        },
        [signalDate]
    );

    // ── Render ──
    return (
        <div className="glass-panel p-6 rounded-xl space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Play className="w-5 h-5 text-sentinel-300" />
                    <h3 className="text-lg font-semibold text-sentinel-100">Trade Replay</h3>
                </div>
            </div>

            {/* Signal Selector */}
            <div className="relative">
                <button
                    onClick={() => setDropdownOpen(o => !o)}
                    disabled={loadingSignals}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-sentinel-900/60 hover:bg-sentinel-800/60 border border-sentinel-700/40 rounded-lg text-sm text-sentinel-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <span>
                        {loadingSignals
                            ? 'Loading signals...'
                            : selectedSignalId
                                ? (() => {
                                    const s = signals.find(s => s.id === selectedSignalId);
                                    return s
                                        ? `${s.ticker} — ${formatSignalType(s.signal_type)} (${formatDate(s.created_at)})`
                                        : 'Select a signal...';
                                })()
                                : signals.length === 0
                                    ? 'No closed signals found'
                                    : 'Select a signal to replay...'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-sentinel-500 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && signals.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-sentinel-900 border border-sentinel-700/50 rounded-lg shadow-xl">
                        {signals.map(s => (
                            <button
                                key={s.id}
                                onClick={() => {
                                    setSelectedSignalId(s.id);
                                    setDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-sentinel-800/60 transition-colors cursor-pointer border-none ${
                                    s.id === selectedSignalId ? 'bg-sentinel-800/40 text-sentinel-100' : 'text-sentinel-300'
                                }`}
                            >
                                <span className="font-medium">{s.ticker}</span>
                                <span className="text-xs text-sentinel-500">
                                    {formatSignalType(s.signal_type)} &middot; {formatDate(s.created_at)} &middot;{' '}
                                    <span
                                        className={
                                            s.status === 'target_hit'
                                                ? 'text-emerald-400'
                                                : s.status === 'stopped_out'
                                                    ? 'text-red-400'
                                                    : 'text-sentinel-400'
                                        }
                                    >
                                        {s.status.replace(/_/g, ' ')}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Loading / Error states */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="w-6 h-6 border-2 border-sentinel-500 border-t-sentinel-200 rounded-full animate-spin" />
                    <span className="ml-3 text-sm text-sentinel-400">Loading replay data...</span>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                    <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {/* Empty state */}
            {!loading && !error && !selectedSignalId && (
                <p className="text-sm text-sentinel-500 text-center py-12">
                    Select a closed signal above to replay its price action with entry, stop, and target levels.
                </p>
            )}

            {/* Chart */}
            {!loading && !error && selectedSignal && bars.length > 0 && (
                <>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={bars} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.08)" />
                                <XAxis
                                    dataKey="date"
                                    tickFormatter={formatDate}
                                    tick={{ fill: '#64748b', fontSize: 11 }}
                                    axisLine={{ stroke: 'rgba(148, 163, 184, 0.15)' }}
                                    tickLine={false}
                                />
                                <YAxis
                                    domain={yDomain}
                                    tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                                    tick={{ fill: '#64748b', fontSize: 11 }}
                                    axisLine={{ stroke: 'rgba(148, 163, 184, 0.15)' }}
                                    tickLine={false}
                                    width={52}
                                />
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(15, 17, 25, 0.95)',
                                        border: '1px solid rgba(148, 163, 184, 0.15)',
                                        borderRadius: '8px',
                                        fontSize: '12px',
                                    }}
                                    labelStyle={{ color: '#94a3b8' }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                    formatter={(value: number) => [`$${value.toFixed(2)}`, 'Close']}
                                    labelFormatter={formatDate}
                                />

                                {/* Entry price reference line */}
                                {entryPrice != null && (
                                    <ReferenceLine
                                        y={entryPrice}
                                        stroke="#93c5fd"
                                        strokeDasharray="6 3"
                                        strokeWidth={1.5}
                                        label={{
                                            value: `Entry $${entryPrice.toFixed(2)}`,
                                            position: 'right',
                                            fill: '#93c5fd',
                                            fontSize: 11,
                                        }}
                                    />
                                )}

                                {/* Stop loss reference line */}
                                {selectedSignal.stop_loss != null && (
                                    <ReferenceLine
                                        y={selectedSignal.stop_loss}
                                        stroke="#f87171"
                                        strokeDasharray="4 4"
                                        strokeWidth={1.5}
                                        label={{
                                            value: `Stop $${selectedSignal.stop_loss.toFixed(2)}`,
                                            position: 'right',
                                            fill: '#f87171',
                                            fontSize: 11,
                                        }}
                                    />
                                )}

                                {/* Target price reference line */}
                                {selectedSignal.target_price != null && (
                                    <ReferenceLine
                                        y={selectedSignal.target_price}
                                        stroke="#34d399"
                                        strokeDasharray="4 4"
                                        strokeWidth={1.5}
                                        label={{
                                            value: `Target $${selectedSignal.target_price.toFixed(2)}`,
                                            position: 'right',
                                            fill: '#34d399',
                                            fontSize: 11,
                                        }}
                                    />
                                )}

                                {/* Signal creation date vertical line */}
                                {signalDate && bars.some(b => b.date === signalDate) && (
                                    <ReferenceLine
                                        x={signalDate}
                                        stroke="#a78bfa"
                                        strokeDasharray="4 4"
                                        strokeWidth={1}
                                        label={{
                                            value: 'Signal',
                                            position: 'top',
                                            fill: '#a78bfa',
                                            fontSize: 10,
                                        }}
                                    />
                                )}

                                {/* Price line */}
                                <Line
                                    type="monotone"
                                    dataKey="close"
                                    stroke="#c4b5fd"
                                    strokeWidth={2}
                                    dot={renderDot}
                                    activeDot={{ r: 4, fill: '#c4b5fd', stroke: '#1e1b4b', strokeWidth: 2 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Outcome Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-sentinel-800/50">
                        {/* Signal Type + Bias */}
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-sentinel-500">Type</p>
                            <p className="text-sm font-medium text-sentinel-200">
                                {formatSignalType(selectedSignal.signal_type)}
                            </p>
                            <p className="text-xs text-sentinel-400">{selectedSignal.bias_type.replace(/_/g, ' ')}</p>
                        </div>

                        {/* Entry -> Exit */}
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-sentinel-500">Entry / Exit</p>
                            <p className="text-sm font-medium text-sentinel-200">
                                {entryPrice != null ? `$${entryPrice.toFixed(2)}` : '--'}
                                <span className="text-sentinel-600 mx-1">&rarr;</span>
                                {exitPrice != null ? `$${exitPrice.toFixed(2)}` : '--'}
                            </p>
                        </div>

                        {/* P&L */}
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-sentinel-500">P&L</p>
                            <div className="flex items-center gap-1.5">
                                {pnlPct != null ? (
                                    <>
                                        {pnlPct >= 0 ? (
                                            <TrendingUp className="w-4 h-4 text-emerald-400" />
                                        ) : (
                                            <TrendingDown className="w-4 h-4 text-red-400" />
                                        )}
                                        <span
                                            className={`text-sm font-bold font-mono ${
                                                pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                                            }`}
                                        >
                                            {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-sm text-sentinel-500">--</span>
                                )}
                            </div>
                        </div>

                        {/* Duration */}
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-sentinel-500">Duration</p>
                            <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-sentinel-400" />
                                <span className="text-sm text-sentinel-200">
                                    {durationDays != null ? `${durationDays}d` : '--'}
                                </span>
                            </div>
                        </div>

                        {/* Win/Loss Badge */}
                        <div className="space-y-1">
                            <p className="text-[10px] uppercase tracking-wider text-sentinel-500">Result</p>
                            {isWin != null ? (
                                <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                                        isWin
                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                            : 'bg-red-500/15 text-red-400 border border-red-500/30'
                                    }`}
                                >
                                    <Target className="w-3 h-3" />
                                    {isWin ? 'Win' : 'Loss'}
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-sentinel-800/50 text-sentinel-400 border border-sentinel-700/30">
                                    {selectedSignal.status.replace(/_/g, ' ')}
                                </span>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
