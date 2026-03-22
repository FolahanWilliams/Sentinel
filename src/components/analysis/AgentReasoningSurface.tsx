/**
 * AgentReasoningSurface — Prominently surfaces key agent reasoning instead of
 * burying it in collapsed JSON blobs. Shows thesis, counter-thesis, biases,
 * critical flaws, and a confidence waterfall at a glance.
 */

import {
    Brain,
    Shield,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Activity,
    Eye,
    BarChart3,
    GitBranch,
    Zap,
    Users,
    ArrowRight,
    Microscope,
    Waves,
} from 'lucide-react';
import { formatPercent } from '@/utils/formatters';
import { DecisionTwinPanel } from './DecisionTwinPanel';
import { SWOTCard } from './SWOTCard';
import type { DecisionTwinResult, SWOTResult } from '@/types/agents';

interface AgentReasoningSurfaceProps {
    signal: {
        thesis: string;
        counter_argument: string;
        confidence_score: number;
        agent_outputs: {
            overreaction?: any;
            red_team?: any;
            self_critique?: {
                // CritiqueResult uses camelCase (from service), older records snake_case
                criticalFlaws?: string[];
                critical_flaws?: string[];
                adjustedConfidence?: number;
                adjusted_confidence?: number;
                confidence_adjustment?: number; // legacy alias
            } | null;
            sentiment_divergence?: { type: string; confidence_boost: number } | null;
            earnings_guard?: { penalty: number; days_until: number | null } | null;
            market_regime?: { regime: string; penalty: number } | null;
            backtest?: { penalty: number; signal_type_win_rate: number | null } | null;
            multi_timeframe?: { alignment: string; adjustment: number } | null;
            correlation_guard?: { penalty: number } | null;
            options_flow?: { confidence_adjustment: number; sentiment: string } | null;
            peer_strength?: { confidence_adjustment: number; is_idiosyncratic: boolean } | null;
            // Phase 2 agents
            bias_detective?: { total_penalty: number; dominant_bias: string } | null;
            noise_confidence?: { confidence_adjustment: number } | null;
            decision_twin?: DecisionTwinResult | null;
            swot?: SWOTResult | null;
        };
    };
}

interface WaterfallStep {
    label: string;
    value: number;
    icon: React.ReactNode;
}

export function AgentReasoningSurface({ signal }: AgentReasoningSurfaceProps) {
    const { agent_outputs } = signal;
    const overreaction = agent_outputs.overreaction;
    const redTeam = agent_outputs.red_team;
    const selfCritique = agent_outputs.self_critique;

    // Extract structured data
    // Note: self_critique is stored as CritiqueResult (camelCase keys from the service).
    // Support both camelCase (live run) and snake_case (older DB records).
    const thesis = overreaction?.thesis || signal.thesis;
    const counterThesis = redTeam?.counter_thesis || signal.counter_argument;
    const identifiedBiases: string[] = overreaction?.identified_biases ?? [];
    const criticalFlaws: string[] =
        selfCritique?.criticalFlaws ?? selfCritique?.critical_flaws ?? [];

    // Build confidence waterfall steps
    const waterfallSteps = buildWaterfallSteps(signal);

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm space-y-5">
            {/* Header */}
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider flex items-center gap-2">
                <Brain className="w-4 h-4 text-sentinel-400" />
                Agent Reasoning Surface
            </h3>

            {/* Thesis & Counter-Thesis Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Thesis */}
                <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                            Thesis
                        </span>
                    </div>
                    <p className="text-sm text-sentinel-200 leading-relaxed">
                        {thesis || 'No thesis available.'}
                    </p>
                </div>

                {/* Counter-Thesis */}
                <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-orange-400" />
                        <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
                            Counter-Thesis
                        </span>
                    </div>
                    <p className="text-sm text-sentinel-200 leading-relaxed">
                        {counterThesis || 'No counter-thesis available.'}
                    </p>
                </div>
            </div>

            {/* Biases & Critical Flaws */}
            {(identifiedBiases.length > 0 || criticalFlaws.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Identified Biases */}
                    {identifiedBiases.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Eye className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider">
                                    Biases Detected
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {identifiedBiases.map((bias, i) => (
                                    <span
                                        key={i}
                                        className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/25"
                                    >
                                        {bias}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Critical Flaws */}
                    {criticalFlaws.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                                <span className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider">
                                    Critical Flaws
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                {criticalFlaws.map((flaw, i) => (
                                    <div
                                        key={i}
                                        className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                                    >
                                        <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                                        <span className="leading-relaxed">{flaw}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Decision Twin Simulation */}
            {agent_outputs.decision_twin && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-sentinel-400" />
                        <span className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider">
                            Decision Twin Simulation
                        </span>
                    </div>
                    <DecisionTwinPanel result={agent_outputs.decision_twin} />
                </div>
            )}

            {/* SWOT Analysis */}
            {agent_outputs.swot && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Microscope className="w-3.5 h-3.5 text-sentinel-400" />
                        <span className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider">
                            SWOT Analysis
                        </span>
                    </div>
                    <SWOTCard result={agent_outputs.swot} />
                </div>
            )}

            {/* Confidence Waterfall */}
            {waterfallSteps.length > 0 && (
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-sentinel-400" />
                            <span className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider">
                                Confidence Waterfall
                            </span>
                        </div>
                        <span className="text-sm font-mono font-semibold text-sentinel-200">
                            Final: {formatPercent(signal.confidence_score)}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {waterfallSteps.map((step, i) => (
                            <div key={step.label} className="flex items-center gap-1.5 flex-shrink-0">
                                {i > 0 && (
                                    <ArrowRight className="w-3 h-3 text-sentinel-600 flex-shrink-0" />
                                )}
                                <div
                                    className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 min-w-[80px] ${
                                        step.value > 0
                                            ? 'border-emerald-500/30 bg-emerald-950/20'
                                            : step.value < 0
                                              ? 'border-red-500/30 bg-red-950/20'
                                              : 'border-sentinel-700/50 bg-sentinel-800/30'
                                    }`}
                                >
                                    <div className="text-sentinel-500">{step.icon}</div>
                                    <span className="text-[10px] text-sentinel-400 font-medium text-center leading-tight">
                                        {step.label}
                                    </span>
                                    <span
                                        className={`text-xs font-mono font-semibold ${
                                            step.value > 0
                                                ? 'text-emerald-400'
                                                : step.value < 0
                                                  ? 'text-red-400'
                                                  : 'text-sentinel-500'
                                        }`}
                                    >
                                        {step.value > 0 ? '+' : ''}
                                        {step.value}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Builds the ordered list of confidence waterfall adjustments from agent outputs.
 */
function buildWaterfallSteps(
    signal: AgentReasoningSurfaceProps['signal']
): WaterfallStep[] {
    const { agent_outputs } = signal;
    const steps: WaterfallStep[] = [];

    // Base confidence from overreaction agent
    const baseConfidence = agent_outputs.overreaction?.confidence_score;
    if (baseConfidence != null) {
        steps.push({
            label: 'Base',
            value: baseConfidence,
            icon: <Brain className="w-3.5 h-3.5" />,
        });
    }

    // TA / Multi-timeframe alignment
    if (agent_outputs.multi_timeframe) {
        steps.push({
            label: 'TA Align',
            value: agent_outputs.multi_timeframe.adjustment,
            icon: <BarChart3 className="w-3.5 h-3.5" />,
        });
    }

    // Self-critique — stored as CritiqueResult with camelCase keys.
    // We show the delta (adjusted - original) so the waterfall reflects the change.
    const sc = agent_outputs.self_critique;
    const critiqueBase = agent_outputs.overreaction?.confidence_score ?? signal.confidence_score;
    // adjustedConfidence is the final score; delta = adjusted - base
    const critiqueAdjusted: number | undefined = sc?.adjustedConfidence ?? sc?.adjusted_confidence;
    if (critiqueAdjusted != null && critiqueBase != null) {
        const critiqueAdj = Math.round(critiqueAdjusted - critiqueBase);
        if (critiqueAdj !== 0) {
            steps.push({
                label: 'Critique',
                value: critiqueAdj,
                icon: <Eye className="w-3.5 h-3.5" />,
            });
        }
    }

    // Bias Detective
    const biasDetective = agent_outputs.bias_detective;
    if (biasDetective?.total_penalty) {
        steps.push({
            label: 'Bias Det.',
            value: -biasDetective.total_penalty,
            icon: <Microscope className="w-3.5 h-3.5" />,
        });
    }

    // Noise-Aware Confidence
    const noiseAdj = agent_outputs.noise_confidence?.confidence_adjustment;
    if (noiseAdj != null && noiseAdj !== 0) {
        steps.push({
            label: 'Noise',
            value: noiseAdj,
            icon: <Waves className="w-3.5 h-3.5" />,
        });
    }

    // Decision Twin
    const twinAdj = agent_outputs.decision_twin?.confidence_adjustment;
    if (twinAdj != null && twinAdj !== 0) {
        steps.push({
            label: 'Twins',
            value: twinAdj,
            icon: <Users className="w-3.5 h-3.5" />,
        });
    }

    // Sentiment divergence
    if (agent_outputs.sentiment_divergence) {
        steps.push({
            label: 'Sentiment',
            value: agent_outputs.sentiment_divergence.confidence_boost,
            icon: <TrendingUp className="w-3.5 h-3.5" />,
        });
    }

    // Earnings guard
    if (agent_outputs.earnings_guard) {
        steps.push({
            label: 'Earnings',
            value: -agent_outputs.earnings_guard.penalty,
            icon: <TrendingDown className="w-3.5 h-3.5" />,
        });
    }

    // Market regime
    if (agent_outputs.market_regime) {
        steps.push({
            label: 'Regime',
            value: -agent_outputs.market_regime.penalty,
            icon: <Activity className="w-3.5 h-3.5" />,
        });
    }

    // Backtest
    if (agent_outputs.backtest) {
        steps.push({
            label: 'Backtest',
            value: -agent_outputs.backtest.penalty,
            icon: <GitBranch className="w-3.5 h-3.5" />,
        });
    }

    // Correlation guard
    if (agent_outputs.correlation_guard) {
        steps.push({
            label: 'Correlation',
            value: -agent_outputs.correlation_guard.penalty,
            icon: <Zap className="w-3.5 h-3.5" />,
        });
    }

    // Options flow
    if (agent_outputs.options_flow) {
        steps.push({
            label: 'Options',
            value: agent_outputs.options_flow.confidence_adjustment,
            icon: <Activity className="w-3.5 h-3.5" />,
        });
    }

    // Peer strength
    if (agent_outputs.peer_strength) {
        steps.push({
            label: 'Peers',
            value: agent_outputs.peer_strength.confidence_adjustment,
            icon: <Users className="w-3.5 h-3.5" />,
        });
    }

    return steps;
}
