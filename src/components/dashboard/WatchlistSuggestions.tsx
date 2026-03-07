/**
 * WatchlistSuggestions — Surfaces trending tickers from news that aren't
 * yet on the user's watchlist. Turns passive news reading into active
 * portfolio management.
 */

import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useSentinel } from '@/hooks/useSentinel';
import type { ProcessedArticle } from '@/types/sentinel';
import { Plus, TrendingUp, Radar, Eye, Loader2 } from 'lucide-react';

interface TrendingTicker {
    ticker: string;
    mentionCount: number;
    sources: string[];
    directions: { up: number; down: number; volatile: number };
    latestArticleTitle: string;
}

/**
 * Extract trending tickers from articles, ranked by mention frequency.
 */
function extractTrendingTickers(articles: ProcessedArticle[]): TrendingTicker[] {
    const tickerMap: Record<string, TrendingTicker> = {};

    for (const article of articles) {
        if (!article.signals) continue;
        for (const signal of article.signals) {
            if (!signal.ticker) continue;
            const tk = signal.ticker.toUpperCase();

            if (!tickerMap[tk]) {
                tickerMap[tk] = {
                    ticker: tk,
                    mentionCount: 0,
                    sources: [],
                    directions: { up: 0, down: 0, volatile: 0 },
                    latestArticleTitle: article.title,
                };
            }

            tickerMap[tk].mentionCount++;

            if (!tickerMap[tk].sources.includes(article.source)) {
                tickerMap[tk].sources.push(article.source);
            }

            if (signal.direction) {
                tickerMap[tk].directions[signal.direction]++;
            }
        }
    }

    return Object.values(tickerMap)
        .filter(t => t.mentionCount >= 2) // At least 2 mentions
        .sort((a, b) => b.mentionCount - a.mentionCount);
}

export function WatchlistSuggestions() {
    const { data: sentinelData, loading: sentinelLoading } = useSentinel();
    const navigate = useNavigate();
    const [watchlistTickers, setWatchlistTickers] = useState<Set<string>>(new Set());
    const [watchlistLoading, setWatchlistLoading] = useState(true);
    const [addingTicker, setAddingTicker] = useState<string | null>(null);

    // Fetch user's current watchlist
    useEffect(() => {
        async function fetchWatchlist() {
            const { data } = await supabase
                .from('watchlist')
                .select('ticker')
                .eq('is_active', true);

            if (data) {
                setWatchlistTickers(new Set(data.map(w => w.ticker.toUpperCase())));
            }
            setWatchlistLoading(false);
        }
        fetchWatchlist();
    }, []);

    // Find trending tickers NOT in watchlist
    const suggestions = useMemo(() => {
        if (!sentinelData?.articles || watchlistLoading) return [];

        const trending = extractTrendingTickers(sentinelData.articles);
        return trending
            .filter(t => !watchlistTickers.has(t.ticker))
            .slice(0, 5);
    }, [sentinelData, watchlistTickers, watchlistLoading]);

    async function handleAddToWatchlist(ticker: string) {
        setAddingTicker(ticker);
        try {
            await supabase.from('watchlist').upsert(
                { ticker, is_active: true, sector: 'Other' },
                { onConflict: 'ticker' }
            );
            setWatchlistTickers(prev => new Set([...prev, ticker]));
        } catch (err) {
            console.error('[WatchlistSuggestions] Failed to add ticker:', err);
        } finally {
            setAddingTicker(null);
        }
    }

    // Don't render if no suggestions
    if (sentinelLoading && !sentinelData) return null;
    if (suggestions.length === 0) return null;

    return (
        <div className="bg-gradient-to-br from-blue-500/5 to-sentinel-900/40 border border-blue-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-blue-500/15">
                <Eye className="h-4 w-4 text-blue-400" />
                <h3 className="font-semibold text-blue-300 text-sm">Trending — Not on Watchlist</h3>
                <span className="ml-auto text-[10px] font-mono text-blue-500/70 bg-blue-500/10 px-2 py-0.5 rounded-full">
                    {suggestions.length} ticker{suggestions.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="space-y-2">
                {suggestions.map((item) => {
                    const netDirection = item.directions.up > item.directions.down ? 'bullish'
                        : item.directions.down > item.directions.up ? 'bearish'
                        : 'mixed';
                    const dirColor = netDirection === 'bullish' ? 'text-emerald-400'
                        : netDirection === 'bearish' ? 'text-red-400'
                        : 'text-amber-400';

                    return (
                        <div
                            key={item.ticker}
                            className="bg-sentinel-900/50 rounded-lg p-3 border border-sentinel-700/40 hover:border-blue-500/30 transition-colors group"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-sentinel-100 text-sm font-mono">
                                        {item.ticker}
                                    </span>
                                    <span className={`text-[10px] font-bold ${dirColor}`}>
                                        {netDirection.toUpperCase()}
                                    </span>
                                    <span className="text-[10px] text-sentinel-500">
                                        {item.mentionCount} mentions • {item.sources.length} sources
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                        onClick={() => handleAddToWatchlist(item.ticker)}
                                        disabled={addingTicker === item.ticker}
                                        className="p-1 rounded bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 transition-colors cursor-pointer border border-emerald-500/20 disabled:opacity-50"
                                        title={`Add ${item.ticker} to watchlist`}
                                    >
                                        {addingTicker === item.ticker ? (
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                        ) : (
                                            <Plus className="h-3 w-3" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => navigate(`/scanner?ticker=${item.ticker}`)}
                                        className="p-1 rounded bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 transition-colors cursor-pointer border border-indigo-500/20"
                                        title={`Scan ${item.ticker}`}
                                    >
                                        <Radar className="h-3 w-3" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-[11px] text-sentinel-500 mt-1 line-clamp-1">
                                {item.latestArticleTitle}
                            </p>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
