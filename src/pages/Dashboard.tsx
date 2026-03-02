import { Activity, ArrowRight, Clock, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { formatPrice } from '@/utils/formatters';
import { MarketSnapshot } from '@/components/dashboard/MarketSnapshot';
import { MarketTrends, PotentialSignals } from '@/components/dashboard/MarketTrends';
import { UpcomingEvents } from '@/components/dashboard/UpcomingEvents';
import { WeeklyDigest } from '@/components/dashboard/WeeklyDigest';
import { PortfolioOverview } from '@/components/dashboard/PortfolioOverview';
import { useScannerLogs } from '@/hooks/useScannerLogs';

export function Dashboard() {
    const navigate = useNavigate();
    const [recentSignals, setRecentSignals] = useState<any[]>([]);
    const [loadingSignals, setLoadingSignals] = useState(true);
    const [scanning, setScanning] = useState(false);
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
        try {
            console.log('[Dashboard] Triggering force global scan...');
            await supabase.functions.invoke('proxy-gemini', {
                body: {
                    systemInstruction: 'You are a market scanner. List 3 trending stock tickers worth analyzing today based on current market conditions.',
                    prompt: 'What are the top 3 most interesting tickers to scan right now? Return JSON array of ticker symbols only.',
                    requireGroundedSearch: true,
                }
            });
            // The scanner's real-time subscription in useEffect will pick up new signals automatically
        } catch (err) {
            console.error('[Dashboard] Force scan failed:', err);
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
                    {scanning ? 'Scanning...' : 'Force Global Scan'}
                </button>
            </div>

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

                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 backdrop-blur-sm overflow-hidden h-[800px] overflow-y-auto">
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
                                    <div
                                        key={signal.id}
                                        className="p-4 hover:bg-sentinel-800/30 transition-colors group cursor-pointer"
                                        onClick={() => navigate(`/analysis/${signal.ticker}`)}
                                    >
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
                                                    {signal.confidence_score}% CONF
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-sm text-sentinel-400 line-clamp-2">
                                            {signal.thesis}
                                        </p>
                                        <div className="mt-4 flex items-center gap-6 text-[10px] text-sentinel-500 font-mono">
                                            <div>ENT: <span className="text-sentinel-300">{formatPrice(signal.suggested_entry_low)} - {formatPrice(signal.suggested_entry_high)}</span></div>
                                            <div>TGT: <span className="text-emerald-400">{formatPrice(signal.target_price)}</span></div>
                                            <div>STP: <span className="text-red-400">{formatPrice(signal.stop_loss)}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
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
