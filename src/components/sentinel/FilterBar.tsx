/**
 * Sentinel — FilterBar (Spec §7.4)
 *
 * Category pills, sentiment toggle, impact filter, search, and sort.
 */

import { Search } from 'lucide-react';
import type { SentinelFilters, ArticleCategory } from '@/types/sentinel';
import { ARTICLE_CATEGORY_COLORS, ARTICLE_CATEGORY_LABELS } from '@/utils/sentinelHelpers';

interface FilterBarProps {
    filters: SentinelFilters;
    onFiltersChange: (filters: SentinelFilters) => void;
}

const ALL_CATEGORIES: ArticleCategory[] = [
    'ai_ml', 'crypto_web3', 'macro_economy', 'tech_earnings', 'startups_vc',
    'cybersecurity', 'regulation_policy', 'semiconductors', 'markets_trading',
    'geopolitics', 'other',
];

export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
    const toggleCategory = (cat: ArticleCategory) => {
        const current = filters.categories;
        const newCats = current.includes(cat)
            ? current.filter(c => c !== cat)
            : [...current, cat];
        onFiltersChange({ ...filters, categories: newCats });
    };

    return (
        <div className="space-y-3">
            {/* Category pills */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {ALL_CATEGORIES.map(cat => {
                    const isActive = filters.categories.length === 0 || filters.categories.includes(cat);
                    const color = ARTICLE_CATEGORY_COLORS[cat];
                    return (
                        <button
                            key={cat}
                            onClick={() => toggleCategory(cat)}
                            style={{
                                padding: '4px 12px',
                                borderRadius: 'var(--radius-full)',
                                border: `1px solid ${isActive ? color : 'var(--color-border-default)'}`,
                                backgroundColor: isActive ? `${color}22` : 'transparent',
                                color: isActive ? color : 'var(--color-text-muted)',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {ARTICLE_CATEGORY_LABELS[cat]}
                        </button>
                    );
                })}
            </div>

            {/* Second row: sentiment, impact, search, sort */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Sentiment toggle */}
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border-default)' }}>
                    {(['all', 'bullish', 'bearish'] as const).map(s => {
                        const isActive = filters.sentiment === s;
                        const colors: Record<string, string> = { all: 'var(--color-text-primary)', bullish: '#22C55E', bearish: '#EF4444' };
                        return (
                            <button
                                key={s}
                                onClick={() => onFiltersChange({ ...filters, sentiment: s === 'all' ? 'all' : s })}
                                style={{
                                    padding: '4px 10px',
                                    border: 'none',
                                    backgroundColor: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                                    color: isActive ? colors[s] : 'var(--color-text-muted)',
                                    fontSize: '0.75rem',
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                }}
                            >
                                {s === 'all' ? '⚪ All' : s === 'bullish' ? '🟢 Bull' : '🔴 Bear'}
                            </button>
                        );
                    })}
                </div>

                {/* High impact toggle */}
                <button
                    onClick={() => onFiltersChange({ ...filters, highImpactOnly: !filters.highImpactOnly })}
                    style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-full)',
                        border: `1px solid ${filters.highImpactOnly ? '#F59E0B' : 'var(--color-border-default)'}`,
                        backgroundColor: filters.highImpactOnly ? '#F59E0B22' : 'transparent',
                        color: filters.highImpactOnly ? '#F59E0B' : 'var(--color-text-muted)',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                    }}
                >
                    ★ High Only
                </button>

                {/* Search */}
                <div className="flex-1 min-w-48 relative">
                    <Search
                        size={14}
                        style={{
                            position: 'absolute',
                            left: 10,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--color-text-muted)',
                        }}
                    />
                    <input
                        type="text"
                        placeholder="Search articles..."
                        value={filters.searchQuery}
                        onChange={e => onFiltersChange({ ...filters, searchQuery: e.target.value })}
                        style={{
                            width: '100%',
                            padding: '6px 10px 6px 30px',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border-default)',
                            backgroundColor: 'var(--color-bg-elevated)',
                            color: 'var(--color-text-primary)',
                            fontSize: '0.8rem',
                            outline: 'none',
                        }}
                    />
                </div>

                {/* Sort */}
                <select
                    value={filters.sortBy}
                    onChange={e => onFiltersChange({ ...filters, sortBy: e.target.value as 'newest' | 'impact' })}
                    style={{
                        padding: '6px 10px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-default)',
                        backgroundColor: 'var(--color-bg-elevated)',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        outline: 'none',
                    }}
                >
                    <option value="newest">Newest first</option>
                    <option value="impact">Highest impact</option>
                </select>
            </div>
        </div>
    );
}
