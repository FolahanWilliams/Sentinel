/**
 * HighConvictionSetups — Dashboard widget showing top conviction signals
 * with key intelligence badges (quality tier, market regime, earnings proximity).
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { TrendingUp, Crown, ChevronRight, RefreshCw, Calculator } from 'lucide-react';
import { SignalQualityBadge } from '@/components/shared/SignalQualityBadge';
import { TickerLink } from '@/components/shared/TickerLink';
import { formatSignalType, isLongSignal } from '@/utils/badgeUtils';
import {
    ConfidenceBadge, ConvictionBadge, MoatBadge, LynchBadge, RoiBadge, MarketRegimeBadge, EarningsWarningBadge,
} from '@/components/shared/SignalBadges';
import type { AgentOutputsJson } from '@/types/signals';

interface ConvictionSignal {
    id: string;
    ticker: string;
    signal_type: string;
    confidence_score: number;
    calibrated_confidence: number | null;
    dqi_score: number | null;
    historical_win_rate: number | null;
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

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const normWinRate = (v: number | null) => (v == null ? 0.5 : v > 1 ? clamp01(v / 100) : clamp01(v));

/**
 * Fused decision score (0-100): geometric mean of calibrated win-probability,
 * decision-quality (DQI), and historical setup edge. Ranks the flagship surface
 * by "best trade now" — NOT by the raw LLM conviction self-rating, which bypasses
 * the entire guardrail pipeline. Geometric mean means a weak component (e.g. poor
 * historical edge) drags the whole score down.
 */
function fusedDecisionScore(sig: ConvictionSignal): number {
    const conf = clamp01(((sig.calibrated_confidence ?? sig.confidence_score) || 0) / 100);
    const dqi = clamp01((sig.dqi_score ?? 50) / 100);
    const edge = normWinRate(sig.historical_win_rate);
    return Math.round(Math.cbrt(conf * dqi * edge) * 100);
}

function DecisionScorePill({ score }: { score: number }) {
    const cls = score >= 70
        ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
        : score >= 50
            ? 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
            : 'bg-sentinel-700/30 text-sentinel-400 ring-sentinel-600/30';
    return (
        <span
            className={`px-1.5 py-0.5 text-[10px] font-bold rounded ring-1 font-mono ${cls}`}
            title="Decision score — calibrated confidence × decision quality × historical edge (geometric mean). Drives the ranking."
        >
            DQ {score}
        </span>
    );
}

export function HighConvictionSetups() {
    const navigate = useNavigate();
    const [signals, setSignals] = useState<ConvictionSignal[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHighConviction = useCallback(async () => {
        try {
            setLoading(true);
            // Pool of high-conviction-quality businesses, then RE-RANK by the
            // fused decision score so we surface the best *trades*, not just the
            // best companies (raw conviction_score bypasses the guardrails).
            const { data, error } = await supabase
                .from('signals')
                .select('*')
                .eq('status', 'active')
                .gte('conviction_score', 70)
                .order('created_at', { ascending: false })
                .limit(24);

            if (error) throw error;
            const pool = (data as unknown as ConvictionSignal[]) || [];
            pool.sort((a, b) => fusedDecisionScore(b) - fusedDecisionScore(a));
            setSignals(pool.slice(0, 5));
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
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const side = isLongSignal(sig.signal_type) ? 'long' : 'short';
                                        const params = new URLSearchParams({
                                            ticker: sig.ticker,
                                            side,
                                            ...(sig.stop_loss ? { stop: String(sig.stop_loss) } : {}),
                                            ...(sig.target_price ? { target: String(sig.target_price) } : {}),
                                            signal_id: sig.id,
                                            prefill: 'true',
                                        });
                                        navigate(`/positions?${params.toString()}`);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 px-2.5 py-1 bg-blue-600/15 hover:bg-blue-600/25 text-blue-400 rounded-lg text-[10px] font-medium transition-all ring-1 ring-blue-500/30 flex items-center gap-1 border-none cursor-pointer"
                                >
                                    <Calculator className="w-3 h-3" /> Open Position
                                </button>
                                <SignalQualityBadge agentOutputs={sig.agent_outputs} compact />
                                <span className="text-sentinel-600 group-hover:text-sentinel-400 transition-colors">
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <DecisionScorePill score={fusedDecisionScore(sig)} />
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
