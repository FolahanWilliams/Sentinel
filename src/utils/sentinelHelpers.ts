/**
 * Sentinel — Sentinel Helpers (Consolidated)
 *
 * Phase 5 fix (Audit M8): Merged sentinel-helpers.ts and sentinelHelpers.ts
 * into a single source of truth. Contains both Tailwind CSS class maps (for
 * component styling) and hex color maps (for chart/SVG rendering).
 *
 * Uses the canonical timeAgo from formatters.ts instead of a local duplicate.
 */

import type { ArticleCategory } from '@/types/sentinel';
import { timeAgo } from '@/utils/formatters';

// Re-export canonical timeAgo so existing imports keep working
export { timeAgo };

/** Alias for backward compat with sentinel-helpers.ts consumers */
export const formatTimeAgo = timeAgo;

// ─── Tailwind CSS class maps (used in components) ───

/** Article category → Tailwind classes */
export const CATEGORY_COLORS: Record<ArticleCategory, string> = {
    ai_ml: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    crypto_web3: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    macro_economy: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    tech_earnings: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    startups_vc: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    cybersecurity: 'bg-red-500/10 text-red-400 border-red-500/20',
    regulation_policy: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    semiconductors: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    markets_trading: 'bg-green-500/10 text-green-400 border-green-500/20',
    geopolitics: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    other: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

/** Sentiment → Tailwind classes */
export const SENTIMENT_COLORS = {
    bullish: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    bearish: 'bg-red-500/10 text-red-400 border-red-500/20',
    neutral: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
} as const;

/** Impact → Tailwind classes */
export const IMPACT_STYLES = {
    high: 'font-bold text-amber-400 border-l-4 border-amber-400 bg-sentinel-800/50',
    medium: 'text-orange-300 border-l-2 border-orange-500/30',
    low: 'text-zinc-500',
} as const;

// ─── Hex color maps (used in charts/SVG) ───

/** Article category → hex color (for charts) */
export const ARTICLE_CATEGORY_COLORS: Record<ArticleCategory, string> = {
    ai_ml: '#8B5CF6',
    crypto_web3: '#F59E0B',
    macro_economy: '#3B82F6',
    tech_earnings: '#10B981',
    startups_vc: '#EC4899',
    cybersecurity: '#EF4444',
    regulation_policy: '#6366F1',
    semiconductors: '#14B8A6',
    markets_trading: '#22C55E',
    geopolitics: '#F97316',
    other: '#6B7280',
};

/** Sentiment → hex color (for charts) */
export const SENTIMENT_HEX_COLORS = {
    bullish: '#22C55E',
    bearish: '#EF4444',
    neutral: '#6B7280',
} as const;

// ─── Display helpers ───

/** Category display labels */
export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
    ai_ml: 'AI/ML',
    crypto_web3: 'Crypto',
    macro_economy: 'Macro',
    tech_earnings: 'Tech',
    startups_vc: 'Startups',
    cybersecurity: 'Security',
    regulation_policy: 'Policy',
    semiconductors: 'Semis',
    markets_trading: 'Markets',
    geopolitics: 'Geopolitics',
    other: 'Other',
};

/** Format sentiment badge text */
export function sentimentLabel(s: 'bullish' | 'bearish' | 'neutral'): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Format impact label */
export function impactLabel(i: 'high' | 'medium' | 'low'): string {
    const map = { high: '★ HIGH', medium: '★ MEDIUM', low: '★ LOW' } as const;
    return map[i];
}
