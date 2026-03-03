/**
 * BiasBreakdown — Visualizes WHY the scanner flagged a stock.
 * Shows a weighted horizontal bar chart of signal drivers plus the existing
 * bias classification, counter-argument, and confidence meter.
 */

import { useState, useEffect } from 'react';
import { Brain, AlertTriangle, Zap, Loader2 } from 'lucide-react';
import { Badge } from '@/components/shared/Badge';
import { ConfidenceMeter } from '@/components/shared/ConfidenceMeter';
import type { BiasWeight } from '@/hooks/useTickerAnalysis';

interface BiasBreakdownProps {
    biasType: string;
    secondaryBiases?: string[];
    biasExplanation?: string;
    counterArgument?: string;
    confidenceScore?: number;
    agentOutputs?: Record<string, any>;
    /** AI-fetched weighted signal drivers */
    biasWeights?: BiasWeight[];
    weightsLoading?: boolean;
}

const BIAS_COLORS: Record<string, string> = {
    overreaction: '#EF4444',
    anchoring: '#F59E0B',
    herding: '#3B82F6',
    loss_aversion: '#EC4899',
    availability: '#8B5CF6',
    recency: '#F97316',
    confirmation: '#14B8A6',
    disposition_effect: '#6366F1',
    framing: '#10B981',
    representativeness: '#22C55E',
};

const SENTIMENT_COLORS = {
    bullish: { bar: '#10B981', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    bearish: { bar: '#EF4444', text: 'text-red-400', bg: 'bg-red-500/10' },
    neutral: { bar: '#6B7280', text: 'text-sentinel-400', bg: 'bg-sentinel-500/10' },
};

export function BiasBreakdown({
    biasType,
    secondaryBiases = [],
    biasExplanation,
    counterArgument,
    confidenceScore,
    agentOutputs,
    biasWeights = [],
    weightsLoading = false,
}: BiasBreakdownProps) {
    const biasColor = BIAS_COLORS[biasType] || '#6B7280';
    const biasData = agentOutputs?.bias_classifier;
    const strength = biasData?.bias_strength || 'moderate';
    const correction = biasData?.expected_correction;

    // Animated bar widths
    const [animatedWidths, setAnimatedWidths] = useState<number[]>([]);
    useEffect(() => {
        if (biasWeights.length > 0) {
            // Start at 0, animate to target
            setAnimatedWidths(biasWeights.map(() => 0));
            const timer = setTimeout(() => {
                setAnimatedWidths(biasWeights.map(w => w.weight));
            }, 50);
            return () => clearTimeout(timer);
        }
    }, [biasWeights]);

    return (
        <div className="glass-panel p-5 rounded-xl">
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" /> Bias Analysis
            </h3>

            {/* ── Signal Driver Weights (AI-fetched) ── */}
            {weightsLoading ? (
                <div className="mb-5 p-4 bg-sentinel-950/30 rounded-lg border border-white/5">
                    <div className="flex items-center gap-2 text-sm text-sentinel-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Analyzing signal drivers...
                    </div>
                </div>
            ) : biasWeights.length > 0 ? (
                <div className="mb-5">
                    <p className="text-xs text-sentinel-500 mb-3 flex items-center gap-1.5">
                        <Zap className="w-3 h-3" /> Why was this stock flagged?
                    </p>
                    <div className="space-y-3">
                        {biasWeights.map((w, i) => {
                            const colors = SENTIMENT_COLORS[w.sentiment] || SENTIMENT_COLORS.neutral;
                            return (
                                <div key={i}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-sm font-medium text-sentinel-200">{w.factor}</span>
                                        <span className={`text-xs font-mono font-bold ${colors.text}`}>
                                            {w.weight}%
                                        </span>
                                    </div>
                                    {/* Animated bar */}
                                    <div className="h-2.5 bg-sentinel-800/50 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-1000 ease-out"
                                            style={{
                                                width: `${animatedWidths[i] || 0}%`,
                                                backgroundColor: colors.bar,
                                            }}
                                        />
                                    </div>
                                    <p className="text-xs text-sentinel-500 mt-0.5">{w.description}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : null}

            {/* ── Primary Bias Classification ── */}
            <div className="mb-4">
                <div className="flex items-center gap-3 mb-2">
                    <Badge
                        label={biasType.replace('_', ' ')}
                        color={biasColor}
                        variant="subtle"
                        size="md"
                    />
                    <Badge
                        label={strength}
                        color={strength === 'strong' ? '#EF4444' : strength === 'moderate' ? '#F59E0B' : '#6B7280'}
                        variant="outline"
                        size="sm"
                    />
                </div>
                {biasExplanation && (
                    <p className="text-sm text-sentinel-300 leading-relaxed">{biasExplanation}</p>
                )}
            </div>

            {/* ── Secondary Biases ── */}
            {secondaryBiases.length > 0 && (
                <div className="mb-4">
                    <p className="text-xs text-sentinel-500 mb-1">Secondary Biases:</p>
                    <div className="flex flex-wrap gap-1.5">
                        {secondaryBiases.map(b => (
                            <Badge
                                key={b}
                                label={b.replace('_', ' ')}
                                color={BIAS_COLORS[b] || '#6B7280'}
                                size="sm"
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Confidence ── */}
            {confidenceScore != null && (
                <div className="mb-4">
                    <ConfidenceMeter value={confidenceScore} label="Confidence" />
                </div>
            )}

            {/* ── Expected Correction ── */}
            {correction && (
                <div className="mb-4 p-3 bg-sentinel-950/30 rounded-lg border border-white/5">
                    <p className="text-xs text-sentinel-500 mb-1">Expected Correction</p>
                    <div className="flex items-center gap-4 text-sm">
                        <span className={correction.direction === 'up' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                            {correction.direction === 'up' ? '↑' : '↓'} {correction.magnitude_pct}%
                        </span>
                        <span className="text-sentinel-400">within {correction.timeframe_days}d</span>
                        <span className="text-sentinel-500 font-mono">P={Math.round(correction.probability * 100)}%</span>
                    </div>
                </div>
            )}

            {/* ── Counter-Argument ── */}
            {counterArgument && (
                <div>
                    <h4 className="text-xs font-semibold text-sentinel-500 uppercase flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-3 h-3" /> Counter-Argument
                    </h4>
                    <p className="text-sm text-sentinel-300 leading-relaxed bg-sentinel-950/30 p-3 rounded-lg border-l-2 border-l-red-500/50">
                        {counterArgument}
                    </p>
                </div>
            )}
        </div>
    );
}
