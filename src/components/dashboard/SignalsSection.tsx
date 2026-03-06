/**
 * Sentinel — AI Signals Tab
 *
 * Displays all active signals in a responsive grid with full thesis,
 * confluence badges, projected ROI, TA alignment, and position sizing.
 * Supports filtering by confidence, impact, direction, and sorting by projected ROI.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';
import { ScannerService } from '@/services/scanner';
import { formatPrice, formatPercent, timeAgo } from '@/utils/formatters';
import { TABadge } from '@/components/shared/TABadge';
import { SkeletonSignalFeed } from '@/components/shared/SkeletonPrimitives';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import {
    Activity, BookOpen, Clock, Filter, Loader2, RefreshCw,
    TrendingUp, ChevronDown, ChevronUp, X, Calculator, Shield,
    XCircle, MessageSquare, CheckCircle2, BarChart3, Newspaper, Radar,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePortfolio } from '@/hooks/usePortfolio';
import type { Signal, ConfluenceLevel } from '@/types/signals';
import type { Quote } from '@/types/market';

interface SignalsSectionProps {
    className?: string;
}

type SortField = 'created_at' | 'projected_roi' | 'confidence_score' | 'confluence_score';
type DirectionFilter = 'all' | 'long' | 'short';

export function SignalsSection({ className = '' }: SignalsSectionProps) {
    const navigate = useNavigate();
    const { config: portfolioConfig, openPositions } = usePortfolio();
    const [signals, setSignals] = useState<Signal[]>([]);
    const [quotes, setQuotes] = useState<Record<string, Quote>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [scanStatus, setScanStatus] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [notesId, setNotesId] = useState<string | null>(null);
    const [notesText, setNotesText] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [closingId, setClosingId] = useState<string | null>(null);

    // Filters
    const [showFilters, setShowFilters] = useState(false);
    const [minConfidence, setMinConfidence] = useState(0);
    const [highImpactOnly, setHighImpactOnly] = useState(false);
    const [highRoiOnly, setHighRoiOnly] = useState(false);
    const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all');
    const [confluenceFilter, setConfluenceFilter] = useState(false);
    const [sortBy, setSortBy] = useState<SortField>('created_at');

    // Fetch signals from Supabase
    const fetchSignals = useCallback(async () => {
        const { data, error } = await supabase
            .from('signals')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setSignals(data as unknown as Signal[]);

            // Fetch live quotes for unique tickers
            const tickers = [...new Set((data as unknown as Signal[]).map(s => s.ticker))];
            if (tickers.length > 0) {
                try {
                    const q = await MarketDataService.getQuotesBulk(tickers);
                    setQuotes(q);
                } catch (err) {
                    console.warn('[SignalsSection] Failed to fetch bulk quotes:', err);
                }
            }
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchSignals();

        // Realtime subscription for new signals
        const channel = supabase.channel('unified_signals')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
                setSignals(prev => [payload.new as Signal, ...prev]);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'signals' }, (payload) => {
                setSignals(prev => prev.map(s => s.id === (payload.new as Signal).id ? payload.new as Signal : s));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchSignals]);

    // Apply filters and sorting
    const filteredSignals = useMemo(() => {
        let result = [...signals];

        // Confidence filter
        if (minConfidence > 0) {
            result = result.filter(s => (s.confidence_score ?? 0) >= minConfidence);
        }

        // High impact: confidence >= 80 AND confluence strong/moderate
        if (highImpactOnly) {
            result = result.filter(s =>
                (s.confidence_score ?? 0) >= 80 &&
                (s.confluence_level === 'strong' || s.confluence_level === 'moderate')
            );
        }

        // High ROI: projected_roi >= 12%
        if (highRoiOnly) {
            result = result.filter(s => (s.projected_roi ?? 0) >= 12);
        }

        // Direction filter
        if (directionFilter === 'long') {
            result = result.filter(s => s.signal_type.includes('long') || s.signal_type === 'sector_contagion');
        } else if (directionFilter === 'short') {
            result = result.filter(s => s.signal_type.includes('short'));
        }

        // Confluence filter
        if (confluenceFilter) {
            result = result.filter(s => s.confluence_level === 'strong' || s.confluence_level === 'moderate');
        }

        // Sort
        result.sort((a, b) => {
            switch (sortBy) {
                case 'projected_roi':
                    return (b.projected_roi ?? -999) - (a.projected_roi ?? -999);
                case 'confidence_score':
                    return (b.confidence_score ?? 0) - (a.confidence_score ?? 0);
                case 'confluence_score':
                    return (b.confluence_score ?? 0) - (a.confluence_score ?? 0);
                default:
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
        });

        return result;
    }, [signals, minConfidence, highImpactOnly, highRoiOnly, directionFilter, confluenceFilter, sortBy]);

    const activeFilterCount = [
        minConfidence > 0,
        highImpactOnly,
        highRoiOnly,
        directionFilter !== 'all',
        confluenceFilter,
        sortBy !== 'created_at',
    ].filter(Boolean).length;

    // Refresh handler
    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchSignals();
        setRefreshing(false);
    }, [fetchSignals]);

    // Run discovery scan
    const handleScan = useCallback(async () => {
        if (scanning) return;
        setScanning(true);
        setScanStatus('Discovering trending tickers via AI...');
        try {
            const result = await ScannerService.runDiscoveryScan(5, (status) => setScanStatus(status));
            if (result.discovered === 0) {
                setScanStatus('No trending tickers found right now.');
            } else {
                setScanStatus(`Scanned ${result.scanned} tickers, generated ${result.signalsGenerated} signals.`);
            }
            setTimeout(() => setScanStatus(null), 6000);
            await fetchSignals();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setScanStatus(`Scan failed: ${message}`);
            setTimeout(() => setScanStatus(null), 5000);
        } finally {
            setScanning(false);
        }
    }, [scanning, fetchSignals]);

    const handleCloseSignal = useCallback(async (signalId: string) => {
        setClosingId(signalId);
        try {
            await supabase.from('signals').update({ status: 'manually_closed' } as any).eq('id', signalId);
            setSignals(prev => prev.filter(s => s.id !== signalId));
            setExpandedId(null);
        } catch (err) {
            console.error('[SignalsSection] Failed to close signal:', err);
        } finally {
            setClosingId(null);
        }
    }, []);

    const handleSaveNotes = useCallback(async (signalId: string) => {
        setSavingNotes(true);
        try {
            await supabase.from('signals').update({ user_notes: notesText } as any).eq('id', signalId);
            setSignals(prev => prev.map(s => s.id === signalId ? { ...s, user_notes: notesText } : s));
            setNotesId(null);
        } catch (err) {
            console.error('[SignalsSection] Failed to save notes:', err);
        } finally {
            setSavingNotes(false);
        }
    }, [notesText]);

    const handleMarkTriggered = useCallback(async (signalId: string) => {
        try {
            await supabase.from('signals').update({ status: 'triggered' } as any).eq('id', signalId);
            setSignals(prev => prev.map(s => s.id === signalId ? { ...s, status: 'triggered' as any } : s));
        } catch (err) {
            console.error('[SignalsSection] Failed to mark signal triggered:', err);
        }
    }, []);

    const confluenceColor = (level: ConfluenceLevel | null): string => {
        switch (level) {
            case 'strong': return 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30';
            case 'moderate': return 'bg-blue-500/15 text-blue-400 ring-blue-500/30';
            case 'weak': return 'bg-amber-500/15 text-amber-400 ring-amber-500/30';
            default: return 'bg-sentinel-800/50 text-sentinel-500 ring-sentinel-700/30';
        }
    };

    /** Compute portfolio impact if this signal were taken at 2% risk */
    const getPortfolioImpact = useCallback((signal: Signal) => {
        const totalCapital = portfolioConfig?.total_capital ?? 10000;
        const riskPct = portfolioConfig?.risk_per_trade_pct ?? 2;
        const positionSize = totalCapital * (riskPct / 100);
        const currentExposure = openPositions.reduce((sum, p) => sum + (p.position_size_usd ?? 0), 0);
        const newExposurePct = ((currentExposure + positionSize) / totalCapital) * 100;

        // Check for sector overlap (same ticker already open)
        const hasDuplicate = openPositions.some(p => p.ticker === signal.ticker);

        return { positionSize, newExposurePct, hasDuplicate };
    }, [portfolioConfig, openPositions]);

    return (
        <ErrorBoundary>
            <div className={className}>
                {/* Controls bar */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <button
                        onClick={handleScan}
                        disabled={scanning}
                        className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-lg text-sm font-medium transition-colors ring-1 ring-emerald-500/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
                        aria-label="Run AI discovery scan"
                    >
                        {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                        {scanning ? 'Scanning...' : 'Refresh Signals'}
                    </button>

                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2 bg-sentinel-800/50 hover:bg-sentinel-700/50 text-sentinel-400 rounded-lg transition-colors ring-1 ring-sentinel-700/50 border-none cursor-pointer"
                        aria-label="Refresh signal list"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>

                    <button
                        onClick={() => {
                            setHighRoiOnly(!highRoiOnly);
                            if (!highRoiOnly) setSortBy('projected_roi');
                        }}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ring-1 flex items-center gap-2 border-none cursor-pointer ${highRoiOnly
                                ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                                : 'bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/50 hover:bg-sentinel-700/50'
                            }`}
                        aria-label="Toggle high ROI signals only"
                    >
                        <TrendingUp className="w-4 h-4" />
                        High-ROI Only
                    </button>

                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ring-1 flex items-center gap-2 border-none cursor-pointer ${activeFilterCount > 0
                                ? 'bg-blue-500/15 text-blue-400 ring-blue-500/30'
                                : 'bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/50 hover:bg-sentinel-700/50'
                            }`}
                        aria-label="Toggle signal filters"
                    >
                        <Filter className="w-4 h-4" />
                        Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
                    </button>

                    <div className="ml-auto text-xs text-sentinel-500 font-mono">
                        {filteredSignals.length} of {signals.length} signals
                    </div>
                </div>

                {/* Scan status banner */}
                <AnimatePresence>
                    {scanStatus && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-4 bg-sentinel-900/70 border border-sentinel-700/50 rounded-xl px-4 py-3 backdrop-blur-sm"
                        >
                            <div className="flex items-center gap-3">
                                {scanning && <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />}
                                <p className="text-sm text-sentinel-200 flex-1">{scanStatus}</p>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Filter panel */}
                <AnimatePresence>
                    {showFilters && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-4 bg-sentinel-900/50 border border-sentinel-800/50 rounded-xl p-4 backdrop-blur-sm"
                        >
                            <div className="flex flex-wrap gap-4 items-end">
                                {/* Min confidence */}
                                <div className="space-y-1">
                                    <label className="text-xs text-sentinel-400 font-medium" htmlFor="confidence-filter">Min Confidence</label>
                                    <select
                                        id="confidence-filter"
                                        value={minConfidence}
                                        onChange={(e) => setMinConfidence(Number(e.target.value))}
                                        className="bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-1.5 text-sm border border-sentinel-700/50 outline-none"
                                    >
                                        <option value={0}>Any</option>
                                        <option value={60}>60%+</option>
                                        <option value={70}>70%+</option>
                                        <option value={80}>80%+</option>
                                        <option value={90}>90%+</option>
                                    </select>
                                </div>

                                {/* Direction */}
                                <div className="space-y-1">
                                    <label className="text-xs text-sentinel-400 font-medium" htmlFor="direction-filter">Direction</label>
                                    <select
                                        id="direction-filter"
                                        value={directionFilter}
                                        onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
                                        className="bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-1.5 text-sm border border-sentinel-700/50 outline-none"
                                    >
                                        <option value="all">All</option>
                                        <option value="long">Long Only</option>
                                        <option value="short">Short Only</option>
                                    </select>
                                </div>

                                {/* Sort */}
                                <div className="space-y-1">
                                    <label className="text-xs text-sentinel-400 font-medium" htmlFor="sort-field">Sort By</label>
                                    <select
                                        id="sort-field"
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value as SortField)}
                                        className="bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-1.5 text-sm border border-sentinel-700/50 outline-none"
                                    >
                                        <option value="created_at">Newest</option>
                                        <option value="projected_roi">Projected ROI</option>
                                        <option value="confidence_score">Confidence</option>
                                        <option value="confluence_score">Confluence</option>
                                    </select>
                                </div>

                                {/* Toggles */}
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={highImpactOnly}
                                        onChange={(e) => setHighImpactOnly(e.target.checked)}
                                        className="rounded bg-sentinel-800 border-sentinel-700 text-emerald-500 focus:ring-emerald-500/30"
                                    />
                                    <span className="text-xs text-sentinel-400">High Impact Only</span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={confluenceFilter}
                                        onChange={(e) => setConfluenceFilter(e.target.checked)}
                                        className="rounded bg-sentinel-800 border-sentinel-700 text-emerald-500 focus:ring-emerald-500/30"
                                    />
                                    <span className="text-xs text-sentinel-400">Confluence Only</span>
                                </label>

                                {activeFilterCount > 0 && (
                                    <button
                                        onClick={() => {
                                            setMinConfidence(0);
                                            setHighImpactOnly(false);
                                            setHighRoiOnly(false);
                                            setDirectionFilter('all');
                                            setConfluenceFilter(false);
                                            setSortBy('created_at');
                                        }}
                                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 bg-transparent border-none cursor-pointer"
                                        aria-label="Reset all filters"
                                    >
                                        <X className="w-3 h-3" /> Reset
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Signal grid */}
                {loading ? (
                    <SkeletonSignalFeed count={4} />
                ) : filteredSignals.length === 0 ? (
                    <EmptyState
                        icon={<Activity className="w-8 h-8 text-blue-400" />}
                        title={signals.length === 0 ? 'No signals yet' : 'No matching signals'}
                        description={signals.length === 0
                            ? 'Run a discovery scan to generate AI trading signals.'
                            : 'Try adjusting your filters to see more results.'
                        }
                        action={signals.length === 0 ? (
                            <button
                                onClick={handleScan}
                                disabled={scanning}
                                className="mt-2 px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-xl text-sm font-medium transition-colors ring-1 ring-emerald-500/30 flex items-center gap-2 border-none cursor-pointer"
                            >
                                <Activity className="w-4 h-4" /> Run Discovery Scan
                            </button>
                        ) : undefined}
                    />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
                        <AnimatePresence initial={false}>
                            {filteredSignals.map((signal, idx) => {
                                const quote = quotes[signal.ticker];
                                const isExpanded = expandedId === signal.id;
                                const isLong = signal.signal_type.includes('long') || signal.signal_type === 'sector_contagion';

                                return (
                                    <motion.div
                                        key={signal.id}
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.3, delay: idx * 0.03 }}
                                        className="glass-panel rounded-xl p-5 hover:ring-1 hover:ring-sentinel-600/40 transition-all cursor-pointer group relative"
                                        onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Signal for ${signal.ticker}`}
                                        onKeyDown={(e) => { if (e.key === 'Enter') setExpandedId(isExpanded ? null : signal.id); }}
                                    >
                                        {/* Header row: ticker + badges */}
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className="px-2.5 py-1 bg-sentinel-800 text-sentinel-100 text-sm font-bold font-mono rounded ring-1 ring-sentinel-700 shadow-sm">
                                                    {signal.ticker}
                                                </span>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${isLong
                                                        ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                                                        : 'bg-red-500/15 text-red-400 ring-red-500/30'
                                                    }`}>
                                                    {isLong ? 'BUY' : 'SELL'}
                                                </span>
                                                <span className="text-xs text-sentinel-500 capitalize">
                                                    {signal.signal_type.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {signal.ta_alignment && (
                                                    <TABadge taAlignment={signal.ta_alignment} taSnapshot={signal.ta_snapshot} compact />
                                                )}
                                                <span className="text-xs text-sentinel-500 flex items-center gap-1 font-mono">
                                                    <Clock className="w-3 h-3" />
                                                    {timeAgo(signal.created_at)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Confidence bar */}
                                        <div className="mb-3">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] text-sentinel-500 uppercase tracking-wider">Confidence</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold font-mono text-sentinel-200">{signal.confidence_score}%</span>
                                                    {signal.calibrated_confidence != null && (
                                                        <span className="text-[10px] font-mono text-sentinel-500" title="Calibrated win probability based on historical accuracy">
                                                            Cal: {Math.round(signal.calibrated_confidence)}%
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="h-1.5 bg-sentinel-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${signal.confidence_score >= 80 ? 'bg-emerald-500' :
                                                            signal.confidence_score >= 60 ? 'bg-blue-500' :
                                                                signal.confidence_score >= 40 ? 'bg-amber-500' : 'bg-red-500'
                                                        }`}
                                                    style={{ width: `${signal.confidence_score}%` }}
                                                />
                                            </div>
                                        </div>

                                        {/* Thesis preview (first 2 sentences) */}
                                        <p className={`text-sm text-sentinel-400 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>
                                            {signal.thesis}
                                        </p>

                                        {/* Badges row: confluence + projected ROI */}
                                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                                            {signal.confluence_level && signal.confluence_level !== 'none' && (
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${confluenceColor(signal.confluence_level)}`}>
                                                    {signal.confluence_level.toUpperCase()} CONFLUENCE
                                                </span>
                                            )}
                                            {signal.projected_roi != null && (
                                                <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${signal.projected_roi > 0
                                                        ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                                        : 'bg-red-500/10 text-red-400 ring-red-500/20'
                                                    }`}>
                                                    ROI {signal.projected_roi > 0 ? '+' : ''}{signal.projected_roi}%
                                                </span>
                                            )}
                                            {signal.projected_win_rate != null && (
                                                <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/30">
                                                    {signal.projected_win_rate}% WR
                                                    {signal.similar_events_count != null && ` (${signal.similar_events_count})`}
                                                </span>
                                            )}
                                            {/* Z-Score badge */}
                                            {signal.ta_snapshot?.zScore20 != null && Math.abs(Number(signal.ta_snapshot.zScore20)) >= 1.5 && (
                                                <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${
                                                    Number(signal.ta_snapshot.zScore20) < -2.0
                                                        ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                                        : Number(signal.ta_snapshot.zScore20) > 2.0
                                                            ? 'bg-red-500/10 text-red-400 ring-red-500/20'
                                                            : 'bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/30'
                                                }`} title={`Z-Score: ${Number(signal.ta_snapshot.zScore20).toFixed(2)} standard deviations from 20-day mean`}>
                                                    Z: {Number(signal.ta_snapshot.zScore20).toFixed(1)}
                                                </span>
                                            )}
                                            {/* Sentiment divergence badge */}
                                            {(() => {
                                                const div = (signal.agent_outputs as any)?.sentiment_divergence;
                                                if (!div || div.type === 'neutral' || div.type === 'rational') return null;
                                                const isPanic = div.type === 'panic_exhaustion';
                                                return (
                                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${
                                                        isPanic
                                                            ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                                            : 'bg-red-500/10 text-red-400 ring-red-500/20'
                                                    }`} title={isPanic ? 'Sentiment improving while price oversold — bullish divergence' : 'Sentiment worsening while price overbought — bearish divergence'}>
                                                        {isPanic ? 'PANIC EXHAUSTION' : 'EUPHORIA CLIMAX'}
                                                    </span>
                                                );
                                            })()}
                                            {/* Gap badge */}
                                            {(() => {
                                                const gap = (signal.agent_outputs as any)?.gap_analysis;
                                                if (!gap) return null;
                                                return (
                                                    <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 bg-violet-500/10 text-violet-400 ring-violet-500/20"
                                                        title={`${gap.gap_type} gap — fill target: $${Number(gap.gap_fill_target).toFixed(2)}`}>
                                                        GAP {gap.gap_pct > 0 ? '+' : ''}{Number(gap.gap_pct).toFixed(1)}%
                                                    </span>
                                                );
                                            })()}
                                        </div>

                                        {/* Live price + entry/target/stop */}
                                        <div className="mt-3 flex items-center gap-4 text-[11px] text-sentinel-500 font-mono bg-sentinel-950/30 p-2.5 rounded-lg border border-sentinel-800/30">
                                            {quote && (
                                                <div className="flex items-center gap-1">
                                                    <span className="text-sentinel-400">LIVE:</span>
                                                    <span className="text-sentinel-200">{formatPrice(quote.price)}</span>
                                                    <span className={quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                                        {formatPercent(quote.changePercent)}
                                                    </span>
                                                </div>
                                            )}
                                            <div>ENT: <span className="text-sentinel-300">{formatPrice(signal.suggested_entry_low ?? 0)}</span></div>
                                            <div>TGT: <span className="text-emerald-400">{formatPrice(signal.target_price ?? 0)}</span></div>
                                            <div>STP: <span className="text-red-400">{formatPrice(signal.stop_loss ?? 0)}</span></div>
                                        </div>

                                        {/* Expanded details */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="mt-4 pt-4 border-t border-sentinel-800/50 space-y-3"
                                                >
                                                    {/* Counter argument */}
                                                    {signal.counter_argument && (
                                                        <div>
                                                            <span className="text-[10px] text-red-400 uppercase tracking-wider font-bold">Counter Thesis</span>
                                                            <p className="text-xs text-sentinel-400 mt-1 leading-relaxed">{signal.counter_argument}</p>
                                                        </div>
                                                    )}

                                                    {/* TA snapshot summary */}
                                                    {signal.ta_snapshot && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {signal.ta_snapshot.rsi14 != null && !isNaN(Number(signal.ta_snapshot.rsi14)) && (
                                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sentinel-800/50 text-sentinel-400 ring-1 ring-sentinel-700/30">
                                                                    RSI: {Number(signal.ta_snapshot.rsi14).toFixed(0)}
                                                                </span>
                                                            )}
                                                            {signal.ta_snapshot.macd && (
                                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sentinel-800/50 text-sentinel-400 ring-1 ring-sentinel-700/30">
                                                                    MACD: {signal.ta_snapshot.macd.histogram > 0 ? 'Bullish' : 'Bearish'}
                                                                </span>
                                                            )}
                                                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sentinel-800/50 text-sentinel-400 ring-1 ring-sentinel-700/30">
                                                                Trend: {signal.ta_snapshot.trendDirection}
                                                            </span>
                                                            {signal.ta_snapshot.volumeRatio != null && !isNaN(Number(signal.ta_snapshot.volumeRatio)) && (
                                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sentinel-800/50 text-sentinel-400 ring-1 ring-sentinel-700/30">
                                                                    Vol: {Number(signal.ta_snapshot.volumeRatio).toFixed(1)}x
                                                                </span>
                                                            )}
                                                            {signal.ta_snapshot.zScore20 != null && !isNaN(Number(signal.ta_snapshot.zScore20)) && (
                                                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded ring-1 ${
                                                                    Number(signal.ta_snapshot.zScore20) < -2.0
                                                                        ? 'bg-emerald-800/50 text-emerald-400 ring-emerald-700/30'
                                                                        : Number(signal.ta_snapshot.zScore20) > 2.0
                                                                            ? 'bg-red-800/50 text-red-400 ring-red-700/30'
                                                                            : 'bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/30'
                                                                }`}>
                                                                    Z: {Number(signal.ta_snapshot.zScore20).toFixed(2)}
                                                                </span>
                                                            )}
                                                            {signal.ta_snapshot.gapType && signal.ta_snapshot.gapType !== 'none' && (
                                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-800/50 text-violet-400 ring-1 ring-violet-700/30">
                                                                    Gap: {signal.ta_snapshot.gapPct != null ? `${Number(signal.ta_snapshot.gapPct) > 0 ? '+' : ''}${Number(signal.ta_snapshot.gapPct).toFixed(1)}%` : ''} ({signal.ta_snapshot.gapType})
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Portfolio impact guardrail */}
                                                    {(() => {
                                                        const impact = getPortfolioImpact(signal);
                                                        return (
                                                            <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-lg bg-sentinel-950/30 border border-sentinel-800/30">
                                                                <Shield className="w-3.5 h-3.5 text-sentinel-500 flex-shrink-0" />
                                                                <span className="text-[10px] text-sentinel-400 font-mono">
                                                                    {portfolioConfig?.risk_per_trade_pct ?? 2}% risk = <span className="text-sentinel-200">{formatPrice(impact.positionSize)}</span>
                                                                </span>
                                                                <span className="text-[10px] text-sentinel-500">|</span>
                                                                <span className={`text-[10px] font-mono font-bold ${Number(impact.newExposurePct) > (portfolioConfig?.max_total_exposure_pct ?? 60)
                                                                        ? 'text-red-400'
                                                                        : Number(impact.newExposurePct) > 40
                                                                            ? 'text-amber-400'
                                                                            : 'text-emerald-400'
                                                                    }`}>
                                                                    New Exposure: {Number(impact.newExposurePct).toFixed(1)}%
                                                                </span>
                                                                {impact.hasDuplicate && (
                                                                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded ring-1 ring-amber-500/20">
                                                                        DUPLICATE
                                                                    </span>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}

                                                    {/* User notes (inline editor) */}
                                                    {notesId === signal.id ? (
                                                        <div className="p-2.5 rounded-lg bg-sentinel-950/30 border border-sentinel-800/30" onClick={(e) => e.stopPropagation()}>
                                                            <textarea
                                                                value={notesText}
                                                                onChange={(e) => setNotesText(e.target.value)}
                                                                placeholder="Add notes about this signal..."
                                                                className="w-full bg-sentinel-900 text-sentinel-200 text-xs rounded-lg p-2 border border-sentinel-700/50 outline-none resize-none"
                                                                rows={3}
                                                                autoFocus
                                                            />
                                                            <div className="flex items-center gap-2 mt-2">
                                                                <button
                                                                    onClick={() => handleSaveNotes(signal.id)}
                                                                    disabled={savingNotes}
                                                                    className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded text-xs font-medium ring-1 ring-emerald-500/30 border-none cursor-pointer disabled:opacity-50"
                                                                >
                                                                    {savingNotes ? 'Saving...' : 'Save'}
                                                                </button>
                                                                <button
                                                                    onClick={() => setNotesId(null)}
                                                                    className="px-3 py-1 bg-sentinel-800/50 hover:bg-sentinel-700/50 text-sentinel-400 rounded text-xs ring-1 ring-sentinel-700/50 border-none cursor-pointer"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : signal.user_notes ? (
                                                        <div className="p-2 rounded-lg bg-sentinel-950/30 border border-sentinel-800/30 cursor-text"
                                                            onClick={(e) => { e.stopPropagation(); setNotesText(signal.user_notes || ''); setNotesId(signal.id); }}>
                                                            <span className="text-[10px] text-sentinel-500 uppercase tracking-wider">Notes</span>
                                                            <p className="text-xs text-sentinel-400 mt-0.5">{signal.user_notes}</p>
                                                        </div>
                                                    ) : null}

                                                    {/* Action buttons */}
                                                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/analysis/${signal.ticker}`);
                                                            }}
                                                            className="px-3 py-1.5 bg-sentinel-800/70 hover:bg-sentinel-700/70 text-sentinel-300 rounded-lg text-xs font-medium transition-colors ring-1 ring-sentinel-700/50 flex items-center gap-1.5 border-none cursor-pointer"
                                                        >
                                                            <BarChart3 className="w-3 h-3" /> Full Analysis
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/simulator?ticker=${signal.ticker}&entry=${signal.suggested_entry_low || ''}&target=${signal.target_price || ''}&stop=${signal.stop_loss || ''}&side=${signal.signal_type.includes('short') ? 'short' : 'long'}`);
                                                            }}
                                                            className="px-3 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 rounded-lg text-xs font-medium transition-colors ring-1 ring-blue-500/30 flex items-center gap-1.5 border-none cursor-pointer"
                                                        >
                                                            <Calculator className="w-3 h-3" /> Simulate Trade
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/journal?ticker=${signal.ticker}&thesis=${encodeURIComponent(signal.thesis?.slice(0, 200) || '')}&entry=${signal.suggested_entry_low || ''}&target=${signal.target_price || ''}&stop=${signal.stop_loss || ''}`);
                                                            }}
                                                            className="px-3 py-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 rounded-lg text-xs font-medium transition-colors ring-1 ring-emerald-500/30 flex items-center gap-1.5 border-none cursor-pointer"
                                                        >
                                                            <BookOpen className="w-3 h-3" /> Log Trade
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/intelligence?q=${signal.ticker}`);
                                                            }}
                                                            className="px-3 py-1.5 bg-purple-600/15 hover:bg-purple-600/25 text-purple-400 rounded-lg text-xs font-medium transition-colors ring-1 ring-purple-500/30 flex items-center gap-1.5 border-none cursor-pointer"
                                                        >
                                                            <Newspaper className="w-3 h-3" /> News
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate(`/research/${signal.ticker}`);
                                                            }}
                                                            className="px-3 py-1.5 bg-sentinel-800/70 hover:bg-sentinel-700/70 text-sentinel-300 rounded-lg text-xs font-medium transition-colors ring-1 ring-sentinel-700/50 flex items-center gap-1.5 border-none cursor-pointer"
                                                        >
                                                            <Radar className="w-3 h-3" /> Research
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setNotesText(signal.user_notes || '');
                                                                setNotesId(signal.id);
                                                            }}
                                                            className="px-3 py-1.5 bg-sentinel-800/70 hover:bg-sentinel-700/70 text-sentinel-300 rounded-lg text-xs font-medium transition-colors ring-1 ring-sentinel-700/50 flex items-center gap-1.5 border-none cursor-pointer"
                                                        >
                                                            <MessageSquare className="w-3 h-3" /> Notes
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleMarkTriggered(signal.id);
                                                            }}
                                                            className="px-3 py-1.5 bg-amber-600/15 hover:bg-amber-600/25 text-amber-400 rounded-lg text-xs font-medium transition-colors ring-1 ring-amber-500/30 flex items-center gap-1.5 border-none cursor-pointer"
                                                        >
                                                            <CheckCircle2 className="w-3 h-3" /> Took Trade
                                                        </button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCloseSignal(signal.id);
                                                            }}
                                                            disabled={closingId === signal.id}
                                                            className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 text-red-400 rounded-lg text-xs font-medium transition-colors ring-1 ring-red-500/20 flex items-center gap-1.5 border-none cursor-pointer disabled:opacity-50 ml-auto"
                                                        >
                                                            <XCircle className="w-3 h-3" /> {closingId === signal.id ? 'Closing...' : 'Dismiss'}
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* Expand indicator */}
                                        <div className="absolute bottom-2 right-3 text-sentinel-600">
                                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}
