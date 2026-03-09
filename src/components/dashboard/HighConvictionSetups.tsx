/**
 * HighConvictionSetups — Dashboard widget showing top conviction signals
 * with key intelligence badges (quality tier, market regime, earnings proximity).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { TrendingUp, Crown, ChevronRight, RefreshCw } from 'lucide-react';
import { SignalQualityBadge } from '@/components/shared/SignalQualityBadge';
import { TickerLink } from '@/components/shared/TickerLink';
import {
    formatSignalType, isLongSignal,
    ConfidenceBadge, ConvictionBadge, MoatBadge, LynchBadge, RoiBadge, MarketRegimeBadge, EarningsWarningBadge,
} from '@/components/shared/SignalBadges';
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
                {signals.map((sig) => (
                    <div
                        key={sig.id}
                        className="p-3 rounded-lg bg-sentinel-900/40 border border-sentinel-800/30 hover:border-sentinel-700/50 transition-colors cursor-pointer group"
                        onClick={() => navigate(`/analysis/${sig.ticker}`)}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <TickerLink ticker={sig.ticker} className="text-sm" />
                                <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ring-1 ${
                                    isLongSignal(sig.signal_type)
                                        ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                                        : 'bg-red-500/15 text-red-400 ring-red-500/30'
                                }`}>
                                    {isLongSignal(sig.signal_type) ? <TrendingUp className="w-2.5 h-2.5 inline" /> : null}
                                    {' '}{formatSignalType(sig.signal_type)}
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
                            <ConvictionBadge score={sig.conviction_score} reason={sig.why_high_conviction} />
                            <MoatBadge rating={sig.moat_rating} />
                            <LynchBadge category={sig.lynch_category} />
                            <RoiBadge roi={sig.projected_roi} />
                            <ConfidenceBadge score={sig.confidence_score} />
                            <MarketRegimeBadge regime={sig.agent_outputs?.market_regime} />
                            <EarningsWarningBadge guard={sig.agent_outputs?.earnings_guard} />
                        </div>

                        {sig.why_high_conviction && (
                            <p className="text-xs text-sentinel-500 mt-2 line-clamp-1 italic">
                                {sig.why_high_conviction}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
