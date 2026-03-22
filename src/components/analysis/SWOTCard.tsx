/**
 * SWOTCard — Structured SWOT analysis display.
 *
 * Layout:
 *   2×2 grid: S (emerald) · W (red) · O (cyan) · T (amber)
 *   Each quadrant: header + bullet list of { point + evidence }
 *   Executive summary band at bottom
 */

import { TrendingUp, TrendingDown, Lightbulb, AlertTriangle, FileText } from 'lucide-react';
import type { SWOTResult, SWOTItem } from '@/types/agents';

// ── Quadrant config ───────────────────────────────────────────────────────────

const QUADRANTS = [
    {
        key: 'strengths' as const,
        label: 'Strengths',
        icon: TrendingUp,
        accent: {
            border: 'border-emerald-500/30',
            bg: 'bg-emerald-950/20',
            icon: 'text-emerald-400',
            label: 'text-emerald-400',
            bullet: 'bg-emerald-500/30',
        },
    },
    {
        key: 'weaknesses' as const,
        label: 'Weaknesses',
        icon: TrendingDown,
        accent: {
            border: 'border-red-500/30',
            bg: 'bg-red-950/20',
            icon: 'text-red-400',
            label: 'text-red-400',
            bullet: 'bg-red-500/30',
        },
    },
    {
        key: 'opportunities' as const,
        label: 'Opportunities',
        icon: Lightbulb,
        accent: {
            border: 'border-cyan-500/30',
            bg: 'bg-cyan-950/20',
            icon: 'text-cyan-400',
            label: 'text-cyan-400',
            bullet: 'bg-cyan-500/30',
        },
    },
    {
        key: 'threats' as const,
        label: 'Threats',
        icon: AlertTriangle,
        accent: {
            border: 'border-amber-500/30',
            bg: 'bg-amber-950/20',
            icon: 'text-amber-400',
            label: 'text-amber-400',
            bullet: 'bg-amber-500/30',
        },
    },
] as const;

// ── Single SWOT item ──────────────────────────────────────────────────────────

function SWOTItemRow({
    item,
    bulletClass,
}: {
    item: SWOTItem;
    bulletClass: string;
}) {
    return (
        <li className="flex items-start gap-2">
            <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${bulletClass}`} />
            <div className="min-w-0">
                <span className="text-xs text-sentinel-200 leading-relaxed font-medium">
                    {item.point}
                </span>
                {item.evidence && (
                    <span className="block text-[11px] text-sentinel-500 leading-relaxed mt-0.5">
                        {item.evidence}
                    </span>
                )}
            </div>
        </li>
    );
}

// ── Single quadrant ───────────────────────────────────────────────────────────

function SWOTQuadrant({
    config,
    items,
}: {
    config: typeof QUADRANTS[number];
    items: SWOTItem[];
}) {
    const Icon = config.icon;

    return (
        <div className={`rounded-xl border ${config.accent.border} ${config.accent.bg} p-4 flex flex-col gap-3`}>
            <div className="flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${config.accent.icon}`} />
                <span className={`text-xs font-semibold tracking-wider uppercase ${config.accent.label}`}>
                    {config.label}
                </span>
            </div>

            {items.length > 0 ? (
                <ul className="space-y-2.5">
                    {items.map((item, i) => (
                        <SWOTItemRow
                            key={i}
                            item={item}
                            bulletClass={config.accent.bullet}
                        />
                    ))}
                </ul>
            ) : (
                <p className="text-[11px] text-sentinel-600 italic">No items identified.</p>
            )}
        </div>
    );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface SWOTCardProps {
    result: SWOTResult;
}

export function SWOTCard({ result }: SWOTCardProps) {
    return (
        <div className="space-y-3">
            {/* 2×2 grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {QUADRANTS.map((q) => (
                    <SWOTQuadrant
                        key={q.key}
                        config={q}
                        items={result[q.key] ?? []}
                    />
                ))}
            </div>

            {/* Executive summary */}
            {result.executive_summary && (
                <div className="flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-950/15 px-4 py-3">
                    <FileText className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-1.5">
                            Executive Summary
                        </p>
                        <p className="text-sm text-sentinel-200 leading-relaxed">
                            {result.executive_summary}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
