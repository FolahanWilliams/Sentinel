/**
 * Analysis — Deep-dive signal analysis page with modular components.
 * Shows agent reasoning, bias breakdown, fundamentals, historical matches,
 * position sizing, and event timeline.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { Filter, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { formatPrice } from '@/utils/formatters';
import { BiasBreakdown } from '@/components/analysis/BiasBreakdown';
import { EventTimeline } from '@/components/analysis/EventTimeline';
import { PositionSizeCard } from '@/components/analysis/PositionSizeCard';
import { FundamentalSnapshot } from '@/components/analysis/FundamentalSnapshot';
import { HistoricalPrecedent } from '@/components/analysis/HistoricalPrecedent';
import { AgentReasoning } from '@/components/analysis/AgentReasoning';
import { ConfidenceMeter } from '@/components/shared/ConfidenceMeter';
import { LoadingState } from '@/components/shared/LoadingState';

export function Analysis() {
    const [signals, setSignals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [events, setEvents] = useState<Record<string, any[]>>({});

    useEffect(() => {
        async function fetchSignals() {
            const { data, error } = await supabase
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
                .order('created_at', { ascending: false })
                .limit(20);

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
                            if (!grouped[ev.ticker]) grouped[ev.ticker] = [];
                            grouped[ev.ticker].push(ev);
                        }
                        setEvents(grouped);
                    }
                }
            }
            setLoading(false);
        }
        fetchSignals();
    }, []);

    if (loading) return <LoadingState message="Loading signals..." />;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100">
                        Signal Analysis
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Deep dives into agent reasoning, bias detection, and Red Team counter-theses.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button className="px-3 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm transition-colors ring-1 ring-sentinel-700 flex items-center gap-2">
                        <Filter className="w-4 h-4" /> Filter
                    </button>
                </div>
            </div>

            {signals.length === 0 ? (
                <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-12 text-center">
                    <p className="text-sentinel-400">No signals generated yet. The agents are watching.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {signals.map(signal => {
                        const isExpanded = expandedId === signal.id;
                        const outcomeData = signal.signal_outcomes?.[0];
                        const agentOutputs = signal.agent_outputs || {};
                        const tickerEvents = events[signal.ticker] || [];

                        return (
                            <div key={signal.id} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm transition-all">
                                {/* Header */}
                                <div
                                    onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                                    className="p-5 flex flex-col md:flex-row gap-4 md:items-center justify-between cursor-pointer hover:bg-sentinel-800/30 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <button className="text-sentinel-500 hover:text-sentinel-300 transition-colors">
                                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                        </button>
                                        <div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg font-bold text-sentinel-100">{signal.ticker}</span>
                                                <span className="px-2 py-0.5 bg-sentinel-800 text-sentinel-300 text-xs font-medium rounded ring-1 ring-sentinel-700 capitalize">
                                                    {signal.signal_type.replace('_', ' ')}
                                                </span>
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

                                    <div className="flex items-center gap-6 text-sm">
                                        <div className="w-24">
                                            <ConfidenceMeter value={signal.confidence_score} size="sm" />
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sentinel-500 text-xs font-mono">ENTRY</div>
                                            <div className="font-medium text-sentinel-300">{formatPrice(signal.suggested_entry_low)} - {formatPrice(signal.suggested_entry_high)}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sentinel-500 text-xs font-mono">TARGET</div>
                                            <div className="font-medium text-emerald-400">{formatPrice(signal.target_price)}</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Content — Modular Components */}
                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-2 border-t border-sentinel-800/50 bg-sentinel-950/30">
                                        {/* Primary Thesis */}
                                        <div className="mb-6 mt-4">
                                            <p className="text-sm text-sentinel-200 leading-relaxed bg-sentinel-900/50 p-4 rounded-lg border border-sentinel-800 border-l-4 border-l-blue-500">
                                                {signal.thesis}
                                            </p>
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
                                                />

                                                <FundamentalSnapshot
                                                    sanityCheck={agentOutputs.sanity_checker || agentOutputs.red_team}
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
                                                <EventTimeline events={tickerEvents} />

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
