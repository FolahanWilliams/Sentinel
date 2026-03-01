/**
 * BiasBreakdown — Visualizes the cognitive bias classification for a signal.
 * Shows primary/secondary biases, strength, expected correction, and counter-argument.
 */

import { Brain, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/shared/Badge';
import { ConfidenceMeter } from '@/components/shared/ConfidenceMeter';

interface BiasBreakdownProps {
    biasType: string;
    secondaryBiases?: string[];
    biasExplanation?: string;
    counterArgument?: string;
    confidenceScore?: number;
    agentOutputs?: Record<string, any>;
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

export function BiasBreakdown({
    biasType,
    secondaryBiases = [],
    biasExplanation,
    counterArgument,
    confidenceScore,
    agentOutputs,
}: BiasBreakdownProps) {
    const biasColor = BIAS_COLORS[biasType] || '#6B7280';
    const biasData = agentOutputs?.bias_classifier;
    const strength = biasData?.bias_strength || 'moderate';
    const correction = biasData?.expected_correction;

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" /> Bias Analysis
            </h3>

            {/* Primary Bias */}
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

            {/* Secondary Biases */}
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

            {/* Confidence */}
            {confidenceScore != null && (
                <div className="mb-4">
                    <ConfidenceMeter value={confidenceScore} label="Confidence" />
                </div>
            )}

            {/* Expected Correction */}
            {correction && (
                <div className="mb-4 p-3 bg-sentinel-950/50 rounded-lg border border-sentinel-800/50">
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

            {/* Counter-Argument */}
            {counterArgument && (
                <div>
                    <h4 className="text-xs font-semibold text-sentinel-500 uppercase flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-3 h-3" /> Counter-Argument
                    </h4>
                    <p className="text-sm text-sentinel-300 leading-relaxed bg-sentinel-900/50 p-3 rounded-lg border-l-2 border-l-red-500/50">
                        {counterArgument}
                    </p>
                </div>
            )}
        </div>
    );
}
