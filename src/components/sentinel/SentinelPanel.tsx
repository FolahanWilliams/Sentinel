import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSentinel } from '@/hooks/useSentinel';
import { usePortfolio } from '@/hooks/usePortfolio';
import { BriefingBar } from './BriefingBar';
import { FilterBar } from './FilterBar';
import { ArticleCard } from './ArticleCard';
import { SignalsSidebar } from './SignalsSidebar';
import { SentinelSkeleton } from './SentinelSkeleton';
import { ScannerDrawer } from './ScannerDrawer';
import { TimeRangeFilter } from './TimeRangeFilter';
import { getTimeRangeCutoff } from '@/utils/timeRange';
import { ConvergenceAlert } from './ConvergenceAlert';
import { ActionableInsights } from './ActionableInsights';
import type { TimeRange } from '@/utils/timeRange';
import type { ArticleCategory } from '@/types/sentinel';
import { RefreshCw, AlertCircle, Radar } from 'lucide-react';
import { GlassMaterialize } from '@/components/shared/GlassMaterialize';

export function SentinelPanel() {
    const { data, loading, error, isRefreshing, refresh } = useSentinel();
    const searchInputRef = useRef<HTMLInputElement>(null);
    const feedRef = useRef<HTMLDivElement>(null);
    const { openPositions } = usePortfolio();
    const [searchParams, setSearchParams] = useSearchParams();

    // Filter State
    const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
    // Sync URL ?q= param into search state when navigating from other pages
    useEffect(() => {
        const urlQ = searchParams.get('q') || '';
        if (urlQ && urlQ !== searchQuery) setSearchQuery(urlQ);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);
    const [activeCategories, setActiveCategories] = useState<Set<ArticleCategory>>(new Set());
    const [activeSentiment, setActiveSentiment] = useState<'all' | 'bullish' | 'bearish'>('all');
    const [highImpactOnly, setHighImpactOnly] = useState(false);
    const [activeTimeRange, setActiveTimeRange] = useState<TimeRange>('all');
    const [portfolioOnly, setPortfolioOnly] = useState(false);

    // Portfolio tickers set for filtering
    const portfolioTickers = useMemo(() =>
        new Set(openPositions.map(p => p.ticker.toUpperCase())), [openPositions]);

    // Scanner Drawer State
    const [drawerOpen, setDrawerOpen] = useState(() => !!searchParams.get('scan'));
    const [drawerTicker, setDrawerTicker] = useState<string>(() => searchParams.get('scan') || '');

    const openScanDrawer = useCallback((ticker?: string) => {
        setDrawerTicker(ticker || '');
        setDrawerOpen(true);
        if (ticker) {
            setSearchParams(prev => { prev.set('scan', ticker); return prev; }, { replace: true });
        }
    }, [setSearchParams]);

    const closeScanDrawer = useCallback(() => {
        setDrawerOpen(false);
        setDrawerTicker('');
        setSearchParams(prev => { prev.delete('scan'); return prev; }, { replace: true });
    }, [setSearchParams]);

    // Derived Client-Side Filtering
    const filteredArticles = useMemo(() => {
        if (!data?.articles) return [];

        const cutoff = getTimeRangeCutoff(activeTimeRange);

        return data.articles.filter(article => {
            // 0. Time Range
            if (cutoff) {
                const pubDate = new Date(article.pub_date);
                if (pubDate < cutoff) return false;
            }

            // 1. Search Query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                const matchesTitle = article.title.toLowerCase().includes(query);
                const matchesSummary = article.summary.toLowerCase().includes(query);
                const matchesEntities = (article.entities || []).some(e => e.toLowerCase().includes(query));
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

            // 5. Portfolio filter
            if (portfolioOnly && portfolioTickers.size > 0) {
                const entityMatch = article.entities?.some(e => portfolioTickers.has(e.toUpperCase()));
                const signalMatch = article.signals?.some(s => s.ticker && portfolioTickers.has(s.ticker.toUpperCase()));
                if (!entityMatch && !signalMatch) return false;
            }

            return true;
        });
    }, [data, searchQuery, activeCategories, activeSentiment, highImpactOnly, activeTimeRange, portfolioOnly, portfolioTickers]);

    // Check if any filters are active
    const hasActiveFilters = searchQuery || activeCategories.size > 0 || activeSentiment !== 'all' || highImpactOnly || activeTimeRange !== 'all' || portfolioOnly;
    const totalArticles = data?.articles?.length ?? 0;

    // Keyboard shortcuts: / to focus search, Esc to clear filters
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            // Don't capture when typing in an input
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
                if (e.key === 'Escape') {
                    (e.target as HTMLElement).blur();
                    setSearchQuery('');
                }
                return;
            }

            if (e.key === '/') {
                e.preventDefault();
                searchInputRef.current?.focus();
            } else if (e.key === 'Escape') {
                // Clear all filters
                setSearchQuery('');
                setActiveCategories(new Set());
                setActiveSentiment('all');
                setHighImpactOnly(false);
                setActiveTimeRange('all');
                setPortfolioOnly(false);
            } else if (e.key === 'j' || e.key === 'k') {
                // Scroll article feed
                const feed = feedRef.current;
                if (feed) {
                    feed.scrollBy({ top: e.key === 'j' ? 300 : -300, behavior: 'smooth' });
                }
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, []);

    // Handler for clicking trending topics in BriefingBar
    const handleTopicClick = useCallback((topic: string) => {
        setSearchQuery(topic);
    }, []);

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-96 text-red-500 bg-sentinel-900/20 rounded-xl border border-red-500/20 p-8">
                <AlertCircle className="h-12 w-12 mb-4 opacity-50" />
                <h3 className="text-xl font-bold mb-2">Intelligence Feed Offline</h3>
                <p className="text-sentinel-400 text-center max-w-md mb-4">{error}</p>
                <button
                    onClick={refresh}
                    disabled={isRefreshing}
                    className="px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-200 rounded-lg text-sm font-medium transition-colors border border-sentinel-600/50 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Retry
                </button>
            </div>
        );
    }

    if (loading && !data) {
        return <SentinelSkeleton />;
    }

    return (
        <div className="flex flex-col h-full relative">

            {/* Refresh Button / Indicator */}
            <div className="absolute top-2 right-4 z-30">
                {isRefreshing ? (
                    <div className="flex items-center space-x-2 text-xs font-medium text-sentinel-400 bg-sentinel-800/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-sentinel-700/50 shadow-lg animate-pulse">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>Gathering Intelligence...</span>
                    </div>
                ) : (
                    <button
                        onClick={refresh}
                        className="flex items-center space-x-2 text-xs font-medium text-sentinel-500 hover:text-sentinel-300 bg-sentinel-800/60 hover:bg-sentinel-800/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-sentinel-700/50 transition-colors cursor-pointer"
                        title="Refresh intelligence feed (or wait 60s)"
                    >
                        <RefreshCw className="h-3 w-3" />
                        <span>Refresh</span>
                    </button>
                )}
            </div>

            {/* Briefing Bar (Top Level Meta) */}
            {data?.briefing && (
                <div className="mb-6 shrink-0">
                    <BriefingBar briefing={data.briefing} meta={data.meta} onTopicClick={handleTopicClick} />
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex flex-1 min-h-0 gap-6">

                {/* Left Column: Feed & Filters */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="mb-4 shrink-0 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <div className="flex-1">
                                <FilterBar
                                    searchQuery={searchQuery}
                                    setSearchQuery={setSearchQuery}
                                    activeCategories={activeCategories}
                                    setActiveCategories={setActiveCategories}
                                    activeSentiment={activeSentiment}
                                    setActiveSentiment={setActiveSentiment}
                                    highImpactOnly={highImpactOnly}
                                    setHighImpactOnly={setHighImpactOnly}
                                    portfolioOnly={portfolioOnly}
                                    setPortfolioOnly={setPortfolioOnly}
                                    hasPortfolioPositions={openPositions.length > 0}
                                    searchInputRef={searchInputRef}
                                />
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                                <TimeRangeFilter
                                    activeRange={activeTimeRange}
                                    setActiveRange={setActiveTimeRange}
                                />
                                <button
                                    onClick={() => openScanDrawer()}
                                    aria-label="Quick Scan"
                                    className="shrink-0 flex items-center gap-2 px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-sm font-medium rounded-lg border border-indigo-500/30 transition-colors cursor-pointer"
                                    title="Open Scanner"
                                >
                                    <Radar className="w-4 h-4" />
                                    <span className="hidden xl:inline">Quick Scan</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Article count */}
                    {hasActiveFilters && totalArticles > 0 && (
                        <div className="text-xs text-sentinel-500 mb-2 font-mono shrink-0">
                            Showing {filteredArticles.length} of {totalArticles} articles
                        </div>
                    )}

                    <div ref={feedRef} className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                        {filteredArticles.length === 0 ? (
                            <div className="text-center py-20 text-sentinel-400 border border-dashed border-sentinel-700 rounded-xl">
                                No intelligence briefing matches your current filters.
                            </div>
                        ) : (
                            filteredArticles.map((article, index) => (
                                <div key={article.id || article.link}>
                                    <GlassMaterialize delay={Math.min(index, 10) * 50}>
                                        <ArticleCard
                                            article={article}
                                            onScanTicker={openScanDrawer}
                                            portfolioPositions={openPositions}
                                        />
                                    </GlassMaterialize>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Column: Insights + Convergence + Signals */}
                <div className="w-80 shrink-0 hidden lg:block overflow-y-auto custom-scrollbar">
                    <ActionableInsights
                        articles={filteredArticles}
                        portfolioPositions={openPositions}
                        onScanTicker={openScanDrawer}
                    />
                    <ConvergenceAlert articles={filteredArticles} onScanTicker={openScanDrawer} />
                    <SignalsSidebar articles={filteredArticles} onScanTicker={openScanDrawer} />
                </div>
            </div>

            {/* Scanner Drawer */}
            <ScannerDrawer
                isOpen={drawerOpen}
                onClose={closeScanDrawer}
                prefillTicker={drawerTicker}
            />
        </div>
    );
}
