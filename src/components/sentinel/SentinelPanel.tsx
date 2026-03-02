import { useState, useMemo } from 'react';
import { useSentinel } from '@/hooks/useSentinel';
import { BriefingBar } from './BriefingBar';
import { FilterBar } from './FilterBar';
import { ArticleCard } from './ArticleCard';
import { SignalsSidebar } from './SignalsSidebar';
import { SentinelSkeleton } from './SentinelSkeleton';
import type { ArticleCategory } from '@/types/sentinel';
import { RefreshCw, AlertCircle } from 'lucide-react';

export function SentinelPanel() {
    const { data, loading, error, isRefreshing } = useSentinel();

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategories, setActiveCategories] = useState<Set<ArticleCategory>>(new Set());
    const [activeSentiment, setActiveSentiment] = useState<'all' | 'bullish' | 'bearish'>('all');
    const [highImpactOnly, setHighImpactOnly] = useState(false);

    // Derived Client-Side Filtering
    const filteredArticles = useMemo(() => {
        if (!data?.articles) return [];

        return data.articles.filter(article => {
            // 1. Search Query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesTitle = article.title.toLowerCase().includes(query);
                const matchesSummary = article.summary.toLowerCase().includes(query);
                const matchesEntities = article.entities.some(e => e.toLowerCase().includes(query));
                if (!matchesTitle && !matchesSummary && !matchesEntities) return false;
            }

            // 2. Category
            if (activeCategories.size > 0 && !activeCategories.has(article.category)) {
                return false;
            }

            // 3. Sentiment
            if (activeSentiment !== 'all' && article.sentiment !== activeSentiment) {
                return false;
            }

            // 4. Impact
            if (highImpactOnly && article.impact !== 'high') {
                return false;
            }

            return true;
        });
    }, [data, searchQuery, activeCategories, activeSentiment, highImpactOnly]);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-red-500 bg-sentinel-900/20 rounded-xl border border-red-500/20 p-8">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <h3 className="text-xl font-bold mb-2">Intelligence Feed Offline</h3>
                <p className="text-sentinel-400 text-center max-w-md">{error}</p>
            </div>
        );
    }

    if (loading && !data) {
        return <SentinelSkeleton />;
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] relative">

            {/* Refresh Indicator */}
            {isRefreshing && (
                <div className="absolute top-2 right-4 z-50 flex items-center space-x-2 text-xs font-medium text-sentinel-400 bg-sentinel-800/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-sentinel-700/50 shadow-lg animate-pulse">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Gathering Intelligence...</span>
                </div>
            )}

            {/* Briefing Bar (Top Level Meta) */}
            {data?.briefing && (
                <div className="mb-6 shrink-0">
                    <BriefingBar briefing={data.briefing} meta={data.meta} />
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex flex-1 min-h-0 gap-6">

                {/* Left Column: Feed & Filters */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="mb-4 shrink-0">
                        <FilterBar
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            activeCategories={activeCategories}
                            setActiveCategories={setActiveCategories}
                            activeSentiment={activeSentiment}
                            setActiveSentiment={setActiveSentiment}
                            highImpactOnly={highImpactOnly}
                            setHighImpactOnly={setHighImpactOnly}
                        />
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {filteredArticles.length === 0 ? (
                            <div className="text-center py-20 text-sentinel-400 border border-dashed border-sentinel-700 rounded-xl">
                                No intelligence briefing matches your current filters.
                            </div>
                        ) : (
                            filteredArticles.map(article => (
                                <ArticleCard key={article.id || article.link} article={article} />
                            ))
                        )}
                    </div>
                </div>

                {/* Right Column: Aggregated Signals Sidebar */}
                <div className="w-80 shrink-0 hidden lg:block overflow-y-auto custom-scrollbar">
                    <SignalsSidebar articles={filteredArticles} />
                </div>
            </div>
        </div>
    );
}
