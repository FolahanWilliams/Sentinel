/**
 * Sentinel — Sentinel Helpers
 *
 * Color maps, formatters, and utility functions for the news intelligence UI.
 * Matches sentinel-spec.md §11.
 */

import type { ArticleCategory } from '@/types/sentinel';

/** Article category → hex color */
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

/** Sentiment → hex color */
export const SENTIMENT_COLORS = {
    bullish: '#22C55E',
    bearish: '#EF4444',
    neutral: '#6B7280',
} as const;

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

/** Relative time formatter */
export function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diff = Math.max(0, now - then);

    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

/** Format sentiment badge text */
export function sentimentLabel(s: 'bullish' | 'bearish' | 'neutral'): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Format impact label */
export function impactLabel(i: 'high' | 'medium' | 'low'): string {
    const map = { high: '★ HIGH', medium: '★ MEDIUM', low: '★ LOW' };
    return map[i];
}
