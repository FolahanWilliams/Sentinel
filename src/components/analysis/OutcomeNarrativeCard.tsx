/**
 * OutcomeNarrativeCard — Displays AI-generated outcome narratives
 * for signal checkpoints (1d, 5d, 10d, 30d).
 */

import { useState, useEffect } from 'react';
import { Clock, TrendingUp, TrendingDown, Brain, Loader2 } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { OutcomeNarrativeGenerator, type OutcomeNarrativeResult } from '@/services/outcomeNarrative';
import { formatPrice, formatPercent } from '@/utils/formatters';

interface SignalOutcome {
    id: string;
    signal_id: string;
    ticker: string;
    entry_price: number;
    price_at_1d: number | null;
    price_at_5d: number | null;
    price_at_10d: number | null;
    price_at_30d: number | null;
    return_at_1d: number | null;
    return_at_5d: number | null;
    return_at_10d: number | null;
    return_at_30d: number | null;
    outcome: 'win' | 'loss' | 'breakeven' | 'pending';
    hit_stop_loss: boolean;
    hit_target: boolean;
    max_drawdown: number | null;
    max_gain: number | null;
    tracked_at: string;
}

interface OutcomeNarrativeCardProps {
    signalId: string;
    ticker: string;
    thesis: string;
}

interface Checkpoint {
    label: string;
    days: number;
    price: number | null;
    returnPct: number | null;
}

const CACHE_PREFIX = 'narrative_';

const THESIS_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
    confirmed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
    partially_confirmed: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
    invalidated: { bg: 'bg-red-500/20', text: 'text-red-400' },
    inconclusive: { bg: 'bg-sentinel-500/20', text: 'text-sentinel-400' },
};

const THESIS_LABELS: Record<string, string> = {
    confirmed: 'Confirmed',
    partially_confirmed: 'Partially Confirmed',
    invalidated: 'Invalidated',
    inconclusive: 'Inconclusive',
};

function getReturnBarWidth(returnPct: number | null): string {
    if (returnPct == null) return '0%';
    return `${Math.min(Math.abs(returnPct) * 2, 100)}%`;
}

export function OutcomeNarrativeCard({ signalId, ticker, thesis }: OutcomeNarrativeCardProps) {
    const [outcome, setOutcome] = useState<SignalOutcome | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [narrative, setNarrative] = useState<OutcomeNarrativeResult | null>(null);
    const [generating, setGenerating] = useState(false);

    // Load outcome data from Supabase
    useEffect(() => {
        let cancelled = false;

        async function fetchOutcome() {
            setLoading(true);
            setError(null);
            setNarrative(null);
            try {
                const { data, error: fetchErr } = await supabase
                    .from('signal_outcomes')
                    .select('*')
                    .eq('signal_id', signalId)
                    .maybeSingle();

                if (cancelled) return;
                if (fetchErr) throw fetchErr;
                setOutcome(data as SignalOutcome | null);
            } catch (err) {
                if (cancelled) return;
                console.error('[OutcomeNarrativeCard] Fetch failed:', err);
                setError('Failed to load outcome data.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchOutcome();
        return () => { cancelled = true; };
    }, [signalId]);

    // Restore cached narrative
    useEffect(() => {
        try {
            const cached = localStorage.getItem(`${CACHE_PREFIX}${signalId}`);
            if (cached) {
                setNarrative(JSON.parse(cached));
            }
        } catch {
            // Ignore parse errors
        }
    }, [signalId]);

    function buildCheckpoints(o: SignalOutcome): Checkpoint[] {
        return [
            { label: '1D', days: 1, price: o.price_at_1d, returnPct: o.return_at_1d },
            { label: '5D', days: 5, price: o.price_at_5d, returnPct: o.return_at_5d },
            { label: '10D', days: 10, price: o.price_at_10d, returnPct: o.return_at_10d },
            { label: '30D', days: 30, price: o.price_at_30d, returnPct: o.return_at_30d },
        ];
    }

    async function handleGenerate() {
        if (!outcome) return;

        // Pick the latest available checkpoint for the narrative
        const checkpoints = buildCheckpoints(outcome);
        const latest = [...checkpoints].reverse().find((cp) => cp.price != null);
        if (!latest || latest.price == null || latest.returnPct == null) return;

        setGenerating(true);
        try {
            const result = await OutcomeNarrativeGenerator.generateNarrative({
                ticker,
                originalThesis: thesis,
                entryPrice: outcome.entry_price,
                currentPrice: latest.price,
                returnPct: latest.returnPct,
                daysElapsed: latest.days,
                hitTarget: outcome.hit_target,
                hitStop: outcome.hit_stop_loss,
            });

            if (result) {
                setNarrative(result);
                localStorage.setItem(`${CACHE_PREFIX}${signalId}`, JSON.stringify(result));
            }
        } catch (err) {
            console.error('[OutcomeNarrativeCard] Generate failed:', err);
        } finally {
            setGenerating(false);
        }
    }

    if (loading) {
        return (
            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm flex items-center justify-center gap-2 text-sentinel-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading outcome data...</span>
            </div>
        );
    }

    if (error || !outcome) {
        return (
            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-teal-400" /> Outcome Narrative
                </h3>
                <p className="text-sm text-sentinel-500">
                    {error || 'No outcome data available for this signal yet.'}
                </p>
            </div>
        );
    }

    const checkpoints = buildCheckpoints(outcome);
    const hasAnyCheckpoint = checkpoints.some((cp) => cp.price != null);

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-400" /> Outcome Narrative
            </h3>

            {/* Entry price */}
            <div className="flex items-center justify-between mb-4 bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50">
                <span className="text-xs text-sentinel-500">Entry Price</span>
                <span className="text-sm font-mono font-bold text-sentinel-200">
                    {formatPrice(outcome.entry_price)}
                </span>
            </div>

            {/* Checkpoint timeline */}
            <div className="space-y-2 mb-4">
                {checkpoints.map((cp) => {
                    const available = cp.price != null;
                    const positive = cp.returnPct != null && cp.returnPct >= 0;

                    return (
                        <div
                            key={cp.label}
                            className={`flex items-center gap-3 rounded-lg p-3 border transition-colors ${
                                available
                                    ? 'bg-sentinel-950/50 border-sentinel-800/50'
                                    : 'bg-sentinel-950/20 border-sentinel-800/20 opacity-50'
                            }`}
                        >
                            {/* Day label */}
                            <span className="text-xs font-semibold text-sentinel-400 w-8 shrink-0">
                                {cp.label}
                            </span>

                            {/* Price */}
                            <span className="text-sm font-mono text-sentinel-200 w-20 shrink-0">
                                {available ? formatPrice(cp.price!) : '--'}
                            </span>

                            {/* Return bar */}
                            <div className="flex-1 h-2 bg-sentinel-800/50 rounded-full overflow-hidden">
                                {available && cp.returnPct != null && (
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            positive ? 'bg-emerald-500' : 'bg-red-500'
                                        }`}
                                        style={{ width: getReturnBarWidth(cp.returnPct) }}
                                    />
                                )}
                            </div>

                            {/* Return % and icon */}
                            <div className="flex items-center gap-1 w-20 justify-end shrink-0">
                                {available && cp.returnPct != null ? (
                                    <>
                                        {positive ? (
                                            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                                        ) : (
                                            <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                                        )}
                                        <span
                                            className={`text-sm font-mono font-medium ${
                                                positive ? 'text-emerald-400' : 'text-red-400'
                                            }`}
                                        >
                                            {formatPercent(cp.returnPct)}
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-xs text-sentinel-600">Pending</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Narrative section */}
            {narrative ? (
                <div className="space-y-3">
                    {/* Thesis validation badge */}
                    <div className="flex items-center gap-2">
                        <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                THESIS_BADGE_STYLES[narrative.thesis_validation]?.bg ?? 'bg-sentinel-500/20'
                            } ${
                                THESIS_BADGE_STYLES[narrative.thesis_validation]?.text ?? 'text-sentinel-400'
                            }`}
                        >
                            {THESIS_LABELS[narrative.thesis_validation] ?? 'Inconclusive'}
                        </span>
                    </div>

                    {/* Narrative text */}
                    <div className="bg-sentinel-950/80 rounded-lg p-4 border border-sentinel-800/50">
                        <div className="flex items-start gap-2">
                            <Brain className="w-4 h-4 text-teal-400 mt-0.5 shrink-0" />
                            <p className="text-sm text-sentinel-300 leading-relaxed">
                                {narrative.narrative}
                            </p>
                        </div>
                    </div>

                    {/* Key drivers */}
                    {narrative.key_drivers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {narrative.key_drivers.map((driver) => (
                                <span
                                    key={driver}
                                    className="inline-flex items-center px-2 py-0.5 rounded-md bg-sentinel-800/60 text-xs text-sentinel-400 border border-sentinel-700/40"
                                >
                                    {driver}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Regenerate button */}
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="w-full px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-300 rounded-lg text-sm transition-colors ring-1 ring-sentinel-700 flex items-center justify-center gap-2"
                    >
                        {generating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Brain className="w-4 h-4" />
                        )}
                        Regenerate Narrative
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleGenerate}
                    disabled={generating || !hasAnyCheckpoint}
                    className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                    {generating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Brain className="w-4 h-4" />
                    )}
                    Generate Narrative
                </button>
            )}
        </div>
    );
}
