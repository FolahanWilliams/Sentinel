/**
 * Scanner — Full scanner control page with status, logs, and Budget Widget.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { ScannerService } from '@/services/scanner';
import { getBudgetSummary } from '@/utils/costEstimator';
import {
    Activity, Play, Pause, RefreshCw, Clock, AlertCircle,
    DollarSign, BarChart3, Zap, CheckCircle2, XCircle
} from 'lucide-react';
import { LoadingState } from '@/components/shared/LoadingState';

interface ScanLog {
    id: string;
    scan_type: string;
    status: string;
    tickers_scanned: number;
    events_detected: number;
    signals_generated: number;
    duration_ms: number;
    error_message: string | null;
    created_at: string;
}

interface BudgetData {
    dailySpend: number;
    dailyBudget: number;
    dailyPct: number;
    monthlySpend: number;
    monthlyBudget: number;
    monthlyPct: number;
    callCounts: Record<string, number>;
    totalCalls: number;
    avgCostPerCall: number;
    isExceeded: boolean;
}

export function Scanner() {
    const [scanning, setScanning] = useState(false);
    const [scanResult, setScanResult] = useState<string | null>(null);
    const [logs, setLogs] = useState<ScanLog[]>([]);
    const [budget, setBudget] = useState<BudgetData | null>(null);
    const [loading, setLoading] = useState(true);
    const [autoScan, setAutoScan] = useState(false);

    const fetchData = useCallback(async () => {
        const [logsResult, budgetResult] = await Promise.all([
            supabase
                .from('scan_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(15),
            getBudgetSummary(),
        ]);

        if (logsResult.data) setLogs(logsResult.data as ScanLog[]);
        setBudget(budgetResult);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    async function runManualScan() {
        setScanning(true);
        setScanResult(null);
        try {
            const result = await ScannerService.runScan('full');
            setScanResult(result.success ? result.summary || 'Scan completed.' : `Error: ${result.error}`);
            await fetchData();
        } catch (err: any) {
            setScanResult(`Fatal: ${err.message}`);
        } finally {
            setScanning(false);
        }
    }

    if (loading) return <LoadingState message="Loading scanner..." />;

    const lastScan = logs[0];
    const completedScans = logs.filter(l => l.status === 'completed');
    const avgDuration = completedScans.length > 0
        ? Math.round(completedScans.reduce((s, l) => s + l.duration_ms, 0) / completedScans.length)
        : 0;
    const totalSignals = completedScans.reduce((s, l) => s + l.signals_generated, 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <Zap className="w-8 h-8 text-yellow-400" /> Scanner Control
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Monitor and control the intelligence scanning pipeline.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setAutoScan(!autoScan)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ring-1 ${autoScan
                            ? 'bg-emerald-600/20 text-emerald-400 ring-emerald-500/30 hover:bg-emerald-600/30'
                            : 'bg-sentinel-800 text-sentinel-300 ring-sentinel-700 hover:bg-sentinel-700'
                            }`}
                    >
                        {autoScan ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {autoScan ? 'Auto: ON' : 'Auto: OFF'}
                    </button>
                    <button
                        onClick={runManualScan}
                        disabled={scanning}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        {scanning ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        Run Scan
                    </button>
                </div>
            </div>

            {/* Scan result toast */}
            {scanResult && (
                <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${scanResult.startsWith('Error') || scanResult.startsWith('Fatal')
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                    {scanResult.startsWith('Error') || scanResult.startsWith('Fatal')
                        ? <XCircle className="w-4 h-4" />
                        : <CheckCircle2 className="w-4 h-4" />}
                    {scanResult}
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                    title="Last Scan"
                    value={lastScan ? `${(lastScan.duration_ms / 1000).toFixed(1)}s` : '--'}
                    subtitle={lastScan ? new Date(lastScan.created_at).toLocaleTimeString() : 'Never'}
                    icon={<Clock className="w-5 h-5 text-blue-400" />}
                />
                <KPICard
                    title="Avg Duration"
                    value={avgDuration > 0 ? `${(avgDuration / 1000).toFixed(1)}s` : '--'}
                    subtitle={`${completedScans.length} scans completed`}
                    icon={<Activity className="w-5 h-5 text-purple-400" />}
                />
                <KPICard
                    title="Signals Generated"
                    value={totalSignals.toString()}
                    subtitle="From recent scans"
                    icon={<BarChart3 className="w-5 h-5 text-emerald-400" />}
                />
                <KPICard
                    title="Status"
                    value={lastScan?.status === 'completed' ? 'Healthy' : lastScan?.status === 'failed' ? 'Error' : 'Idle'}
                    subtitle={lastScan?.error_message || 'All systems normal'}
                    icon={<AlertCircle className={`w-5 h-5 ${lastScan?.status === 'failed' ? 'text-red-400' : 'text-emerald-400'}`} />}
                    valueColor={lastScan?.status === 'failed' ? 'text-red-400' : 'text-emerald-400'}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Scan Logs */}
                <div className="lg:col-span-2">
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm">
                        <div className="p-4 border-b border-sentinel-800/50">
                            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider">Scan History</h3>
                        </div>
                        {logs.length === 0 ? (
                            <div className="p-8 text-center text-sentinel-500">
                                No scan logs yet. Run your first scan.
                            </div>
                        ) : (
                            <div className="divide-y divide-sentinel-800/50">
                                {logs.map(log => (
                                    <div key={log.id} className="px-4 py-3 hover:bg-sentinel-800/20 transition-colors">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-2 h-2 rounded-full ${log.status === 'completed' ? 'bg-emerald-400' : log.status === 'failed' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`} />
                                                <span className="text-sm text-sentinel-200 capitalize">{log.scan_type} Scan</span>
                                                <span className={`px-2 py-0.5 text-xs rounded font-medium ${log.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' : log.status === 'failed' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                                    {log.status}
                                                </span>
                                            </div>
                                            <span className="text-xs text-sentinel-600">
                                                {new Date(log.created_at).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex gap-6 text-xs text-sentinel-500 ml-5">
                                            <span>{log.tickers_scanned} tickers</span>
                                            <span>{log.events_detected} events</span>
                                            <span className={log.signals_generated > 0 ? 'text-emerald-400 font-semibold' : ''}>{log.signals_generated} signals</span>
                                            <span>{(log.duration_ms / 1000).toFixed(1)}s</span>
                                        </div>
                                        {log.error_message && (
                                            <p className="text-xs text-red-400 mt-1 ml-5">{log.error_message}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Budget Widget */}
                <div className="space-y-6">
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-amber-400" /> API Budget
                        </h3>

                        {budget ? (
                            <div className="space-y-4">
                                {/* Daily */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-sentinel-400">Today</span>
                                        <span className="text-sentinel-300 font-mono">
                                            ${budget.dailySpend.toFixed(4)} / ${budget.dailyBudget.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-sentinel-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${budget.dailyPct}%`,
                                                backgroundColor: budget.dailyPct > 80 ? '#EF4444' : budget.dailyPct > 50 ? '#F59E0B' : '#22C55E',
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Monthly */}
                                <div>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-sentinel-400">This Month</span>
                                        <span className="text-sentinel-300 font-mono">
                                            ${budget.monthlySpend.toFixed(4)} / ${budget.monthlyBudget.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-sentinel-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{
                                                width: `${budget.monthlyPct}%`,
                                                backgroundColor: budget.monthlyPct > 80 ? '#EF4444' : budget.monthlyPct > 50 ? '#F59E0B' : '#22C55E',
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Call counts */}
                                <div className="pt-3 border-t border-sentinel-800/50 space-y-2">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-sentinel-400">Total Calls Today</span>
                                        <span className="text-sentinel-200 font-mono">{budget.totalCalls}</span>
                                    </div>
                                    {Object.entries(budget.callCounts).map(([provider, count]) => (
                                        <div key={provider} className="flex justify-between text-xs">
                                            <span className="text-sentinel-500 capitalize">{provider.replace(/_/g, ' ')}</span>
                                            <span className="text-sentinel-400 font-mono">{count}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between text-xs pt-2 border-t border-sentinel-800/30">
                                        <span className="text-sentinel-400">Avg Cost / Call</span>
                                        <span className="text-sentinel-200 font-mono">${budget.avgCostPerCall.toFixed(4)}</span>
                                    </div>
                                </div>

                                {/* Warning */}
                                {budget.isExceeded && (
                                    <div className="p-2 bg-red-500/10 rounded-lg border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                                        <AlertCircle className="w-3 h-3" />
                                        Daily budget exceeded. Scanning paused.
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-sentinel-500">Loading budget data...</p>
                        )}
                    </div>

                    {/* Scanner Config */}
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4">Configuration</h3>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span className="text-sentinel-400">Scan Interval</span>
                                <span className="text-sentinel-200">5 min</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sentinel-400">Min Confidence</span>
                                <span className="text-sentinel-200">60%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sentinel-400">Min Price Drop</span>
                                <span className="text-sentinel-200">-5%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sentinel-400">RSS Feeds</span>
                                <span className="text-emerald-400">42 Active</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-sentinel-400">Gemini Model</span>
                                <span className="text-sentinel-200">gemini-3-flash</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KPICard({ title, value, subtitle, icon, valueColor = 'text-sentinel-100' }: {
    title: string;
    value: string;
    subtitle: string;
    icon: React.ReactNode;
    valueColor?: string;
}) {
    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-medium text-sentinel-400">{title}</span>
                <div className="p-2 bg-sentinel-800 rounded-lg ring-1 ring-sentinel-700">{icon}</div>
            </div>
            <div className={`text-2xl font-bold font-display ${valueColor}`}>{value}</div>
            <p className="text-xs text-sentinel-500 mt-1 truncate">{subtitle}</p>
        </div>
    );
}
