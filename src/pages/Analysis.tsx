/**
 * Analysis — Deep-dive signal analysis page with modular components.
 * Shows agent reasoning, bias breakdown, fundamentals, historical matches,
 * position sizing, and event timeline.
 *
 * When a signal is expanded, lazily fetches AI-enriched data via useTickerAnalysis.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { Filter, ChevronDown, ChevronRight, Clock, ArrowLeft, Radar } from 'lucide-react';
import { formatPrice } from '@/utils/formatters';
import { BiasBreakdown } from '@/components/analysis/BiasBreakdown';
import { EventTimeline } from '@/components/analysis/EventTimeline';
import { PositionSizeCard } from '@/components/analysis/PositionSizeCard';
import { FundamentalSnapshot } from '@/components/analysis/FundamentalSnapshot';
import { HistoricalPrecedent } from '@/components/analysis/HistoricalPrecedent';
import { AgentReasoning } from '@/components/analysis/AgentReasoning';
import { AgentReasoningSurface } from '@/components/analysis/AgentReasoningSurface';
import { RiskRewardChart } from '@/components/analysis/RiskRewardChart';
import { OutcomeNarrativeCard } from '@/components/analysis/OutcomeNarrativeCard';
import { SignalComparison } from '@/components/analysis/SignalComparison';
import { ConfidenceMeter } from '@/components/shared/ConfidenceMeter';
import { TABadge } from '@/components/shared/TABadge';
import { SignalRating } from '@/components/shared/SignalRating';
import { LoadingState } from '@/components/shared/LoadingState';
import { useTickerAnalysis } from '@/hooks/useTickerAnalysis';
import { TickerNewsFeed } from '@/components/analysis/TickerNewsFeed';
import { MultiTimeframeChart } from '@/components/analysis/MultiTimeframeChart';

export function Analysis() {
    const { ticker: urlTicker } = useParams<{ ticker?: string }>();
    const [signals, setSignals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [events, setEvents] = useState<Record<string, any[]>>({});
    const [compareSignals, setCompareSignals] = useState<any[]>([]);
    const [showComparison, setShowComparison] = useState(false);
    const { data: analysisData, loading: analysisLoading, fetchAnalysis } = useTickerAnalysis();

    useEffect(() => {
        async function fetchSignals() {
            let query = supabase
                .from('signals')
                .select(`
                    *,
                    signal_outcomes (
                        outcome,
                        return_at_1d,
                        return_at_5d,
                        return_at_10d,
                        return_at_30d,
                        max_gain,
                        max_drawdown
                    )
                `)
                .order('created_at', { ascending: false });

            // If a ticker is in the URL, filter to that ticker
            if (urlTicker) {
                query = query.eq('ticker', urlTicker.toUpperCase());
            }

            const { data, error } = await query.limit(20);

            if (!error && data) {
                setSignals(data);

                const tickers = [...new Set(data.map(s => s.ticker))];
                if (tickers.length > 0) {
                    const { data: eventsData } = await supabase
                        .from('market_events')
                        .select('*')
                        .in('ticker', tickers)
                        .order('created_at', { ascending: false })
                        .limit(50);

                    if (eventsData) {
                        const grouped: Record<string, any[]> = {};
                        for (const ev of eventsData) {
                            const t = ev.ticker;
                            if (!grouped[t]) grouped[t] = [];
                            grouped[t]!.push(ev);
                        }
                        setEvents(grouped);
                    }
                }

                // Auto-expand if there's a URL ticker and we found signals
                if (urlTicker && data.length > 0) {
                    const firstSignal = data[0];
                    if (firstSignal) {
                        setExpandedId(firstSignal.id);
                        fetchAnalysis(firstSignal.ticker);
                    }
                }
            }
            setLoading(false);
        }
        fetchSignals();
    }, [urlTicker, fetchAnalysis]);

    // When a signal is expanded, fetch AI analysis for its ticker
    function handleExpand(signalId: string, ticker: string) {
        const isExpanding = expandedId !== signalId;
        setExpandedId(isExpanding ? signalId : null);
        if (isExpanding) {
            fetchAnalysis(ticker);
        }
    }

    if (loading) return <LoadingState message="Loading signals..." />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Breadcrumb navigation */}
            <nav className="flex items-center gap-2 text-sm text-sentinel-500">
                <Link to="/" className="hover:text-sentinel-300 transition-colors no-underline flex items-center gap-1">
                    <ArrowLeft className="w-3.5 h-3.5" /> Signals
                </Link>
                <span>/</span>
                {urlTicker ? (
                    <>
                        <Link to="/analysis" className="hover:text-sentinel-300 transition-colors no-underline">Analysis</Link>
                        <span>/</span>
                        <span className="text-sentinel-300 font-medium">{urlTicker.toUpperCase()}</span>
                    </>
                ) : (
                    <span className="text-sentinel-300">Analysis</span>
                )}
            </nav>

            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100">
                        {urlTicker ? `${urlTicker.toUpperCase()} Analysis` : 'Signal Analysis'}
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Deep dives into agent reasoning, bias detection, and Red Team counter-theses.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Link
                        to="/scanner"
                        className="px-3 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm transition-colors ring-1 ring-sentinel-700 flex items-center gap-2 no-underline"
                    >
                        <Radar className="w-4 h-4" /> Scanner
                    </Link>
                    <button className="px-3 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm transition-colors ring-1 ring-sentinel-700 flex items-center gap-2">
                        <Filter className="w-4 h-4" /> Filter
                    </button>
                </div>
            </div>

            {/* Signal Comparison Modal */}
            {showComparison && compareSignals.length >= 2 && (
                <SignalComparison
                    signals={compareSignals}
                    onClose={() => { setShowComparison(false); setCompareSignals([]); }}
                />
            )}

            {/* Compare Button */}
            {signals.length >= 2 && !showComparison && (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-sentinel-500">
                        {compareSignals.length > 0 ? `${compareSignals.length} selected` : 'Select signals to compare'}
                    </span>
                    {compareSignals.length >= 2 && (
                        <button
                            onClick={() => setShowComparison(true)}
                            className="px-3 py-1.5 bg-blue-600/20 text-blue-400 rounded-lg text-xs font-medium ring-1 ring-blue-500/30 hover:bg-blue-600/30 transition-colors"
                        >
                            Compare ({compareSignals.length})
                        </button>
                    )}
                    {compareSignals.length > 0 && (
                        <button
                            onClick={() => setCompareSignals([])}
                            className="text-xs text-sentinel-500 hover:text-sentinel-300"
                        >
                            Clear
                        </button>
                    )}
                </div>
            )}

            {/* Per-ticker news context */}
            {urlTicker && <TickerNewsFeed ticker={urlTicker.toUpperCase()} />}

            {signals.length === 0 ? (
                <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-12 text-center space-y-4">
                    <p className="text-sentinel-400">
                        {urlTicker
                            ? `No signals generated for ${urlTicker.toUpperCase()} yet.`
                            : 'No signals generated yet. The agents are watching.'
                        }
                    </p>
                    <div className="flex items-center justify-center gap-3">
                        <Link
                            to={urlTicker ? `/scanner?ticker=${urlTicker}` : '/scanner'}
                            className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm font-medium transition-colors ring-1 ring-blue-500/30 no-underline flex items-center gap-2"
                        >
                            <Radar className="w-4 h-4" /> Run Scanner
                        </Link>
                        <Link
                            to="/"
                            className="px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-300 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700 no-underline flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Back to Signals
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    {signals.map(signal => {
                        const isExpanded = expandedId === signal.id;
                        const outcomeData = signal.signal_outcomes?.[0];
                        const agentOutputs = signal.agent_outputs || {};
                        const tickerEvents = events[signal.ticker] || [];
                        const tickerAnalysis = analysisData[signal.ticker];
                        const isLoadingAnalysis = analysisLoading[signal.ticker] || false;

                        return (
                            <div key={signal.id} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm transition-all">
                                {/* Header */}
                                <div
                                    onClick={() => handleExpand(signal.id, signal.ticker)}
                                    className="p-5 flex flex-col md:flex-row gap-4 md:items-center justify-between cursor-pointer hover:bg-sentinel-800/30 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        {signals.length >= 2 && (
                                            <input
                                                type="checkbox"
                                                checked={compareSignals.some(s => s.id === signal.id)}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    setCompareSignals(prev =>
                                                        prev.some(s => s.id === signal.id)
                                                            ? prev.filter(s => s.id !== signal.id)
                                                            : [...prev, signal].slice(0, 5)
                                                    );
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-4 h-4 rounded border-sentinel-600 bg-sentinel-800 text-blue-500 focus:ring-0 cursor-pointer"
                                                title="Select for comparison"
                                            />
                                        )}
                                        <button className="text-sentinel-500 hover:text-sentinel-300 transition-colors">
                                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                        </button>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg font-bold text-sentinel-100">{signal.ticker}</span>
                                                <span className="px-2 py-0.5 bg-sentinel-800 text-sentinel-300 text-xs font-medium rounded ring-1 ring-sentinel-700 capitalize">
                                                    {signal.signal_type.replace('_', ' ')}
                                                </span>
                                                {signal.ta_alignment && (
                                                    <TABadge
                                                        taAlignment={signal.ta_alignment}
                                                        taSnapshot={signal.ta_snapshot}
                                                        compact
                                                    />
                                                )}
                                                {outcomeData && outcomeData.outcome !== 'pending' && (
                                                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${outcomeData.outcome === 'win'
                                                        ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                                                        : 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                                                        }`}>
                                                        {outcomeData.outcome.toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-sentinel-500 mt-1 flex items-center gap-3">
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(signal.created_at).toLocaleDateString()} at {new Date(signal.created_at).toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm">
                                        <div className="w-20 sm:w-24">
                                            <ConfidenceMeter value={signal.confidence_score} size="sm" />
                                            {signal.calibrated_confidence != null && (
                                                <p className="text-[10px] text-sentinel-500 font-mono text-center mt-0.5">
                                                    Cal: {signal.calibrated_confidence.toFixed(0)}%
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sentinel-500 text-xs font-mono">ENTRY</div>
                                            <div className="font-medium text-sentinel-300">{formatPrice(signal.suggested_entry_low)} - {formatPrice(signal.suggested_entry_high)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sentinel-500 text-xs font-mono">TARGET</div>
                                            <div className="font-medium text-emerald-400">{formatPrice(signal.target_price)}</div>
                                        </div>
                                        <SignalRating signalId={signal.id} />
                                    </div>
                                </div>

                                {/* Expanded Content — Modular Components */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 border-t border-sentinel-800/50 bg-sentinel-950/30">
                                        {/* TA Confirmation + Primary Thesis */}
                                        <div className="mb-6 mt-4 space-y-3">
                                            {signal.ta_alignment && (
                                                <div className="flex items-center gap-3">
                                                    <TABadge
                                                        taAlignment={signal.ta_alignment}
                                                        taSnapshot={signal.ta_snapshot}
                                                    />
                                                    {signal.trailing_stop_rule && (
                                                        <span className="text-[10px] text-sentinel-500 font-mono bg-sentinel-900/50 px-2 py-1 rounded border border-sentinel-700/30">
                                                            {signal.trailing_stop_rule}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <p className="text-sm text-sentinel-200 leading-relaxed bg-sentinel-900/50 p-4 rounded-lg border border-sentinel-800 border-l-4 border-l-blue-500">
                                                {signal.thesis}
                                            </p>
                                        </div>

                                        {/* Multi-Timeframe Chart */}
                                        <div className="mb-6">
                                            <MultiTimeframeChart ticker={signal.ticker} signal={signal} height={450} />
                                        </div>

                                        {/* Agent Reasoning Surface — thesis, counter-thesis, confidence waterfall */}
                                        <div className="mb-6">
                                            <AgentReasoningSurface signal={signal} />
                                        </div>

                                        {/* Risk/Reward Visualization */}
                                        <div className="mb-6">
                                            <RiskRewardChart
                                                entryLow={signal.suggested_entry_low}
                                                entryHigh={signal.suggested_entry_high}
                                                stopLoss={signal.stop_loss}
                                                targetPrice={signal.target_price}
                                                currentPrice={signal.suggested_entry_high}
                                                ticker={signal.ticker}
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            {/* Left column */}
                                            <div className="space-y-6">
                                                <BiasBreakdown
                                                    biasType={signal.bias_type}
                                                    secondaryBiases={signal.secondary_biases}
                                                    biasExplanation={signal.bias_explanation}
                                                    counterArgument={signal.counter_argument}
                                                    confidenceScore={signal.confidence_score}
                                                    agentOutputs={agentOutputs}
                                                    biasWeights={tickerAnalysis?.biasWeights}
                                                    weightsLoading={isLoadingAnalysis}
                                                />

                                                <FundamentalSnapshot
                                                    sanityCheck={agentOutputs.sanity_checker || agentOutputs.red_team}
                                                    fundamentals={tickerAnalysis?.fundamentals}
                                                    fundamentalsLoading={isLoadingAnalysis}
                                                    onRefresh={() => fetchAnalysis(signal.ticker)}
                                                />

                                                <PositionSizeCard
                                                    ticker={signal.ticker}
                                                    currentPrice={signal.suggested_entry_high || 100}
                                                    stopLoss={signal.stop_loss}
                                                    targetPrice={signal.target_price}
                                                    confidenceScore={signal.confidence_score}
                                                />
                                            </div>

                                            {/* Right column */}
                                            <div className="space-y-6">
                                                <EventTimeline
                                                    events={tickerEvents}
                                                    aiEvents={tickerAnalysis?.events}
                                                    aiEventsLoading={isLoadingAnalysis}
                                                />

                                                <HistoricalPrecedent
                                                    matches={agentOutputs.historical_matcher?.matches}
                                                    aggregateStats={agentOutputs.historical_matcher?.aggregate_stats}
                                                    patternConfidence={agentOutputs.historical_matcher?.pattern_confidence}
                                                    caveats={agentOutputs.historical_matcher?.caveats}
                                                    source={agentOutputs.historical_matcher?.source}
                                                />

                                                <AgentReasoning agentOutputs={agentOutputs} />
                                            </div>
                                        </div>

                                        {/* Outcome data */}
                                        {outcomeData && (
                                            <div className="mt-6 p-4 bg-sentinel-950/50 rounded-xl border border-sentinel-800/50">
                                                <h4 className="text-xs font-semibold text-sentinel-500 uppercase tracking-wider mb-3">Outcome Tracking</h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                                                    {[
                                                        { label: '1d Return', val: outcomeData.return_at_1d },
                                                        { label: '5d Return', val: outcomeData.return_at_5d },
                                                        { label: '10d Return', val: outcomeData.return_at_10d },
                                                        { label: '30d Return', val: outcomeData.return_at_30d },
                                                    ].map(({ label, val }) => (
                                                        <div key={label}>
                                                            <p className="text-xs text-sentinel-500 mb-1">{label}</p>
                                                            <p className={`text-sm font-bold font-mono ${val == null ? 'text-sentinel-600' : val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                                {val != null ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}%` : '--'}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Outcome Narrative with AI context */}
                                        <div className="mt-6">
                                            <OutcomeNarrativeCard
                                                signalId={signal.id}
                                                ticker={signal.ticker}
                                                thesis={signal.thesis}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
