/**
 * DecisionTwinPanel — Displays the 3-persona Decision Twin simulation results.
 *
 * Layout:
 *   3 persona cards (horizontal on md+, stacked on mobile)
 *   └── Persona identity + verdict pill + rationale + key concern + confidence score
 *   Summary bar (unanimous / flagged / confidence adjustment)
 *
 * Persona colours:
 *   Value Investor   — amber  (Buffett = gold)
 *   Momentum Trader  — emerald (trend = green)
 *   Risk Manager     — blue   (defence = blue)
 *
 * Verdict colours:
 *   take    — emerald
 *   caution — amber
 *   skip    — red
 */

import { Scale, Zap, ShieldAlert, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import type { DecisionTwinResult, PersonaVerdict } from '@/types/agents';

// ── Persona metadata ──────────────────────────────────────────────────────────

const PERSONA_META = {
    value_investor: {
        label: 'Value Investor',
        description: 'Moat · Margin of Safety · Quality',
        icon: Scale,
        accent: {
            border: 'border-amber-500/30',
            bg: 'bg-amber-950/20',
            icon: 'text-amber-400',
            label: 'text-amber-400',
        },
    },
    momentum_trader: {
        label: 'Momentum Trader',
        description: 'RSI · Trend · Volume · MACD',
        icon: Zap,
        accent: {
            border: 'border-emerald-500/30',
            bg: 'bg-emerald-950/20',
            icon: 'text-emerald-400',
            label: 'text-emerald-400',
        },
    },
    risk_manager: {
        label: 'Risk Manager',
        description: 'R/R Ratio · Stop Quality · Regime',
        icon: ShieldAlert,
        accent: {
            border: 'border-blue-500/30',
            bg: 'bg-blue-950/20',
            icon: 'text-blue-400',
            label: 'text-blue-400',
        },
    },
} as const;

// ── Verdict components ────────────────────────────────────────────────────────

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
        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wider ${config.className}`}>
            <Icon className="w-3 h-3" />
            {config.label}
        </span>
    );
}

// ── Individual persona card ───────────────────────────────────────────────────

function PersonaCard({ verdict }: { verdict: PersonaVerdict }) {
    const meta = PERSONA_META[verdict.persona];
    const Icon = meta.icon;

    return (
        <div className={`flex flex-col gap-3 rounded-xl border ${meta.accent.border} ${meta.accent.bg} p-4 flex-1 min-w-0`}>
            {/* Header */}
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

// ── Panel summary bar ─────────────────────────────────────────────────────────

function SummaryBar({ result }: { result: DecisionTwinResult }) {
    const { unanimous_take, skip_count, flagged, confidence_adjustment, summary } = result;

    let barClass = 'bg-sentinel-900/40 border-sentinel-800/50';
    if (unanimous_take) barClass = 'bg-emerald-950/30 border-emerald-500/25';
    else if (flagged && skip_count >= 2) barClass = 'bg-red-950/25 border-red-500/25';
    else if (flagged) barClass = 'bg-amber-950/25 border-amber-500/25';

    return (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5 ${barClass}`}>
            <p className="text-xs text-sentinel-300 flex-1 min-w-0">{summary}</p>
            <div className={`flex-shrink-0 text-sm font-mono font-bold ${
                confidence_adjustment > 0
                    ? 'text-emerald-400'
                    : confidence_adjustment < 0
                        ? 'text-red-400'
                        : 'text-sentinel-500'
            }`}>
                {confidence_adjustment > 0 ? '+' : ''}{confidence_adjustment}
            </div>
        </div>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface DecisionTwinPanelProps {
    result: DecisionTwinResult;
}

export function DecisionTwinPanel({ result }: DecisionTwinPanelProps) {
    return (
        <div className="space-y-3">
            {/* 3-persona grid */}
            <div className="flex flex-col md:flex-row gap-3">
                <PersonaCard verdict={result.value} />
                <PersonaCard verdict={result.momentum} />
                <PersonaCard verdict={result.risk} />
            </div>

            {/* Summary + adjustment */}
            <SummaryBar result={result} />
        </div>
    );
}
