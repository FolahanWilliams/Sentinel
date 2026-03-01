/**
 * Sentinel — SentinelPanel (Spec §7.1)
 *
 * Main container for the news intelligence feed.
 * Composes: BriefingBar + FilterBar + ArticleCard feed + SignalsSidebar
 */

import { useState, useMemo } from 'react';
import { useSentinel } from '@/hooks/useSentinel';
import { BriefingBar } from './BriefingBar';
import { FilterBar } from './FilterBar';
import { ArticleCard } from './ArticleCard';
import { SignalsSidebar } from './SignalsSidebar';
import { SentinelSkeleton } from './SentinelSkeleton';
import type { SentinelFilters, ArticleCategory } from '@/types/sentinel';
import { RefreshCw, AlertTriangle } from 'lucide-react';

const DEFAULT_FILTERS: SentinelFilters = {
    categories: [],
    sentiment: 'all',
    highImpactOnly: false,
    searchQuery: '',
    sortBy: 'newest',
};

export function SentinelPanel() {
    const { data, loading, error, refresh } = useSentinel();
    const [filters, setFilters] = useState<SentinelFilters>(DEFAULT_FILTERS);

    // Client-side filtering
    const filteredArticles = useMemo(() => {
        if (!data?.articles) return [];

        let articles = [...data.articles];

        // Category filter
        if (filters.categories.length > 0) {
            articles = articles.filter(a =>
                filters.categories.includes(a.category as ArticleCategory)
            );
        }

        // Sentiment filter
        if (filters.sentiment !== 'all') {
            articles = articles.filter(a => a.sentiment === filters.sentiment);
        }

        // High impact only
        if (filters.highImpactOnly) {
            articles = articles.filter(a => a.impact === 'high');
        }

        // Search
        if (filters.searchQuery.trim()) {
            const q = filters.searchQuery.toLowerCase();
            articles = articles.filter(a =>
                a.title.toLowerCase().includes(q) ||
                a.summary.toLowerCase().includes(q) ||
                a.entities.some(e => e.toLowerCase().includes(q)) ||
                a.source.toLowerCase().includes(q)
            );
        }

        // Sort
        if (filters.sortBy === 'impact') {
            const impactOrder = { high: 0, medium: 1, low: 2 };
            articles.sort((a, b) =>
                (impactOrder[a.impact] ?? 3) - (impactOrder[b.impact] ?? 3)
            );
        } else {
            articles.sort((a, b) => b.pubDate.localeCompare(a.pubDate));
        }

        return articles;
    }, [data?.articles, filters]);

    if (loading && !data) {
        return <SentinelSkeleton />;
    }

    if (error && !data) {
        return (
            <div className="card text-center" style={{ padding: 'var(--spacing-2xl)' }}>
                <AlertTriangle size={32} style={{ color: 'var(--color-warning)', marginBottom: 12 }} />
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    Failed to load intelligence feed
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)', marginBottom: 16 }}>
                    {error}
                </p>
                <button
                    onClick={refresh}
                    className="text-sm font-medium"
                    style={{
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-info)',
                        backgroundColor: 'transparent',
                        color: 'var(--color-info)',
                        cursor: 'pointer',
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    const briefing = data?.briefing || {
        topStories: [],
        marketMood: 'mixed' as const,
        trendingTopics: [],
        signalCount: { bullish: 0, bearish: 0, neutral: 0 },
        generatedAt: new Date().toISOString(),
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div>
                    <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)', margin: 0 }}>
                        Intelligence Feed
                    </h1>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)', margin: '4px 0 0' }}>
                        {data?.meta
                            ? `${data.meta.feedsFetched} feeds · ${data.meta.articlesNew} new · ${data.meta.articlesCached} cached · ${data.meta.processingTimeMs}ms`
                            : 'Loading...'
                        }
                    </p>
                </div>
                <button
                    onClick={refresh}
                    disabled={loading}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 14px',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-default)',
                        backgroundColor: 'var(--color-bg-surface)',
                        color: 'var(--color-text-secondary)',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '0.8rem',
                        opacity: loading ? 0.5 : 1,
                    }}
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Briefing Bar */}
            <BriefingBar briefing={briefing} />

            {/* Filter Bar */}
            <FilterBar filters={filters} onFiltersChange={setFilters} />

            {/* Main content: articles + signals sidebar */}
            <div className="flex gap-4" style={{ alignItems: 'flex-start' }}>
                {/* Article feed (main column) */}
                <div className="flex-1 space-y-3 min-w-0">
                    {filteredArticles.length === 0 ? (
                        <div className="card text-center" style={{ padding: 'var(--spacing-2xl)', color: 'var(--color-text-muted)' }}>
                            <p className="text-sm">No articles match your filters</p>
                        </div>
                    ) : (
                        filteredArticles.map(article => (
                            <ArticleCard key={article.id || article.link} article={article} />
                        ))
                    )}
                </div>

                {/* Signals Sidebar (right column for larger screens) */}
                <div className="hidden lg:block" style={{ width: 280, flexShrink: 0, position: 'sticky', top: 80 }}>
                    <SignalsSidebar articles={filteredArticles} />
                </div>
            </div>
        </div>
    );
}
