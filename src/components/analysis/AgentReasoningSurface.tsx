/**
 * AgentReasoningSurface — Prominently surfaces key agent reasoning instead of
 * burying it in collapsed JSON blobs. Shows thesis, counter-thesis, biases,
 * critical flaws, and a confidence waterfall at a glance.
 *
 * Phase 2 P1 UI Features:
 *   3. Interactive Confidence Waterfall — each step is clickable; opens an inline
 *      detail panel showing the full agent output for that contribution.
 */

import { useState } from 'react';
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
    ChevronDown,
    ChevronUp,
    X,
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
                criticalFlaws?: string[];
                critical_flaws?: string[];
                adjustedConfidence?: number;
                adjusted_confidence?: number;
                confidence_adjustment?: number;
            } | null;
            sentiment_divergence?: { type: string; confidence_boost: number } | null;
            earnings_guard?: { penalty: number; days_until: number | null } | null;
            market_regime?: { regime: string; penalty: number } | null;
            backtest?: { penalty: number; signal_type_win_rate: number | null } | null;
            multi_timeframe?: { alignment: string; adjustment: number } | null;
            correlation_guard?: { penalty: number } | null;
            options_flow?: { confidence_adjustment: number; sentiment: string } | null;
            peer_strength?: { confidence_adjustment: number; is_idiosyncratic: boolean } | null;
            bias_detective?: { total_penalty: number; dominant_bias: string; findings?: any[]; bias_free?: boolean } | null;
            noise_confidence?: {
                confidence_adjustment: number;
                scores?: [number, number, number];
                mean?: number;
                std_dev?: number;
                convergent?: boolean;
                divergent?: boolean;
                summary?: string;
            } | null;
            decision_twin?: DecisionTwinResult | null;
            swot?: SWOTResult | null;
            proactive_thesis?: {
                catalyst: string;
                urgency: 'immediate' | 'watchlist' | 'developing';
                reasoning: string;
                direction: 'long' | 'short';
            } | null;
            context_bus?: {
                confidence_trail: Array<{
                    stage: string;
                    before: number;
                    after: number;
                    adjustment: number;
                    reason: string;
                }>;
                stages_completed: string[];
            } | null;
            conflict_resolution?: Array<{
                action: string;
                existingSignalId: string;
                existingTicker: string;
                reason: string;
            }> | null;
        };
    };
}

interface WaterfallStep {
    label: string;
    value: number;
    icon: React.ReactNode;
    detail: React.ReactNode; // always present — null-safe below
}

// ── Step detail panels ────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3 py-1 border-b border-sentinel-800/40 last:border-0">
            <span className="text-[11px] text-sentinel-500 flex-shrink-0">{label}</span>
            <span className="text-[11px] text-sentinel-200 text-right">{value}</span>
        </div>
    );
}

function StepDetailPanel({ step, onClose }: { step: WaterfallStep; onClose: () => void }) {
    return (
        <div className={`mt-2 rounded-xl border p-4 space-y-3 ${
            step.value > 0
                ? 'border-emerald-500/25 bg-emerald-950/20'
                : step.value < 0
                    ? 'border-red-500/25 bg-red-950/20'
                    : 'border-sentinel-700/40 bg-sentinel-800/30'
        }`}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sentinel-400">{step.icon}</span>
                    <span className="text-xs font-semibold text-sentinel-200">{step.label}</span>
                    <span className={`text-xs font-mono font-bold ${
                        step.value > 0 ? 'text-emerald-400' : step.value < 0 ? 'text-red-400' : 'text-sentinel-500'
                    }`}>
                        {step.value > 0 ? '+' : ''}{step.value}
                    </span>
                </div>
                <button
                    onClick={onClose}
                    className="text-sentinel-600 hover:text-sentinel-400 transition-colors p-0.5 rounded"
                    aria-label="Close detail"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Agent-specific content */}
            <div className="space-y-0.5">
                {step.detail}
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentReasoningSurface({ signal }: AgentReasoningSurfaceProps) {
    // useState must be called before any conditional returns (Rules of Hooks)
    const [openStep, setOpenStep] = useState<string | null>(null);

    const { agent_outputs } = signal;
    // Guard: older DB signals may have agent_outputs: null
    if (!agent_outputs) return null;

    const overreaction = agent_outputs.overreaction;
    const redTeam = agent_outputs.red_team;
    const selfCritique = agent_outputs.self_critique;

    const thesis = overreaction?.thesis || signal.thesis;
    const counterThesis = redTeam?.counter_thesis || signal.counter_argument;
    const identifiedBiases: string[] = overreaction?.identified_biases ?? [];
    const criticalFlaws: string[] =
        selfCritique?.criticalFlaws ?? selfCritique?.critical_flaws ?? [];

    const waterfallSteps = buildWaterfallSteps(signal);

    function toggleStep(label: string) {
        setOpenStep(prev => (prev === label ? null : label));
    }

    const activeStep = waterfallSteps.find(s => s.label === openStep) ?? null;

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm space-y-5">
            {/* Header */}
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider flex items-center gap-2">
                <Brain className="w-4 h-4 text-sentinel-400" />
                Agent Reasoning Surface
            </h3>

            {/* Proactive Thesis Engine Block (if this is a proactive signal) */}
            {agent_outputs.proactive_thesis && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-950/15 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Proactive Thesis Engine</span>
                        <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${
                            agent_outputs.proactive_thesis.urgency === 'immediate'
                                ? 'bg-red-500/15 text-red-400 ring-red-500/30'
                                : agent_outputs.proactive_thesis.urgency === 'watchlist'
                                    ? 'bg-amber-500/15 text-amber-400 ring-amber-500/30'
                                    : 'bg-blue-500/10 text-blue-400 ring-blue-500/20'
                        }`}>
                            {agent_outputs.proactive_thesis.urgency.toUpperCase()}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="text-[11px]">
                            <span className="text-sentinel-500">Catalyst:</span>{' '}
                            <span className="text-sentinel-200 font-medium">{agent_outputs.proactive_thesis.catalyst.replace(/_/g, ' ')}</span>
                        </div>
                        <div className="text-[11px]">
                            <span className="text-sentinel-500">Direction:</span>{' '}
                            <span className={`font-medium ${agent_outputs.proactive_thesis.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                                {agent_outputs.proactive_thesis.direction.toUpperCase()}
                            </span>
                        </div>
                    </div>
                    <p className="text-sm text-sentinel-300 leading-relaxed">{agent_outputs.proactive_thesis.reasoning}</p>
                    <p className="text-[10px] text-amber-500/70 mt-2 italic">
                        This signal was generated proactively from technical/relative-value analysis — no news catalyst required.
                    </p>
                </div>
            )}

            {/* Confidence Pipeline Trail (if context bus data exists) */}
            {agent_outputs.context_bus?.confidence_trail && agent_outputs.context_bus.confidence_trail.length > 0 && (
                <div className="rounded-lg border border-sentinel-700/40 bg-sentinel-800/20 p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <GitBranch className="w-4 h-4 text-sentinel-400" />
                        <span className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider">Confidence Pipeline</span>
                        <span className="ml-auto text-[10px] font-mono text-sentinel-500">
                            {agent_outputs.context_bus.stages_completed.length} stages
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        {agent_outputs.context_bus.confidence_trail.map((step, i) => {
                            const pct = Math.abs(step.adjustment);
                            return (
                                <div key={i} className="flex items-center gap-2 group">
                                    <span className="text-[10px] text-sentinel-500 font-mono w-28 truncate">{step.stage.replace(/_/g, ' ')}</span>
                                    <div className="flex-1 h-1.5 bg-sentinel-800 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full ${step.adjustment > 0 ? 'bg-emerald-500' : step.adjustment < 0 ? 'bg-red-500' : 'bg-sentinel-600'}`}
                                            style={{ width: `${Math.min(100, pct * 3)}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-mono text-sentinel-400 w-12 text-right">{step.before} &rarr; {step.after}</span>
                                    <span className={`text-[10px] font-mono font-bold w-8 text-right ${step.adjustment > 0 ? 'text-emerald-400' : step.adjustment < 0 ? 'text-red-400' : 'text-sentinel-500'}`}>
                                        {step.adjustment > 0 ? '+' : ''}{step.adjustment}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Conflict Resolutions (if any auto-resolved) */}
            {agent_outputs.conflict_resolution && agent_outputs.conflict_resolution.length > 0 && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-950/15 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Conflicts Auto-Resolved</span>
                    </div>
                    <div className="space-y-1.5">
                        {agent_outputs.conflict_resolution.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                                <span className="text-sentinel-200 font-medium">{r.existingTicker}</span>
                                <span className="text-sentinel-600">&mdash;</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                    r.action === 'expire_existing'
                                        ? 'bg-red-500/10 text-red-400'
                                        : r.action === 'reduce_existing_confidence'
                                            ? 'bg-amber-500/10 text-amber-400'
                                            : 'bg-sentinel-800 text-sentinel-400'
                                }`}>
                                    {r.action.replace(/_/g, ' ').toUpperCase()}
                                </span>
                                <span className="text-sentinel-400 flex-1 truncate">{r.reason}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Thesis & Counter-Thesis */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-lg border border-blue-500/30 bg-blue-950/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Thesis</span>
                    </div>
                    <p className="text-sm text-sentinel-200 leading-relaxed">
                        {thesis || 'No thesis available.'}
                    </p>
                </div>
                <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Shield className="w-4 h-4 text-orange-400" />
                        <span className="text-xs font-semibold text-orange-400 uppercase tracking-wider">Counter-Thesis</span>
                    </div>
                    <p className="text-sm text-sentinel-200 leading-relaxed">
                        {counterThesis || 'No counter-thesis available.'}
                    </p>
                </div>
            </div>

            {/* Biases & Critical Flaws */}
            {(identifiedBiases.length > 0 || criticalFlaws.length > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                    <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/25">
                                        {bias}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
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
                                    <div key={i} className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                                        <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                                        <span className="leading-relaxed">{flaw}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Decision Twin */}
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

            {/* ── Feature 3: Interactive Confidence Waterfall ── */}
            {waterfallSteps.length > 0 && (
                <div className="space-y-2">
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

                    {/* Scrollable step row — each pill is clickable */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {waterfallSteps.map((step, i) => {
                            const isOpen = openStep === step.label;
                            return (
                                <div key={step.label} className="flex items-center gap-1.5 flex-shrink-0">
                                    {i > 0 && (
                                        <ArrowRight className="w-3 h-3 text-sentinel-600 flex-shrink-0" />
                                    )}
                                    <button
                                        onClick={() => toggleStep(step.label)}
                                        title={`${isOpen ? 'Hide' : 'View'} ${step.label} details`}
                                        className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-2 min-w-[80px] transition-all cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-sentinel-500 ${
                                            isOpen
                                                ? step.value > 0
                                                    ? 'border-emerald-400/60 bg-emerald-900/40 ring-1 ring-emerald-500/30'
                                                    : step.value < 0
                                                        ? 'border-red-400/60 bg-red-900/40 ring-1 ring-red-500/30'
                                                        : 'border-sentinel-600 bg-sentinel-700/40 ring-1 ring-sentinel-500/30'
                                                : step.value > 0
                                                    ? 'border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-400/50 hover:bg-emerald-900/30'
                                                    : step.value < 0
                                                        ? 'border-red-500/30 bg-red-950/20 hover:border-red-400/50 hover:bg-red-900/30'
                                                        : 'border-sentinel-700/50 bg-sentinel-800/30 hover:border-sentinel-600 hover:bg-sentinel-700/30'
                                        }`}
                                    >
                                        <div className="text-sentinel-500">{step.icon}</div>
                                        <span className="text-[10px] text-sentinel-400 font-medium text-center leading-tight">
                                            {step.label}
                                        </span>
                                        <span className={`text-xs font-mono font-semibold ${
                                            step.value > 0 ? 'text-emerald-400' : step.value < 0 ? 'text-red-400' : 'text-sentinel-500'
                                        }`}>
                                            {step.value > 0 ? '+' : ''}{step.value}
                                        </span>
                                        {/* open/closed indicator */}
                                        <div className="text-sentinel-600">
                                            {isOpen
                                                ? <ChevronUp className="w-2.5 h-2.5" />
                                                : <ChevronDown className="w-2.5 h-2.5" />
                                            }
                                        </div>
                                    </button>
                                </div>
                            );
                        })}
                    </div>

                    {/* Detail panel — shown below the scroll row for the active step */}
                    {activeStep && (
                        <StepDetailPanel
                            step={activeStep}
                            onClose={() => setOpenStep(null)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

// ── Waterfall step builder (with rich detail content) ─────────────────────────

function buildWaterfallSteps(
    signal: AgentReasoningSurfaceProps['signal']
): WaterfallStep[] {
    const { agent_outputs } = signal;
    const steps: WaterfallStep[] = [];

    // ── Base confidence from overreaction agent ──
    const baseConfidence = agent_outputs.overreaction?.confidence_score;
    if (baseConfidence != null) {
        steps.push({
            label: 'Base',
            value: baseConfidence,
            icon: <Brain className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Base confidence" value={`${baseConfidence}%`} />
                    {agent_outputs.overreaction?.bias_type && (
                        <DetailRow label="Bias type" value={agent_outputs.overreaction.bias_type} />
                    )}
                    {agent_outputs.overreaction?.moat_rating != null && (
                        <DetailRow label="Moat rating" value={`${agent_outputs.overreaction.moat_rating}/10`} />
                    )}
                    {agent_outputs.overreaction?.conviction_score != null && (
                        <DetailRow label="Conviction" value={`${agent_outputs.overreaction.conviction_score}/100`} />
                    )}
                </>
            ),
        });
    }

    // ── TA / Multi-timeframe alignment ──
    if (agent_outputs.multi_timeframe) {
        const mt = agent_outputs.multi_timeframe;
        steps.push({
            label: 'TA Align',
            value: mt.adjustment,
            icon: <BarChart3 className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Alignment" value={mt.alignment} />
                    <DetailRow label="Adjustment" value={`${mt.adjustment > 0 ? '+' : ''}${mt.adjustment}`} />
                </>
            ),
        });
    }

    // ── Self-critique ──
    const sc = agent_outputs.self_critique;
    const critiqueBase = agent_outputs.overreaction?.confidence_score ?? signal.confidence_score;
    const critiqueAdjusted: number | undefined = sc?.adjustedConfidence ?? sc?.adjusted_confidence;
    if (critiqueAdjusted != null && critiqueBase != null) {
        const critiqueAdj = Math.round(critiqueAdjusted - critiqueBase);
        if (critiqueAdj !== 0) {
            const flaws: string[] = sc?.criticalFlaws ?? sc?.critical_flaws ?? [];
            steps.push({
                label: 'Critique',
                value: critiqueAdj,
                icon: <Eye className="w-3.5 h-3.5" />,
                detail: (
                    <>
                        <DetailRow label="Pre-critique" value={`${critiqueBase}%`} />
                        <DetailRow label="Post-critique" value={`${critiqueAdjusted}%`} />
                        <DetailRow label="Delta" value={`${critiqueAdj > 0 ? '+' : ''}${critiqueAdj}`} />
                        {flaws.length > 0 && (
                            <div className="pt-1">
                                <p className="text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Critical flaws</p>
                                {flaws.map((f, i) => (
                                    <p key={i} className="text-[11px] text-red-300 leading-relaxed mb-0.5">• {f}</p>
                                ))}
                            </div>
                        )}
                    </>
                ),
            });
        }
    }

    // ── Bias Detective ──
    const bd = agent_outputs.bias_detective;
    if (bd?.total_penalty) {
        steps.push({
            label: 'Bias Det.',
            value: -bd.total_penalty,
            icon: <Microscope className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Dominant bias" value={bd.dominant_bias} />
                    <DetailRow label="Total penalty" value={`−${bd.total_penalty}`} />
                    <DetailRow label="Bias-free" value={bd.bias_free ? 'Yes' : 'No'} />
                    {bd.findings && bd.findings.length > 0 && (
                        <div className="pt-1">
                            <p className="text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">
                                Findings ({bd.findings.length})
                            </p>
                            {bd.findings.slice(0, 4).map((f: any, i: number) => (
                                <div key={i} className="mb-1.5">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className={`text-[10px] font-semibold ${
                                            f.severity === 3 ? 'text-red-400' : f.severity === 2 ? 'text-amber-400' : 'text-yellow-500'
                                        }`}>
                                            {f.bias_name}
                                        </span>
                                        <span className="text-[9px] text-sentinel-600">
                                            Sev {f.severity} · −{f.penalty}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-sentinel-400 leading-relaxed">{f.evidence}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            ),
        });
    }

    // ── Noise-Aware Confidence (3-judge panel) ──
    const nc = agent_outputs.noise_confidence;
    const noiseAdj = nc?.confidence_adjustment;
    if (noiseAdj != null && noiseAdj !== 0) {
        steps.push({
            label: 'Noise',
            value: noiseAdj,
            icon: <Waves className="w-3.5 h-3.5" />,
            detail: (
                <>
                    {nc?.scores && (
                        <DetailRow
                            label="Judge scores"
                            value={`${nc.scores[0]} / ${nc.scores[1]} / ${nc.scores[2]}`}
                        />
                    )}
                    {nc?.mean != null && <DetailRow label="Mean" value={`${nc.mean}%`} />}
                    {nc?.std_dev != null && <DetailRow label="Std dev (σ)" value={nc.std_dev.toFixed(1)} />}
                    <DetailRow
                        label="Convergence"
                        value={nc?.convergent ? '✓ Convergent' : nc?.divergent ? '⚠ Divergent' : 'Moderate'}
                    />
                    <DetailRow label="Adjustment" value={`${noiseAdj > 0 ? '+' : ''}${noiseAdj}`} />
                    {nc?.summary && (
                        <p className="text-[11px] text-sentinel-400 leading-relaxed pt-1 border-t border-sentinel-800/40">
                            {nc.summary}
                        </p>
                    )}
                </>
            ),
        });
    }

    // ── Decision Twin ──
    const twinAdj = agent_outputs.decision_twin?.confidence_adjustment;
    if (twinAdj != null && twinAdj !== 0) {
        const dt = agent_outputs.decision_twin!;
        steps.push({
            label: 'Twins',
            value: twinAdj,
            icon: <Users className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Value" value={dt.value.verdict.toUpperCase()} />
                    <DetailRow label="Momentum" value={dt.momentum.verdict.toUpperCase()} />
                    <DetailRow label="Risk" value={dt.risk.verdict.toUpperCase()} />
                    <DetailRow label="Flagged" value={dt.flagged ? 'Yes' : 'No'} />
                    <DetailRow label="Adjustment" value={`${twinAdj > 0 ? '+' : ''}${twinAdj}`} />
                    <p className="text-[11px] text-sentinel-400 leading-relaxed pt-1 border-t border-sentinel-800/40">
                        {dt.summary}
                    </p>
                </>
            ),
        });
    }

    // ── Sentiment divergence ──
    if (agent_outputs.sentiment_divergence) {
        const sd = agent_outputs.sentiment_divergence;
        steps.push({
            label: 'Sentiment',
            value: sd.confidence_boost,
            icon: <TrendingUp className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Divergence type" value={sd.type} />
                    <DetailRow label="Boost" value={`+${sd.confidence_boost}`} />
                </>
            ),
        });
    }

    // ── Earnings guard ──
    if (agent_outputs.earnings_guard) {
        const eg = agent_outputs.earnings_guard;
        steps.push({
            label: 'Earnings',
            value: -eg.penalty,
            icon: <TrendingDown className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Penalty" value={`−${eg.penalty}`} />
                    <DetailRow
                        label="Days to earnings"
                        value={eg.days_until != null ? `${eg.days_until}d` : 'Unknown'}
                    />
                </>
            ),
        });
    }

    // ── Market regime ──
    if (agent_outputs.market_regime) {
        const mr = agent_outputs.market_regime;
        steps.push({
            label: 'Regime',
            value: -mr.penalty,
            icon: <Activity className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Regime" value={mr.regime} />
                    <DetailRow label="Penalty" value={`−${mr.penalty}`} />
                </>
            ),
        });
    }

    // ── Backtest ──
    if (agent_outputs.backtest) {
        const bt = agent_outputs.backtest;
        steps.push({
            label: 'Backtest',
            value: -bt.penalty,
            icon: <GitBranch className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Penalty" value={`−${bt.penalty}`} />
                    <DetailRow
                        label="Signal win rate"
                        value={bt.signal_type_win_rate != null
                            ? `${(bt.signal_type_win_rate * 100).toFixed(0)}%`
                            : 'N/A'
                        }
                    />
                </>
            ),
        });
    }

    // ── Correlation guard ──
    if (agent_outputs.correlation_guard) {
        const cg = agent_outputs.correlation_guard;
        steps.push({
            label: 'Correlation',
            value: -cg.penalty,
            icon: <Zap className="w-3.5 h-3.5" />,
            detail: (
                <DetailRow label="Penalty" value={`−${cg.penalty}`} />
            ),
        });
    }

    // ── Options flow ──
    if (agent_outputs.options_flow) {
        const of_ = agent_outputs.options_flow;
        steps.push({
            label: 'Options',
            value: of_.confidence_adjustment,
            icon: <Activity className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow label="Sentiment" value={of_.sentiment} />
                    <DetailRow
                        label="Adjustment"
                        value={`${of_.confidence_adjustment > 0 ? '+' : ''}${of_.confidence_adjustment}`}
                    />
                </>
            ),
        });
    }

    // ── Peer strength ──
    if (agent_outputs.peer_strength) {
        const ps = agent_outputs.peer_strength;
        steps.push({
            label: 'Peers',
            value: ps.confidence_adjustment,
            icon: <Users className="w-3.5 h-3.5" />,
            detail: (
                <>
                    <DetailRow
                        label="Idiosyncratic"
                        value={ps.is_idiosyncratic ? 'Yes' : 'No'}
                    />
                    <DetailRow
                        label="Adjustment"
                        value={`${ps.confidence_adjustment > 0 ? '+' : ''}${ps.confidence_adjustment}`}
                    />
                </>
            ),
        });
    }

    return steps;
}
