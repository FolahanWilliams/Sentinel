/**
 * SignalBadges — Reusable badge components for signal intelligence display.
 *
 * Consolidates badge styling that was previously duplicated across
 * Dashboard, ScanResults, SignalsSection, and HighConvictionSetups.
 */

import { Shield, AlertTriangle, BarChart3, Users } from 'lucide-react';
import type { DecisionTwinResult } from '@/types/agents';
import type { ConfluenceLevel } from '@/types/signals';

// ── Color utilities ───────────────────────────────────────────────

export function getConfidenceColor(score: number): string {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-blue-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-400';
}

export function getConfidenceBg(score: number): string {
    if (score >= 80) return 'bg-emerald-500/10 ring-emerald-500/20';
    if (score >= 60) return 'bg-blue-500/10 ring-blue-500/20';
    if (score >= 40) return 'bg-amber-500/10 ring-amber-500/20';
    return 'bg-red-500/10 ring-red-500/20';
}

export function getConfluenceColor(level: ConfluenceLevel | string | null): string {
    switch (level) {
        case 'strong': return 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30';
        case 'moderate': return 'bg-blue-500/15 text-blue-400 ring-blue-500/30';
        case 'weak': return 'bg-amber-500/15 text-amber-400 ring-amber-500/30';
        default: return 'bg-sentinel-800/50 text-sentinel-500 ring-sentinel-700/30';
    }
}

export function getConvictionColor(score: number): string {
    if (score >= 85) return 'bg-amber-500/15 text-amber-400 ring-amber-500/30';
    if (score >= 70) return 'bg-blue-500/10 text-blue-400 ring-blue-500/20';
    return 'bg-sentinel-800/50 text-sentinel-500 ring-sentinel-700/30';
}

export function formatSignalType(type: string): string {
    switch (type) {
        case 'long_overreaction': return 'Long \u2014 Overreaction';
        case 'short_overreaction': return 'Short \u2014 Overreaction';
        case 'sector_contagion': return 'Long \u2014 Contagion';
        case 'earnings_overreaction': return 'Long \u2014 Earnings';
        case 'bullish_catalyst': return 'Long \u2014 Catalyst';
        default: return type.replace(/_/g, ' ');
    }
}

export function isLongSignal(type: string): boolean {
    return type !== 'short_overreaction';
}

// ── Badge Components ──────────────────────────────────────────────

export function ConfidenceBadge({ score, className = '' }: { score: number; className?: string }) {
    return (
        <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${getConfidenceBg(score)} ${getConfidenceColor(score)} ${className}`}>
            {score}% CONF
        </span>
    );
}

export function ConfluenceBadge({ level }: { level: ConfluenceLevel | string | null }) {
    if (!level || level === 'none') return null;
    return (
        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${getConfluenceColor(level)}`}>
            {level.toUpperCase()} CONFLUENCE
        </span>
    );
}

export function ConvictionBadge({ score, reason }: { score: number | null; reason?: string | null }) {
    if (score == null || score <= 0) return null;
    return (
        <span
            className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${getConvictionColor(score)}`}
            title={reason || `Conviction: ${score}/100`}
        >
            <Shield className="w-2.5 h-2.5 inline mr-0.5" />CV {score}
        </span>
    );
}

export function RoiBadge({ roi }: { roi: number | null }) {
    if (roi == null) return null;
    return (
        <span className={`px-2 py-0.5 text-[10px] font-bold font-mono rounded ring-1 ${
            roi > 0
                ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                : 'bg-red-500/10 text-red-400 ring-red-500/20'
        }`}>
            ROI {roi > 0 ? '+' : ''}{roi}%
        </span>
    );
}

export function MarketRegimeBadge({ regime }: { regime: { regime: string; vix: number | null; penalty: number } | null | undefined }) {
    if (!regime) return null;
    return (
        <span
            className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${
                regime.regime === 'risk_on'
                    ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                    : regime.regime === 'risk_off'
                        ? 'bg-red-500/10 text-red-400 ring-red-500/20'
                        : 'bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/30'
            }`}
            title={`VIX: ${regime.vix ?? '?'} | Penalty: ${regime.penalty}`}
        >
            <BarChart3 className="w-2.5 h-2.5 inline mr-0.5" />{regime.regime.replace('_', ' ')}
        </span>
    );
}

export function EarningsWarningBadge({ guard }: { guard: { earnings_date: string | null; days_until: number | null; penalty: number } | null | undefined }) {
    if (!guard?.days_until || guard.days_until > 14) return null;
    return (
        <span
            className="px-2 py-0.5 text-[10px] font-bold rounded ring-1 bg-amber-500/10 text-amber-400 ring-amber-500/20"
            title={`Earnings on ${guard.earnings_date} | Confidence penalty: ${guard.penalty}`}
        >
            <AlertTriangle className="w-2.5 h-2.5 inline mr-0.5" />ER {guard.days_until}d
        </span>
    );
}

export function MoatBadge({ rating }: { rating: number | null | undefined }) {
    if (rating == null || rating < 6) return null;
    return (
        <span
            className="px-2 py-0.5 text-[10px] font-bold rounded ring-1 bg-amber-500/10 text-amber-300 ring-amber-500/20"
            title={`Buffett Moat Rating: ${rating}/10`}
        >
            MOAT {rating}/10
        </span>
    );
}

/**
 * Compact Decision Twin badge — shows panel verdict at a glance.
 * Only renders when decision_twin data is present.
 */
export function DecisionTwinBadge({ twin }: { twin: DecisionTwinResult | null | undefined }) {
    if (!twin) return null;

    const { unanimous_take, skip_count, caution_count, confidence_adjustment, summary } = twin;

    let className: string;
    let label: string;

    if (unanimous_take) {
        // 3×TAKE
        className = 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30';
        label = '3× TAKE';
    } else if (skip_count === 0 && caution_count === 1) {
        // 2×TAKE 1×CAUTION
        className = 'bg-blue-500/10 text-blue-400 ring-blue-500/20';
        label = '2T 1C';
    } else if (skip_count === 0 && caution_count >= 2) {
        // All CAUTION, or 1 TAKE + 2 CAUTION
        const takeCount = 3 - caution_count;
        className = 'bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/30';
        label = takeCount > 0 ? `${takeCount}T ${caution_count}C` : '3× CAUTION';
    } else if (skip_count === 1) {
        className = 'bg-amber-500/15 text-amber-400 ring-amber-500/30';
        label = '1 SKIP';
    } else if (skip_count === 2) {
        className = 'bg-red-500/15 text-red-400 ring-red-500/30';
        label = '2 SKIP';
    } else {
        // 3 SKIP
        className = 'bg-red-600/20 text-red-300 ring-red-600/40';
        label = '3× SKIP';
    }

    const adjStr = confidence_adjustment !== 0
        ? ` (${confidence_adjustment > 0 ? '+' : ''}${confidence_adjustment})`
        : '';

    return (
        <span
            className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${className}`}
            title={summary + adjStr}
        >
            <Users className="w-2.5 h-2.5 inline mr-0.5" />{label}
        </span>
    );
}

export function LynchBadge({ category }: { category: string | null | undefined }) {
    if (!category) return null;
    return (
        <span
            className="px-2 py-0.5 text-[10px] font-bold rounded ring-1 bg-violet-500/10 text-violet-400 ring-violet-500/20"
            title={`Lynch: ${category.replace('_', ' ')}`}
        >
            {category.replace('_', ' ').toUpperCase()}
        </span>
    );
}
