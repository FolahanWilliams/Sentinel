/**
 * TickerNewsFeed — Shows AI-processed news articles for a specific ticker
 * on the Analysis page. Pulls from both sentinel_articles (processed) and
 * rss_cache (raw) to provide comprehensive coverage.
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { Newspaper, ExternalLink, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { timeAgo } from '@/utils/formatters';

interface TickerNewsItem {
    id: string;
    title: string;
    link: string;
    source: string;
    published_at: string;
    sentiment?: 'bullish' | 'bearish' | 'neutral';
    impact?: 'high' | 'medium' | 'low';
    summary?: string;
}

interface TickerNewsFeedProps {
    ticker: string;
}

export function TickerNewsFeed({ ticker }: TickerNewsFeedProps) {
    const [articles, setArticles] = useState<TickerNewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function fetchNews() {
            setLoading(true);
            const upperTicker = ticker.toUpperCase();

            try {
                // Fetch from rss_cache where ticker is mentioned
                const { data: rssData } = await supabase
                    .from('rss_cache')
                    .select('id, title, link, feed_name, published_at, description')
                    .contains('tickers_mentioned', [upperTicker])
                    .order('published_at', { ascending: false })
                    .limit(10);

                if (cancelled) return;

                const newsItems: TickerNewsItem[] = (rssData || []).map(item => ({
                    id: item.id,
                    title: item.title,
                    link: item.link,
                    source: item.feed_name,
                    published_at: item.published_at || '',
                    summary: item.description || undefined,
                }));

                setArticles(newsItems);
            } catch (err) {
                console.error('[TickerNewsFeed] Error:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchNews();
        return () => { cancelled = true; };
    }, [ticker]);

    if (loading) {
        return (
            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-4">
                <div className="flex items-center gap-2 text-sentinel-400 text-sm">
                    <Newspaper className="w-4 h-4" />
                    <span>Loading news for {ticker}...</span>
                    <div className="ml-auto w-4 h-4 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    if (articles.length === 0) return null;

    const visibleArticles = expanded ? articles : articles.slice(0, 3);

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden">
            <div className="px-4 py-3 border-b border-sentinel-800/30 flex items-center justify-between">
                <h4 className="text-xs font-semibold text-sentinel-200 uppercase tracking-wider flex items-center gap-2">
                    <Newspaper className="w-3.5 h-3.5 text-orange-400" />
                    Recent News ({articles.length})
                </h4>
                {articles.length > 3 && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1 text-[10px] text-sentinel-500 hover:text-sentinel-300 transition-colors bg-transparent border-none cursor-pointer"
                    >
                        {expanded ? (
                            <>Show less <ChevronUp className="w-3 h-3" /></>
                        ) : (
                            <>Show all <ChevronDown className="w-3 h-3" /></>
                        )}
                    </button>
                )}
            </div>

            <div className="divide-y divide-sentinel-800/20">
                {visibleArticles.map((article) => (
                    <a
                        key={article.id}
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block px-4 py-3 hover:bg-sentinel-800/20 transition-colors group"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <h5 className="text-sm text-sentinel-200 leading-snug group-hover:text-blue-200 transition-colors line-clamp-2">
                                    {article.title}
                                </h5>
                                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-sentinel-500 font-mono">
                                    <span>{article.source}</span>
                                    <span className="text-sentinel-700">•</span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {article.published_at ? timeAgo(article.published_at) : 'Unknown'}
                                    </span>
                                    {article.sentiment && (
                                        <>
                                            <span className="text-sentinel-700">•</span>
                                            <SentimentBadge sentiment={article.sentiment} />
                                        </>
                                    )}
                                    {article.impact === 'high' && (
                                        <>
                                            <span className="text-sentinel-700">•</span>
                                            <span className="text-amber-400 font-bold">HIGH IMPACT</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-sentinel-600 group-hover:text-sentinel-300 transition-colors flex-shrink-0 mt-1" />
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}

function SentimentBadge({ sentiment }: { sentiment: 'bullish' | 'bearish' | 'neutral' }) {
    const config = {
        bullish: { icon: TrendingUp, color: 'text-emerald-400' },
        bearish: { icon: TrendingDown, color: 'text-red-400' },
        neutral: { icon: Minus, color: 'text-sentinel-400' },
    }[sentiment];

    const Icon = config.icon;
    return (
        <span className={`flex items-center gap-0.5 ${config.color}`}>
            <Icon className="w-3 h-3" />
            {sentiment}
        </span>
    );
}
