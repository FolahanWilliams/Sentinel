/**
 * DecisionTwinPanel — 3-persona Decision Twin simulation display.
 *
 * Features (Phase 2 P1 UI):
 *   1. Expandable per-persona reasoning  — chevron toggle reveals full chain-of-thought
 *   2. Triangular radar chart            — three confidence scores as filled triangle
 *   3. Summary bar with net adjustment   — unanimous / flagged / neutral
 */

import { useState } from 'react';
import {
    Scale, Zap, ShieldAlert,
    CheckCircle2, AlertCircle, XCircle,
    ChevronDown, ChevronUp,
} from 'lucide-react';
import type { DecisionTwinResult, PersonaVerdict } from '@/types/agents';

// ── Persona metadata ──────────────────────────────────────────────────────────

const PERSONA_META = {
    value_investor: {
        label: 'Value Investor',
        description: 'Moat · Margin of Safety · Quality',
        icon: Scale,
        accent: {
            border: 'border-amber-500/30',
            activeBorder: 'border-amber-500/60',
            bg: 'bg-amber-950/20',
            icon: 'text-amber-400',
            label: 'text-amber-400',
            toggle: 'text-amber-500 hover:text-amber-300 hover:bg-amber-500/10',
            reasoningBg: 'bg-amber-950/30 border-amber-500/20',
        },
        radarColor: '#f59e0b', // amber-400
    },
    momentum_trader: {
        label: 'Momentum Trader',
        description: 'RSI · Trend · Volume · MACD',
        icon: Zap,
        accent: {
            border: 'border-emerald-500/30',
            activeBorder: 'border-emerald-500/60',
            bg: 'bg-emerald-950/20',
            icon: 'text-emerald-400',
            label: 'text-emerald-400',
            toggle: 'text-emerald-500 hover:text-emerald-300 hover:bg-emerald-500/10',
            reasoningBg: 'bg-emerald-950/30 border-emerald-500/20',
        },
        radarColor: '#10b981', // emerald-400
    },
    risk_manager: {
        label: 'Risk Manager',
        description: 'R/R Ratio · Stop Quality · Regime',
        icon: ShieldAlert,
        accent: {
            border: 'border-blue-500/30',
            activeBorder: 'border-blue-500/60',
            bg: 'bg-blue-950/20',
            icon: 'text-blue-400',
            label: 'text-blue-400',
            toggle: 'text-blue-500 hover:text-blue-300 hover:bg-blue-500/10',
            reasoningBg: 'bg-blue-950/30 border-blue-500/20',
        },
        radarColor: '#3b82f6', // blue-400
    },
} as const;

// ── Verdict pill ──────────────────────────────────────────────────────────────

function VerdictPill({ verdict }: { verdict: PersonaVerdict['verdict'] }) {
    const config = {
        take: {
            icon: CheckCircle2,
            label: 'TAKE',
            className: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        },
        caution: {
            icon: AlertCircle,
            label: 'CAUTION',
            className: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
        },
        skip: {
            icon: XCircle,
            label: 'SKIP',
            className: 'bg-red-500/20 text-red-300 border border-red-500/40',
        },
    }[verdict];

    const Icon = config.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider flex-shrink-0 ${config.className}`}>
            <Icon className="w-3 h-3" />
            {config.label}
        </span>
    );
}

// ── Persona card with expandable reasoning ────────────────────────────────────

function PersonaCard({ verdict }: { verdict: PersonaVerdict }) {
    const [reasoningOpen, setReasoningOpen] = useState(false);
    const meta = PERSONA_META[verdict.persona];
    const Icon = meta.icon;
    const hasReasoning = !!verdict.reasoning?.trim();

    return (
        <div className={`flex flex-col gap-3 rounded-xl border transition-colors ${
            reasoningOpen ? meta.accent.activeBorder : meta.accent.border
        } ${meta.accent.bg} p-4 flex-1 min-w-0`}>

            {/* Header — identity + verdict */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 flex-shrink-0 ${meta.accent.icon}`} />
                    <div className="min-w-0">
                        <div className={`text-xs font-semibold ${meta.accent.label} leading-tight`}>
                            {meta.label}
                        </div>
                        <div className="text-[10px] text-sentinel-500 leading-tight mt-0.5">
                            {meta.description}
                        </div>
                    </div>
                </div>
                <VerdictPill verdict={verdict.verdict} />
            </div>

            {/* Rationale */}
            <p className="text-xs text-sentinel-300 leading-relaxed">
                {verdict.rationale}
            </p>

            {/* Key concern */}
            {verdict.key_concern && (
                <div className="flex items-start gap-1.5 text-[11px] text-sentinel-400 bg-sentinel-900/60 rounded-lg px-2.5 py-2">
                    <AlertCircle className="w-3 h-3 text-sentinel-500 flex-shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{verdict.key_concern}</span>
                </div>
            )}

            {/* Expandable full reasoning */}
            {hasReasoning && (
                <div>
                    <button
                        onClick={() => setReasoningOpen(o => !o)}
                        className={`flex items-center gap-1.5 text-[11px] font-medium rounded-md px-2 py-1 transition-colors w-full ${meta.accent.toggle}`}
                    >
                        {reasoningOpen
                            ? <ChevronUp className="w-3 h-3 flex-shrink-0" />
                            : <ChevronDown className="w-3 h-3 flex-shrink-0" />
                        }
                        {reasoningOpen ? 'Hide reasoning' : 'Full reasoning'}
                    </button>

                    {reasoningOpen && (
                        <div className={`mt-2 rounded-lg border p-3 ${meta.accent.reasoningBg}`}>
                            <p className="text-[11px] text-sentinel-300 leading-relaxed whitespace-pre-wrap">
                                {verdict.reasoning}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Persona confidence score */}
            <div className="flex items-center justify-end gap-1.5 mt-auto pt-1 border-t border-sentinel-800/40">
                <span className="text-[10px] text-sentinel-500">Persona confidence</span>
                <span className={`text-xs font-mono font-bold ${meta.accent.label}`}>
                    {verdict.confidence_score}%
                </span>
            </div>
        </div>
    );
}

// ── Feature 2: Triangular radar chart ────────────────────────────────────────

/**
 * PersonaRadarChart — SVG triangle radar for the 3 persona confidence scores.
 *
 * Three axes at -90° (top/Value), 30° (bottom-right/Momentum), 150° (bottom-left/Risk).
 * The filled polygon area grows from the center based on each score (0-100).
 */
function PersonaRadarChart({
    valueScore,
    momentumScore,
    riskScore,
}: {
    valueScore: number;
    momentumScore: number;
    riskScore: number;
}) {
    const CX = 100, CY = 105, R = 72;

    // Axes at equal 120° intervals, starting top (-90°)
    const ANGLES = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
    const scores = [valueScore / 100, momentumScore / 100, riskScore / 100];

    // Vertex positions for the outer (max) triangle
    const outerPts = ANGLES.map(a => ({
        x: CX + R * Math.cos(a),
        y: CY + R * Math.sin(a),
    }));

    // Vertex positions scaled by actual confidence scores
    const scorePts = ANGLES.map((a, i) => ({
        x: CX + R * (scores[i] ?? 0) * Math.cos(a),
        y: CY + R * (scores[i] ?? 0) * Math.sin(a),
    }));

    const toStr = (pts: { x: number; y: number }[]) =>
        pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Mid-point lines for reference grid (50%)
    const midPts = ANGLES.map(a => ({
        x: CX + (R * 0.5) * Math.cos(a),
        y: CY + (R * 0.5) * Math.sin(a),
    }));

    // Label positions — pushed further out from each vertex
    const LABEL_OFFSET = 17;
    const personas = [
        { angle: ANGLES[0], name: 'Value', score: valueScore, color: PERSONA_META.value_investor.radarColor },
        { angle: ANGLES[1], name: 'Mom.', score: momentumScore, color: PERSONA_META.momentum_trader.radarColor },
        { angle: ANGLES[2], name: 'Risk', score: riskScore, color: PERSONA_META.risk_manager.radarColor },
    ];

    return (
        <svg viewBox="-8 -8 216 228" className="w-full h-full" aria-hidden="true">
            {/* Outer triangle (max extent) */}
            <polygon
                points={toStr(outerPts)}
                fill="rgba(15,23,42,0.6)"
                stroke="rgba(100,116,139,0.25)"
                strokeWidth="1"
            />

            {/* Mid-point reference triangle (50%) */}
            <polygon
                points={toStr(midPts)}
                fill="none"
                stroke="rgba(100,116,139,0.15)"
                strokeWidth="0.75"
                strokeDasharray="3 3"
            />

            {/* Axis lines from center to each vertex */}
            {outerPts.map((pt, i) => (
                <line
                    key={i}
                    x1={CX} y1={CY}
                    x2={pt.x} y2={pt.y}
                    stroke="rgba(100,116,139,0.2)"
                    strokeWidth="0.75"
                />
            ))}

            {/* Score polygon — the filled area */}
            <polygon
                points={toStr(scorePts)}
                fill="rgba(99,102,241,0.18)"
                stroke="rgba(129,140,248,0.75)"
                strokeWidth="1.5"
                strokeLinejoin="round"
            />

            {/* Score dot at each vertex */}
            {scorePts.map((pt, i) => (
                <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r="3.5"
                    fill={personas[i]?.color}
                    stroke="rgba(15,23,42,0.8)"
                    strokeWidth="1"
                />
            ))}

            {/* Labels — persona name + score */}
            {personas.map((p, i) => {
                const lx = CX + (R + LABEL_OFFSET) * Math.cos(p.angle ?? 0);
                const ly = CY + (R + LABEL_OFFSET) * Math.sin(p.angle ?? 0);
                // Determine text-anchor based on position
                const anchor = i === 0 ? 'middle' : i === 1 ? 'start' : 'end';
                return (
                    <g key={i}>
                        <text
                            x={lx}
                            y={ly - 5}
                            textAnchor={anchor}
                            fill={p.color}
                            fontSize="8.5"
                            fontWeight="700"
                            letterSpacing="0.3"
                        >
                            {p.name}
                        </text>
                        <text
                            x={lx}
                            y={ly + 7}
                            textAnchor={anchor}
                            fill={p.color}
                            fontSize="8"
                            fontWeight="500"
                            opacity="0.8"
                        >
                            {p.score}%
                        </text>
                    </g>
                );
            })}
        </svg>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface DecisionTwinPanelProps {
    result: DecisionTwinResult;
}

export function DecisionTwinPanel({ result }: DecisionTwinPanelProps) {
    return (
        <div className="space-y-3">
            {/* 3-persona cards — full-width, horizontal on md+ */}
            <div className="flex flex-col md:flex-row gap-3">
                <PersonaCard verdict={result.value} />
                <PersonaCard verdict={result.momentum} />
                <PersonaCard verdict={result.risk} />
            </div>

            {/* Radar chart + summary bar — side by side */}
            <div className="flex items-center gap-4 rounded-xl border border-sentinel-800/50 bg-sentinel-900/30 px-4 py-3">
                {/* Radar — fixed width */}
                <div className="w-[110px] h-[115px] flex-shrink-0">
                    <PersonaRadarChart
                        valueScore={result.value.confidence_score}
                        momentumScore={result.momentum.confidence_score}
                        riskScore={result.risk.confidence_score}
                    />
                </div>

                {/* Summary text + adjustment */}
                <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-[11px] text-sentinel-400 leading-relaxed">
                        {result.summary}
                    </p>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] text-sentinel-500 uppercase tracking-wider">
                            Confidence impact
                        </span>
                        <span className={`text-base font-mono font-bold ${
                            result.confidence_adjustment > 0
                                ? 'text-emerald-400'
                                : result.confidence_adjustment < 0
                                    ? 'text-red-400'
                                    : 'text-sentinel-500'
                        }`}>
                            {result.confidence_adjustment > 0 ? '+' : ''}
                            {result.confidence_adjustment}
                        </span>
                        <span className="text-[10px] text-sentinel-600">
                            → {result.adjusted_confidence}% final
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
