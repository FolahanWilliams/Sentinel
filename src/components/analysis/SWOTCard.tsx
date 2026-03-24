/**
 * SWOTCard — Structured SWOT analysis display.
 *
 * Layout:
 *   2×2 grid: S (emerald) · W (red) · O (cyan) · T (amber)
 *   Each quadrant: header + bullet list of { point + evidence }
 *   Executive summary band at bottom
 *
 * Phase 2 P1 UI — Feature 4: Alpha Spotlight
 *   The Opportunities quadrant receives elevated visual treatment:
 *   - Brighter border + soft glow ring
 *   - "ALPHA EDGE" badge next to the label
 *   - First opportunity rendered as a spotlight callout (larger, highlighted)
 *   - Remaining opportunities use the standard bullet style
 */

import { TrendingUp, TrendingDown, Lightbulb, AlertTriangle, FileText, Sparkles } from 'lucide-react';
import type { SWOTResult, SWOTItem } from '@/types/agents';

// ── Quadrant config ───────────────────────────────────────────────────────────

const QUADRANTS = [
    {
        key: 'strengths' as const,
        label: 'Strengths',
        icon: TrendingUp,
        isAlpha: false,
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
        isAlpha: false,
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
        isAlpha: true,  // ← triggers Alpha Spotlight treatment
        accent: {
            border: 'border-cyan-400/50',
            bg: 'bg-cyan-950/25',
            icon: 'text-cyan-300',
            label: 'text-cyan-300',
            bullet: 'bg-cyan-400/40',
        },
    },
    {
        key: 'threats' as const,
        label: 'Threats',
        icon: AlertTriangle,
        isAlpha: false,
        accent: {
            border: 'border-amber-500/30',
            bg: 'bg-amber-950/20',
            icon: 'text-amber-400',
            label: 'text-amber-400',
            bullet: 'bg-amber-500/30',
        },
    },
] as const;

// ── Standard SWOT item row ────────────────────────────────────────────────────

function SWOTItemRow({ item, bulletClass }: { item: SWOTItem; bulletClass: string }) {
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

// ── Alpha Spotlight — first opportunity item ──────────────────────────────────

function AlphaSpotlightItem({ item }: { item: SWOTItem }) {
    return (
        <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/30 px-3 py-2.5 space-y-1">
            {/* "Primary alpha" micro-label */}
            <div className="flex items-center gap-1 mb-1">
                <Sparkles className="w-2.5 h-2.5 text-cyan-400" />
                <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">
                    Primary alpha
                </span>
            </div>
            <p className="text-xs font-semibold text-cyan-100 leading-relaxed">
                {item.point}
            </p>
            {item.evidence && (
                <p className="text-[11px] text-cyan-400/70 leading-relaxed">
                    {item.evidence}
                </p>
            )}
        </div>
    );
}

// ── Standard quadrant ─────────────────────────────────────────────────────────

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

// ── Alpha Spotlight quadrant (Opportunities) ──────────────────────────────────

function AlphaSpotlightQuadrant({ items }: { items: SWOTItem[] }) {
    const config = QUADRANTS.find(q => q.key === 'opportunities')!;
    const Icon = config.icon;
    const [spotlight, ...rest] = items;

    return (
        <div
            className={`rounded-xl border ${config.accent.border} ${config.accent.bg} p-4 flex flex-col gap-3`}
            style={{ boxShadow: '0 0 18px rgba(6, 182, 212, 0.10)' }}
        >
            {/* Header row — label + ALPHA EDGE badge */}
            <div className="flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${config.accent.icon}`} />
                <span className={`text-xs font-semibold tracking-wider uppercase ${config.accent.label}`}>
                    {config.label}
                </span>
                {/* Alpha Edge badge */}
                {items.length > 0 && (
                    <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-widest bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                        <Sparkles className="w-2.5 h-2.5" />
                        ALPHA EDGE
                    </span>
                )}
            </div>

            {items.length === 0 ? (
                <p className="text-[11px] text-sentinel-600 italic">No opportunities identified.</p>
            ) : (
                <div className="space-y-2.5">
                    {/* First item → spotlight callout */}
                    {spotlight && <AlphaSpotlightItem item={spotlight} />}

                    {/* Remaining items → standard bullets */}
                    {rest.length > 0 && (
                        <ul className="space-y-2.5">
                            {rest.map((item, i) => (
                                <SWOTItemRow
                                    key={i}
                                    item={item}
                                    bulletClass={config.accent.bullet}
                                />
                            ))}
                        </ul>
                    )}
                </div>
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
            {/* 2×2 grid — Opportunities gets the Alpha Spotlight treatment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {QUADRANTS.map((q) =>
                    q.isAlpha ? (
                        <AlphaSpotlightQuadrant
                            key={q.key}
                            items={result[q.key] ?? []}
                        />
                    ) : (
                        <SWOTQuadrant
                            key={q.key}
                            config={q}
                            items={result[q.key] ?? []}
                        />
                    )
                )}
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
