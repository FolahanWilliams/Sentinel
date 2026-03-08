import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { TrendingUp, TrendingDown, Target, ShieldAlert, ChevronRight, RefreshCw, Zap, Shield, AlertTriangle, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { TABadge } from '@/components/shared/TABadge';
import { SignalQualityBadge } from '@/components/shared/SignalQualityBadge';
import type { AgentOutputsJson, TASnapshot } from '@/types/signals';

interface RecentSignal {
    id: string;
    ticker: string;
    signal_type: string;
    confidence_score: number;
    thesis: string;
    target_price: number | null;
    stop_loss: number | null;
    suggested_entry_low: number | null;
    suggested_entry_high: number | null;
    confluence_level: string | null;
    ta_alignment: string | null;
    risk_level: string;
    projected_roi: number | null;
    conviction_score: number | null;
    why_high_conviction: string | null;
    agent_outputs: AgentOutputsJson | null;
    ta_snapshot: TASnapshot | null;
    created_at: string;
}

export const ScanResults: React.FC = () => {
    const [signals, setSignals] = useState<RecentSignal[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchRecent = useCallback(async () => {
        try {
            setLoading(true);
            // Show signals from the last 24 hours
            const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            // Use select('*') because columns like confluence_level, ta_alignment exist
            // in Postgres (added by migrations) but aren't in the generated Supabase types yet
            const { data, error } = await supabase
                .from('signals')
                .select('*')
                .gte('created_at', since)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setSignals((data as unknown as RecentSignal[]) || []);
        } catch (err) {
            console.error('[ScanResults] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRecent();

        // Realtime: prepend new signals as they arrive
        const channel = supabase
            .channel('scan_results_signals')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'signals' },
                (payload) => {
                    const newSig = payload.new as RecentSignal;
                    setSignals((prev) => [newSig, ...prev].slice(0, 10));
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchRecent]);

    const confidenceColor = (score: number) => {
        if (score >= 80) return 'text-green-400';
        if (score >= 60) return 'text-blue-400';
        if (score >= 40) return 'text-amber-400';
        return 'text-red-400';
    };

    const confidenceBg = (score: number) => {
        if (score >= 80) return 'bg-green-500/20 border-green-500/30';
        if (score >= 60) return 'bg-blue-500/20 border-blue-500/30';
        if (score >= 40) return 'bg-amber-500/20 border-amber-500/30';
        return 'bg-red-500/20 border-red-500/30';
    };

    const signalTypeLabel = (type: string) => {
        switch (type) {
            case 'long_overreaction': return 'Long — Overreaction';
            case 'short_overreaction': return 'Short — Overreaction';
            case 'sector_contagion': return 'Long — Contagion';
            case 'earnings_overreaction': return 'Long — Earnings';
            case 'bullish_catalyst': return 'Long — Catalyst';
            default: return type;
        }
    };

    const isLong = (type: string) => type !== 'short_overreaction';

    const confluenceBadge = (level: string | null) => {
        if (!level) return null;
        const colors: Record<string, string> = {
            strong: 'bg-green-900/50 text-green-300 border-green-700/50',
            moderate: 'bg-blue-900/50 text-blue-300 border-blue-700/50',
            weak: 'bg-amber-900/50 text-amber-300 border-amber-700/50',
            none: 'bg-gray-800 text-gray-400 border-gray-700',
        };
        return (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[level] || colors.none}`}>
                {level}
            </span>
        );
    };

    const timeAgo = (iso: string) => {
        const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.round(hrs / 24)}d ago`;
    };

    if (loading && signals.length === 0) {
        return (
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6 flex items-center justify-center min-h-[200px]">
                <RefreshCw className="w-5 h-5 text-gray-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="bg-[#111] border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center">
                    <Zap className="w-5 h-5 mr-2 text-amber-400" />
                    Generated Signals
                </h2>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">Last 24h</span>
                    <button
                        onClick={fetchRecent}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {signals.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                    No signals generated in the last 24 hours. Run a scan to find opportunities.
                </div>
            ) : (
                <div className="divide-y divide-gray-800/50">
                    {signals.map((sig) => (
                        <div key={sig.id} className="p-4 hover:bg-[#1a1a1a]/50 transition-colors">
                            {/* Top row: ticker, type, confidence, time */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-lg font-bold text-white">{sig.ticker}</span>
                                    <span className={`flex items-center text-xs font-medium px-2 py-0.5 rounded ${
                                        isLong(sig.signal_type)
                                            ? 'bg-green-900/40 text-green-400 border border-green-800/50'
                                            : 'bg-red-900/40 text-red-400 border border-red-800/50'
                                    }`}>
                                        {isLong(sig.signal_type)
                                            ? <TrendingUp className="w-3 h-3 mr-1" />
                                            : <TrendingDown className="w-3 h-3 mr-1" />
                                        }
                                        {signalTypeLabel(sig.signal_type)}
                                    </span>
                                    {confluenceBadge(sig.confluence_level)}
                                </div>
                                <div className="flex items-center gap-3">
                                    {sig.ta_alignment && (
                                        <TABadge taAlignment={sig.ta_alignment as any} taSnapshot={sig.ta_snapshot} compact />
                                    )}
                                    <SignalQualityBadge agentOutputs={sig.agent_outputs} compact />
                                    <span className={`text-sm font-semibold px-2 py-0.5 rounded border ${confidenceBg(sig.confidence_score)} ${confidenceColor(sig.confidence_score)}`}>
                                        {sig.confidence_score}%
                                    </span>
                                    <span className="text-xs text-gray-500">{timeAgo(sig.created_at)}</span>
                                </div>
                            </div>

                            {/* Thesis */}
                            <p className="text-sm text-gray-300 mb-2 line-clamp-2">{sig.thesis}</p>

                            {/* Intelligence badges row */}
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                {sig.projected_roi != null && (
                                    <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${
                                        sig.projected_roi > 0
                                            ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                            : 'bg-red-500/10 text-red-400 ring-red-500/20'
                                    }`}>
                                        ROI {sig.projected_roi > 0 ? '+' : ''}{sig.projected_roi}%
                                    </span>
                                )}
                                {sig.conviction_score != null && sig.conviction_score > 0 && (
                                    <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${
                                        sig.conviction_score >= 85
                                            ? 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
                                            : sig.conviction_score >= 70
                                                ? 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
                                                : 'bg-gray-800 text-gray-400 ring-gray-700'
                                    }`} title={sig.why_high_conviction || `Conviction: ${sig.conviction_score}/100`}>
                                        <Shield className="w-2.5 h-2.5 inline mr-0.5" />CV {sig.conviction_score}
                                    </span>
                                )}
                                {sig.agent_outputs?.market_regime && (
                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${
                                        sig.agent_outputs.market_regime.regime === 'risk_on'
                                            ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                            : sig.agent_outputs.market_regime.regime === 'risk_off'
                                                ? 'bg-red-500/10 text-red-400 ring-red-500/20'
                                                : 'bg-gray-800 text-gray-400 ring-gray-700'
                                    }`} title={`VIX: ${sig.agent_outputs.market_regime.vix ?? '?'}`}>
                                        <BarChart3 className="w-2.5 h-2.5 inline mr-0.5" />{sig.agent_outputs.market_regime.regime.replace('_', ' ')}
                                    </span>
                                )}
                                {sig.agent_outputs?.earnings_guard?.days_until != null && sig.agent_outputs.earnings_guard.days_until <= 14 && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded ring-1 bg-amber-500/10 text-amber-400 ring-amber-500/20"
                                        title={`Earnings on ${sig.agent_outputs.earnings_guard.earnings_date}`}>
                                        <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />ER {sig.agent_outputs.earnings_guard.days_until}d
                                    </span>
                                )}
                            </div>

                            {/* Price levels */}
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                                {sig.target_price && (
                                    <span className="flex items-center">
                                        <Target className="w-3 h-3 mr-1 text-green-500" />
                                        Target: ${Number(sig.target_price).toFixed(2)}
                                    </span>
                                )}
                                {sig.stop_loss && (
                                    <span className="flex items-center">
                                        <ShieldAlert className="w-3 h-3 mr-1 text-red-500" />
                                        Stop: ${Number(sig.stop_loss).toFixed(2)}
                                    </span>
                                )}
                                {sig.suggested_entry_low && sig.suggested_entry_high && (
                                    <span>
                                        Entry: ${Number(sig.suggested_entry_low).toFixed(2)}–${Number(sig.suggested_entry_high).toFixed(2)}
                                    </span>
                                )}
                                <Link
                                    to={`/analysis/${sig.ticker}`}
                                    className="ml-auto flex items-center text-indigo-400 hover:text-indigo-300 transition-colors no-underline"
                                >
                                    Full Analysis <ChevronRight className="w-3 h-3 ml-0.5" />
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
