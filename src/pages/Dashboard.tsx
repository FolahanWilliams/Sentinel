import { Activity, ArrowRight, Clock, Loader2, BookOpen } from 'lucide-react';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { ScannerService } from '@/services/scanner';
import { formatPrice } from '@/utils/formatters';
import { TABadge } from '@/components/shared/TABadge';
import { MarketSnapshot } from '@/components/dashboard/MarketSnapshot';
import { MarketTrends, PotentialSignals } from '@/components/dashboard/MarketTrends';
import { UpcomingEvents } from '@/components/dashboard/UpcomingEvents';
import { WeeklyDigest } from '@/components/dashboard/WeeklyDigest';
import { PortfolioOverview } from '@/components/dashboard/PortfolioOverview';
import { PortfolioSimulator } from '@/components/dashboard/PortfolioSimulator';
import { SectorHeatMap } from '@/components/dashboard/SectorHeatMap';
import { NewsFeed } from '@/components/dashboard/NewsFeed';
import { GlassMaterialize } from '@/components/shared/GlassMaterialize';
import { useScannerLogs } from '@/hooks/useScannerLogs';
import { SkeletonSignalFeed } from '@/components/shared/SkeletonPrimitives';
import { EmptyState } from '@/components/shared/EmptyState';
import { SignalFilterBar } from '@/components/signals/SignalFilterBar';
import { applySignalFilters } from '@/utils/signalFilters';
import type { SignalFilters } from '@/utils/signalFilters';
import { motion, AnimatePresence } from 'framer-motion';

export function Dashboard() {
    const navigate = useNavigate();
    const [recentSignals, setRecentSignals] = useState<any[]>([]);
    const [loadingSignals, setLoadingSignals] = useState(true);
    const [scanning, setScanning] = useState(false);
    const [scanStatus, setScanStatus] = useState<string | null>(null);
    const { logs } = useScannerLogs(1);
    const [signalFilters, setSignalFilters] = useState<SignalFilters>({
        sector: 'All Sectors', minConfidence: 0, signalType: 'all', bias: 'all', confluenceOnly: false,
    });

    const filteredSignals = useMemo(
        () => applySignalFilters(recentSignals, signalFilters),
        [recentSignals, signalFilters]
    );

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
                <div className="xl:col-span-1 space-y-6 flex flex-col min-h-[600px]">
                    <GlassMaterialize delay={0}><MarketSnapshot /></GlassMaterialize>
                    <GlassMaterialize delay={50}><PortfolioSimulator /></GlassMaterialize>
                    <GlassMaterialize delay={100}><PortfolioOverview /></GlassMaterialize>
                    <GlassMaterialize delay={150}><WeeklyDigest /></GlassMaterialize>
                </div>

                {/* MIDDLE COLUMN: Signal Feed */}
                <div className="xl:col-span-1 border-x border-sentinel-800/50 px-0 xl:px-6 flex flex-col min-h-[600px]">
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

                    {/* Signal Filters */}
                    {recentSignals.length > 0 && (
                        <div className="mb-3">
                            <SignalFilterBar
                                filters={signalFilters}
                                onChange={setSignalFilters}
                                totalCount={recentSignals.length}
                                filteredCount={filteredSignals.length}
                            />
                        </div>
                    )}

                    <div className="glass-panel rounded-xl overflow-hidden h-[800px] flex flex-col relative w-full">
                        <div className="absolute inset-0 bg-radial-glow opacity-20 pointer-events-none" />

                        <div className="relative z-10 flex-1 overflow-y-auto w-full">
                            {loadingSignals ? (
                                <SkeletonSignalFeed count={4} />
                            ) : recentSignals.length > 0 && filteredSignals.length === 0 ? (
                                <EmptyState
                                    icon={<Activity className="w-8 h-8 text-amber-400" />}
                                    title="No matching signals"
                                    description="Try adjusting your filters to see more results."
                                    action={
                                        <button
                                            onClick={() => setSignalFilters({ sector: 'All Sectors', minConfidence: 0, signalType: 'all', bias: 'all', confluenceOnly: false })}
                                            className="mt-2 px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-xl text-sm font-medium transition-colors ring-1 ring-sentinel-700 cursor-pointer border-none"
                                        >
                                            Clear Filters
                                        </button>
                                    }
                                />
                            ) : recentSignals.length === 0 ? (
                                <EmptyState
                                    icon={<Activity className="w-8 h-8 text-blue-400" />}
                                    title="No signals yet"
                                    description="The AI agents are monitoring markets. Signals will appear here as they're generated."
                                    action={
                                        <button
                                            onClick={handleForceGlobalScan}
                                            disabled={scanning}
                                            className="mt-2 px-5 py-2.5 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-xl text-sm font-medium transition-colors ring-1 ring-sentinel-700 hover:ring-sentinel-600 flex items-center gap-2"
                                        >
                                            <Activity className="w-4 h-4 text-emerald-400" /> Run Discovery Scan
                                        </button>
                                    }
                                />
                            ) : (
                                <div className="divide-y divide-sentinel-800/30">
                                    <AnimatePresence initial={false}>
                                        {filteredSignals.map((signal, idx) => (
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
                                                        {signal.ta_alignment && (
                                                            <TABadge
                                                                taAlignment={signal.ta_alignment}
                                                                taSnapshot={signal.ta_snapshot}
                                                                compact
                                                            />
                                                        )}
                                                        <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold font-mono rounded ring-1 ring-emerald-500/20">
                                                            {signal.confidence_score}% CONF
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-sm text-sentinel-400 leading-relaxed line-clamp-2">
                                                    {signal.thesis}
                                                </p>

                                                {/* Confluence + Projected ROI badges */}
                                                {(signal.confluence_level || signal.projected_roi != null) && (
                                                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                        {signal.confluence_level && signal.confluence_level !== 'none' && (
                                                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${
                                                                signal.confluence_level === 'strong'
                                                                    ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                                                                    : signal.confluence_level === 'moderate'
                                                                    ? 'bg-blue-500/15 text-blue-400 ring-blue-500/30'
                                                                    : 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
                                                            }`}>
                                                                {signal.confluence_level.toUpperCase()} CONFLUENCE
                                                            </span>
                                                        )}
                                                        {signal.projected_roi != null && (
                                                            <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${
                                                                signal.projected_roi > 0
                                                                    ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                                                    : 'bg-red-500/10 text-red-400 ring-red-500/20'
                                                            }`}>
                                                                Est. ROI {signal.projected_roi > 0 ? '+' : ''}{signal.projected_roi}%
                                                                {signal.projected_win_rate != null && ` (${signal.projected_win_rate}% WR`}
                                                                {signal.similar_events_count != null && `, ${signal.similar_events_count} similar)`}
                                                                {signal.projected_win_rate != null && !signal.similar_events_count && ')'}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="mt-3 flex items-center justify-between">
                                                    <div className="flex items-center gap-6 text-[11px] text-sentinel-500 font-mono bg-sentinel-950/30 p-2.5 rounded-lg border border-sentinel-800/30 w-fit">
                                                        <div>ENT: <span className="text-sentinel-300">{formatPrice(signal.suggested_entry_low)} - {formatPrice(signal.suggested_entry_high)}</span></div>
                                                        <div>TGT: <span className="text-emerald-400">{formatPrice(signal.target_price)}</span></div>
                                                        <div>STP: <span className="text-red-400">{formatPrice(signal.stop_loss)}</span></div>
                                                    </div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate(`/journal?ticker=${signal.ticker}&thesis=${encodeURIComponent(signal.thesis?.slice(0, 200) || '')}&entry=${signal.suggested_entry_low || ''}&target=${signal.target_price || ''}&stop=${signal.stop_loss || ''}`);
                                                        }}
                                                        className="px-2.5 py-1.5 bg-sentinel-800/50 hover:bg-sentinel-700/50 text-sentinel-400 hover:text-sentinel-200 rounded-lg text-[10px] font-medium transition-colors flex items-center gap-1 opacity-0 group-hover:opacity-100 cursor-pointer border-none"
                                                        title="Log trade to journal"
                                                    >
                                                        <BookOpen className="w-3 h-3" /> Log Trade
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Trends, Sector Heat Map & Events*/}
                <div className="xl:col-span-1 space-y-6 flex flex-col min-h-[600px]">
                    <GlassMaterialize delay={50}><SectorHeatMap /></GlassMaterialize>
                    <GlassMaterialize delay={100}><MarketTrends /></GlassMaterialize>
                    <GlassMaterialize delay={150}><PotentialSignals /></GlassMaterialize>
                    <GlassMaterialize delay={200}><NewsFeed limit={8} /></GlassMaterialize>
                    <GlassMaterialize delay={250}><UpcomingEvents /></GlassMaterialize>
                </div>
            </div>
        </div>
    );
}
