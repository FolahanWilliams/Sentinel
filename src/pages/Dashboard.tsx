import { Activity, ArrowRight, Clock, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { ScannerService } from '@/services/scanner';
import { formatPrice } from '@/utils/formatters';
import { MarketSnapshot } from '@/components/dashboard/MarketSnapshot';
import { MarketTrends, PotentialSignals } from '@/components/dashboard/MarketTrends';
import { UpcomingEvents } from '@/components/dashboard/UpcomingEvents';
import { WeeklyDigest } from '@/components/dashboard/WeeklyDigest';
import { PortfolioOverview } from '@/components/dashboard/PortfolioOverview';
import { useScannerLogs } from '@/hooks/useScannerLogs';
import { motion, AnimatePresence } from 'framer-motion';

export function Dashboard() {
    const navigate = useNavigate();
    const [recentSignals, setRecentSignals] = useState<any[]>([]);
    const [loadingSignals, setLoadingSignals] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [scanStatus, setScanStatus] = useState<string | null>(null);
    const { logs } = useScannerLogs(1);

    // Compute dynamic "last scan" text
    const lastScanText = (() => {
        if (!logs || logs.length === 0) return 'No scans yet';
        const lastLog = logs[0];
        if (!lastLog) return 'No scans yet';
        const diffMs = Date.now() - new Date(lastLog.created_at).getTime();
        const diffMins = Math.floor(diffMs / 60_000);
        if (diffMins < 1) return 'Last scan: just now';
        if (diffMins < 60) return `Last scan: ${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `Last scan: ${diffHours}h ago`;
        return `Last scan: ${Math.floor(diffHours / 24)}d ago`;
    })();

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

        const channel = supabase.channel('recent_signals')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
                // Auto-prepend new signals hitting the DB from the scanner
                setRecentSignals(prev => [payload.new, ...prev].slice(0, 5));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [])

    const handleForceGlobalScan = useCallback(async () => {
        if (scanning) return;
        setScanning(true);
        setScanStatus('Discovering trending tickers via AI...');

        try {
            console.log('[Dashboard] Triggering AI Discovery Scan...');
            const result = await ScannerService.runDiscoveryScan(5, (status) => {
                setScanStatus(status);
            });

            if (result.discovered === 0) {
                setScanStatus('No trending tickers found right now. Try again later.');
            } else {
                setScanStatus(
                    `✅ Scanned ${result.scanned} AI-discovered tickers → ${result.signalsGenerated} signals generated (${result.tickers.join(', ')})`
                );
            }

            // Clear the status message after 8 seconds
            setTimeout(() => setScanStatus(null), 8000);
        } catch (err: any) {
            console.error('[Dashboard] Discovery scan failed:', err);
            setScanStatus(`❌ Scan failed: ${err.message}`);
            setTimeout(() => setScanStatus(null), 5000);
        } finally {
            setScanning(false);
        }
    }, [scanning]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100">
                        Intelligence Overview
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        System active • {lastScanText}
                    </p>
                </div>
                <button
                    onClick={handleForceGlobalScan}
                    disabled={scanning}
                    className="px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700 hover:ring-sentinel-600 flex items-center gap-2 w-fit disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {scanning ? (
                        <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                    ) : (
                        <Activity className="w-4 h-4 text-emerald-400" />
                    )}
                    {scanning ? 'Discovering...' : 'AI Discovery Scan'}
                </button>
            </div>

            {/* Discovery Scan Status Banner */}
            <AnimatePresence>
                {scanStatus && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -10, height: 0 }}
                        className="bg-sentinel-900/70 border border-sentinel-700/50 rounded-xl px-5 py-3.5 backdrop-blur-sm"
                    >
                        <div className="flex items-center gap-3">
                            {scanning && <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />}
                            <p className="text-sm text-sentinel-200 flex-1">{scanStatus}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* MAIN CONTENT GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* LEFT COLUMN: Market Snapshot & Portfolio */}
                <div className="xl:col-span-1 space-y-6">
                    <MarketSnapshot />
                    <PortfolioOverview />
                    <WeeklyDigest />
                </div>

                {/* MIDDLE COLUMN: Signal Feed */}
                <div className="xl:col-span-1 border-x border-sentinel-800/50 px-0 xl:px-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-sentinel-200">Recent Signals</h2>
                        {recentSignals.length > 0 && (
                            <button
                                onClick={() => {
                                    const firstTicker = recentSignals[0]?.ticker;
                                    if (firstTicker) navigate(`/analysis/${firstTicker}`);
                                }}
                                className="text-sm text-sentinel-400 hover:text-sentinel-100 transition-colors flex items-center gap-1 bg-transparent border-none cursor-pointer"
                            >
                                View all <ArrowRight className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="glass-panel rounded-xl overflow-hidden h-[800px] flex flex-col relative w-full">
                        <div className="absolute inset-0 bg-radial-glow opacity-20 pointer-events-none" />

                        <div className="relative z-10 flex-1 overflow-y-auto w-full">
                            {loadingSignals ? (
                                <div className="p-8 justify-center flex">
                                    <div className="w-6 h-6 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div>
                                </div>
                            ) : recentSignals.length === 0 ? (
                                <div className="p-8 text-center text-sentinel-400">
                                    No signals generated yet. The agents are watching.
                                </div>
                            ) : (
                                <div className="divide-y divide-sentinel-800/30">
                                    <AnimatePresence initial={false}>
                                        {recentSignals.map((signal, idx) => (
                                            <motion.div
                                                key={signal.id}
                                                initial={{ opacity: 0, y: -20, backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                                                animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(59, 130, 246, 0)' }}
                                                transition={{ duration: 0.5, delay: idx * 0.05 }}
                                                className="p-5 hover:bg-sentinel-800/40 transition-colors group cursor-pointer"
                                                onClick={() => navigate(`/analysis/${signal.ticker}`)}
                                            >
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-3">
                                                        <span className="px-2.5 py-1 bg-sentinel-800 text-sentinel-100 text-xs font-bold font-mono rounded ring-1 ring-sentinel-700 shadow-sm">
                                                            {signal.ticker}
                                                        </span>
                                                        <span className="text-sm font-medium text-sentinel-300 capitalize">
                                                            {signal.signal_type.replace('_', ' ')}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xs text-sentinel-500 flex items-center gap-1 font-mono">
                                                            <Clock className="w-3 h-3" />
                                                            {new Date(signal.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold font-mono rounded ring-1 ring-emerald-500/20">
                                                            {signal.confidence_score}% CONF
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-sentinel-400 leading-relaxed line-clamp-2">
                                                    {signal.thesis}
                                                </p>
                                                <div className="mt-4 flex items-center gap-6 text-[11px] text-sentinel-500 font-mono bg-sentinel-950/30 p-2.5 rounded-lg border border-sentinel-800/30 w-fit">
                                                    <div>ENT: <span className="text-sentinel-300">{formatPrice(signal.suggested_entry_low)} - {formatPrice(signal.suggested_entry_high)}</span></div>
                                                    <div>TGT: <span className="text-emerald-400">{formatPrice(signal.target_price)}</span></div>
                                                    <div>STP: <span className="text-red-400">{formatPrice(signal.stop_loss)}</span></div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Trends & Events*/}
                <div className="xl:col-span-1 space-y-6">
                    <MarketTrends />
                    <PotentialSignals />
                    <UpcomingEvents />
                </div>
            </div>
        </div>
    );
}
