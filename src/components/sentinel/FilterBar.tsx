import { Search, Filter, AlertTriangle } from 'lucide-react';
import type { ArticleCategory } from '@/types/sentinel';
import { CATEGORY_COLORS } from '@/utils/sentinel-helpers';

interface FilterBarProps {
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    activeCategories: Set<ArticleCategory>;
    setActiveCategories: (cats: Set<ArticleCategory> | ((prev: Set<ArticleCategory>) => Set<ArticleCategory>)) => void;
    activeSentiment: 'all' | 'bullish' | 'bearish';
    setActiveSentiment: (s: 'all' | 'bullish' | 'bearish') => void;
    highImpactOnly: boolean;
    setHighImpactOnly: (val: boolean) => void;
}

export function FilterBar({
    searchQuery, setSearchQuery,
    activeCategories, setActiveCategories,
    activeSentiment, setActiveSentiment,
    highImpactOnly, setHighImpactOnly
}: FilterBarProps) {

    const toggleCategory = (cat: ArticleCategory) => {
        setActiveCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat);
            else next.add(cat);
            return next;
        });
    };

    return (
        <div className="flex flex-col space-y-4 bg-sentinel-800/40 p-4 rounded-xl border border-sentinel-700/50 backdrop-blur-md">
            {/* Top Row: Search & Toggles */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">

                {/* Search */}
                <div className="relative w-full sm:w-96 text-sentinel-400 focus-within:text-sentinel-300">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                    <input
                        type="text"
                        placeholder="Search briefings, entities, tickers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-sentinel-900/50 border border-sentinel-700/50 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sentinel-500 transition-shadow text-white placeholder-sentinel-500"
                    />
                </div>

                {/* Toggles */}
                <div className="flex gap-2 w-full sm:w-auto">
                    <select
                        value={activeSentiment}
                        onChange={(e) => setActiveSentiment(e.target.value as any)}
                        className="bg-sentinel-900/50 border border-sentinel-700/50 rounded-lg px-3 py-2 text-sm text-sentinel-300 focus:outline-none focus:ring-2 focus:ring-sentinel-500 appearance-none flex-1 sm:flex-none cursor-pointer"
                    >
                        <option value="all">All Sentiment</option>
                        <option value="bullish">🟢 Bullish Only</option>
                        <option value="bearish">🔴 Bearish Only</option>
                    </select>

                    <button
                        onClick={() => setHighImpactOnly(!highImpactOnly)}
                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors flex-1 sm:flex-none ${highImpactOnly
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                                : 'bg-sentinel-900/50 text-sentinel-400 border-sentinel-700/50 hover:bg-sentinel-800'
                            }`}
                    >
                        <AlertTriangle className="h-4 w-4" />
                        High Impact
                    </button>
                </div>
            </div>

            {/* Bottom Row: Categories Filter */}
            <div className="flex items-center gap-2 overflow-x-auto custom-scrollbar pb-1">
                <Filter className="h-4 w-4 text-sentinel-500 shrink-0" />
                {Object.keys(CATEGORY_COLORS).map((catName) => {
                    const cat = catName as ArticleCategory;
                    const isActive = activeCategories.has(cat);
                    const baseColor = CATEGORY_COLORS[cat];

                    return (
                        <button
                            key={cat}
                            onClick={() => toggleCategory(cat)}
                            className={`shrink-0 px-3 py-1 rounded-full text-xs font-mono font-medium border transition-all ${isActive
                                    ? baseColor
                                    : 'bg-transparent text-sentinel-400 border-transparent hover:border-sentinel-700/50 hover:bg-sentinel-800'
                                }`}
                        >
                            {cat.replace('_', ' ')}
                        </button>
                    )
                })}
                {activeCategories.size > 0 && (
                    <button
                        onClick={() => setActiveCategories(new Set())}
                        className="shrink-0 px-3 py-1 text-xs text-sentinel-500 hover:text-sentinel-300 underline ml-2"
                    >
                        Clear
                    </button>
                )}
            </div>
        </div>
    );
}
