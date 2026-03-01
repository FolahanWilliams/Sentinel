import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { Filter, ChevronDown, ChevronRight, ShieldPlus, TrendingUp, AlertTriangle, MessageSquareQuote } from 'lucide-react';
import { formatPrice } from '@/utils/formatters';

export function Analysis() {
    const [signals, setSignals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        async function fetchSignals() {
            // Fetch open signals first, then recently closed
            const { data, error } = await supabase
                .from('signals')
                .select(`
          *,
          signal_outcomes (
            outcome,
            return_at_30d,
            max_gain
          )
        `)
                .order('created_at', { ascending: false })
                .limit(20);

            if (!error && data) {
                setSignals(data);
            }
            setLoading(false);
        }
        fetchSignals();
    }, []);

    if (loading) {
        return <div className="flex items-center justify-center min-h-[50vh]"><div className="w-8 h-8 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div></div>
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100">
                        Signal Analysis
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Deep dives into agent reasoning and Red Team counter-theses.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button className="px-3 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm transition-colors ring-1 ring-sentinel-700 flex items-center gap-2">
                        <Filter className="w-4 h-4" /> Filter
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {signals.map(signal => {
                    const isExpanded = expandedId === signal.id;
                    const outcomeData = signal.signal_outcomes?.[0];

                    return (
                        <div key={signal.id} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm transition-all">
                            {/* HEADER ROW (Click to expand) */}
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
                                            {signal.status === 'closed' && outcomeData && (
                                                <span className={`px-2 py-0.5 text-xs font-bold rounded ${outcomeData.outcome === 'win'
                                                    ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20'
                                                    : 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'
                                                    }`}>
                                                    {outcomeData.outcome.toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-sm text-sentinel-500 mt-1 flex items-center gap-3">
                                            <span>{new Date(signal.created_at).toLocaleDateString()} at {new Date(signal.created_at).toLocaleTimeString()}</span>
                                            <span className="flex items-center gap-1"><ShieldPlus className="w-3 h-3" /> Risk: <span className="capitalize">{signal.risk_level}</span></span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-6 text-sm">
                                    <div className="text-right">
                                        <div className="text-sentinel-500 text-xs font-mono">CONFIDENCE</div>
                                        <div className="font-bold text-sentinel-200">{signal.confidence_score}%</div>
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

                            {/* EXPANDED CONTENT */}
                            {isExpanded && (
                                <div className="px-5 pb-5 pt-2 border-t border-sentinel-800/50 bg-sentinel-950/30">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">

                                        {/* THE RED TEAM VS PRIMARY THESIS */}
                                        <div className="space-y-4">
                                            <div>
                                                <h4 className="text-xs font-semibold text-sentinel-500 uppercase flex items-center gap-2 mb-2">
                                                    <TrendingUp className="w-4 h-4 text-sentinel-400" /> Primary Thesis
                                                </h4>
                                                <p className="text-sm text-sentinel-200 leading-relaxed bg-sentinel-900/50 p-4 rounded-lg border border-sentinel-800 border-l-4 border-l-blue-500">
                                                    {signal.thesis}
                                                </p>
                                            </div>

                                            <div>
                                                <h4 className="text-xs font-semibold text-sentinel-500 uppercase flex items-center gap-2 mb-2">
                                                    <AlertTriangle className="w-4 h-4 text-sentinel-400" /> Red Team Counter-Argument
                                                </h4>
                                                <p className="text-sm text-sentinel-300 leading-relaxed bg-sentinel-900/50 p-4 rounded-lg border border-sentinel-800 border-l-4 border-l-red-500/50">
                                                    {signal.counter_argument || 'Red team did not provide a counter-argument.'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* RAW AGENT DUMP & STATS */}
                                        <div className="space-y-4">
                                            <h4 className="text-xs font-semibold text-sentinel-500 uppercase flex items-center gap-2 mb-2">
                                                <MessageSquareQuote className="w-4 h-4 text-sentinel-400" /> Agent Telemetry
                                            </h4>
                                            <div className="bg-black/40 rounded-lg border border-sentinel-800/50 p-4 overflow-auto max-h-[300px]">
                                                <pre className="text-xs text-sentinel-400 font-mono">
                                                    {JSON.stringify(signal.agent_outputs, null, 2)}
                                                </pre>
                                            </div>

                                            {/* Quick Action Buttons */}
                                            <div className="flex gap-3 pt-2">
                                                <button className="flex-1 px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700">
                                                    Log Execution in Journal
                                                </button>
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    );
}
