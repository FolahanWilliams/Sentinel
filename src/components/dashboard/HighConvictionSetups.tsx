/**
 * HighConvictionSetups — Dashboard widget showing top conviction signals
 * with key intelligence badges (quality tier, market regime, earnings proximity).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { Shield, TrendingUp, Crown, AlertTriangle, BarChart3, ChevronRight, RefreshCw } from 'lucide-react';
import { SignalQualityBadge } from '@/components/shared/SignalQualityBadge';
import type { AgentOutputsJson } from '@/types/signals';

interface ConvictionSignal {
    id: string;
    ticker: string;
    signal_type: string;
    confidence_score: number;
    conviction_score: number | null;
    why_high_conviction: string | null;
    moat_rating: number | null;
    lynch_category: string | null;
    projected_roi: number | null;
    target_price: number | null;
    stop_loss: number | null;
    agent_outputs: AgentOutputsJson | null;
    created_at: string;
}

export function HighConvictionSetups() {
    const navigate = useNavigate();
    const [signals, setSignals] = useState<ConvictionSignal[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHighConviction = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('signals')
                .select('*')
                .eq('status', 'active')
                .gte('conviction_score', 70)
                .order('conviction_score', { ascending: false })
                .limit(5);

            if (error) throw error;
            setSignals((data as unknown as ConvictionSignal[]) || []);
        } catch (err) {
            console.error('[HighConvictionSetups] Fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchHighConviction(); }, [fetchHighConviction]);

    if (loading) {
        return (
            <div className="bg-sentinel-950/50 border border-sentinel-800/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Crown className="w-5 h-5 text-amber-400" />
                    <h3 className="text-lg font-semibold text-sentinel-200">High Conviction Setups</h3>
                </div>
                <div className="flex items-center justify-center h-24">
                    <RefreshCw className="w-4 h-4 text-sentinel-600 animate-spin" />
                </div>
            </div>
        );
    }

    if (signals.length === 0) return null;

    return (
        <div className="bg-sentinel-950/50 border border-sentinel-800/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-amber-400" />
                    <h3 className="text-lg font-semibold text-sentinel-200">High Conviction Setups</h3>
                    <span className="text-xs text-sentinel-500 font-mono">{signals.length}</span>
                </div>
                <button
                    onClick={fetchHighConviction}
                    className="text-sentinel-500 hover:text-sentinel-300 transition-colors bg-transparent border-none cursor-pointer"
                    title="Refresh"
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                </button>
            </div>

            <div className="space-y-3">
                {signals.map((sig) => {
                    const isLong = sig.signal_type !== 'short_overreaction';
                    return (
                        <div
                            key={sig.id}
                            className="p-3 rounded-lg bg-sentinel-900/40 border border-sentinel-800/30 hover:border-sentinel-700/50 transition-colors cursor-pointer group"
                            onClick={() => navigate(`/analysis/${sig.ticker}`)}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-sentinel-800 text-sentinel-100 text-sm font-bold font-mono rounded ring-1 ring-sentinel-700">
                                        {sig.ticker}
                                    </span>
                                    <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ring-1 ${
                                        isLong
                                            ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                                            : 'bg-red-500/15 text-red-400 ring-red-500/30'
                                    }`}>
                                        {isLong ? <TrendingUp className="w-2.5 h-2.5 inline" /> : null}
                                        {' '}{sig.signal_type.replace(/_/g, ' ')}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <SignalQualityBadge agentOutputs={sig.agent_outputs} compact />
                                    <span className="text-sentinel-600 group-hover:text-sentinel-400 transition-colors">
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                {sig.conviction_score != null && (
                                    <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${
                                        sig.conviction_score >= 85
                                            ? 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
                                            : 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
                                    }`}>
                                        <Shield className="w-2.5 h-2.5 inline mr-0.5" />CV {sig.conviction_score}
                                    </span>
                                )}
                                {sig.moat_rating != null && sig.moat_rating >= 6 && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded ring-1 bg-amber-500/10 text-amber-300 ring-amber-500/20">
                                        MOAT {sig.moat_rating}/10
                                    </span>
                                )}
                                {sig.lynch_category && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded ring-1 bg-violet-500/10 text-violet-400 ring-violet-500/20">
                                        {sig.lynch_category.replace('_', ' ')}
                                    </span>
                                )}
                                {sig.projected_roi != null && (
                                    <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${
                                        sig.projected_roi > 0
                                            ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                            : 'bg-red-500/10 text-red-400 ring-red-500/20'
                                    }`}>
                                        ROI {sig.projected_roi > 0 ? '+' : ''}{sig.projected_roi}%
                                    </span>
                                )}
                                <span className="px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 bg-emerald-500/10 text-emerald-400 ring-emerald-500/20">
                                    {sig.confidence_score}% CONF
                                </span>
                                {sig.agent_outputs?.market_regime && (
                                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${
                                        sig.agent_outputs.market_regime.regime === 'risk_on'
                                            ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                                            : sig.agent_outputs.market_regime.regime === 'risk_off'
                                                ? 'bg-red-500/10 text-red-400 ring-red-500/20'
                                                : 'bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/30'
                                    }`}>
                                        <BarChart3 className="w-2.5 h-2.5 inline mr-0.5" />{sig.agent_outputs.market_regime.regime.replace('_', ' ')}
                                    </span>
                                )}
                                {sig.agent_outputs?.earnings_guard?.days_until != null && sig.agent_outputs.earnings_guard.days_until <= 14 && (
                                    <span className="px-2 py-0.5 text-[10px] font-bold rounded ring-1 bg-amber-500/10 text-amber-400 ring-amber-500/20">
                                        <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />ER {sig.agent_outputs.earnings_guard.days_until}d
                                    </span>
                                )}
                            </div>

                            {sig.why_high_conviction && (
                                <p className="text-xs text-sentinel-500 mt-2 line-clamp-1 italic">
                                    {sig.why_high_conviction}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
