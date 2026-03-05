import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { Rss, ExternalLink, Cpu, HeartPulse, Building2, ShieldAlert, TrendingUp, Globe, Clock, MessageSquare, AlertTriangle } from 'lucide-react';
import { Database } from '@/types/database';
import { timeAgo } from '@/utils/formatters';

type RssRow = Database['public']['Tables']['rss_cache']['Row'];

interface NewsFeedProps {
    ticker?: string; // If provided, filter news to only this ticker
    limit?: number;
    title?: string;
    className?: string;
    showControls?: boolean;
}

// Map categories to modern icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    market_moving: <Globe className="w-3.5 h-3.5 text-blue-400" />,
    tech_ai: <Cpu className="w-3.5 h-3.5 text-cyan-400" />,
    biotech: <HeartPulse className="w-3.5 h-3.5 text-rose-400" />,
    semiconductors: <Building2 className="w-3.5 h-3.5 text-purple-400" />,
    cybersecurity: <ShieldAlert className="w-3.5 h-3.5 text-orange-400" />,
    macro: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />,
    social: <MessageSquare className="w-3.5 h-3.5 text-pink-400" />,
    regulatory: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
};

// Map Alpha Vantage sentiment labels to styling
const SENTIMENT_STYLES: Record<string, { bg: string, text: string, icon: React.ReactNode }> = {
    'Bullish': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: <TrendingUp className="w-3 h-3" /> },
    'Somewhat-Bullish': { bg: 'bg-emerald-500/5', text: 'text-emerald-300', icon: <TrendingUp className="w-3 h-3" /> },
    'Bearish': { bg: 'bg-red-500/10', text: 'text-red-400', icon: <TrendingUp className="w-3 h-3 rotate-180" /> },
    'Somewhat-Bearish': { bg: 'bg-red-500/5', text: 'text-red-300', icon: <TrendingUp className="w-3 h-3 rotate-180" /> },
    'Neutral': { bg: 'bg-sentinel-800', text: 'text-sentinel-300', icon: <div className="w-1.5 h-1.5 rounded-full bg-sentinel-400" /> },
};

export function NewsFeed({ ticker, limit = 10, title = "Live Intelligence Feed", className = "", showControls = true }: NewsFeedProps) {
    const [news, setNews] = useState<RssRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Auto-refresh every 5 minutes
    useEffect(() => {
        fetchNews();
        const interval = setInterval(fetchNews, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [ticker, categoryFilter, limit]);

    async function fetchNews() {
        try {
            setLoading(true);

            let query = supabase
                .from('rss_cache')
                .select('*')
                .order('published_at', { ascending: false })
                .limit(limit);

            if (ticker) {
                // Supabase text search on array columns
                query = query.contains('tickers_mentioned', [ticker.toUpperCase()]);
            }

            if (categoryFilter !== 'all') {
                query = query.eq('feed_category', categoryFilter);
            }

            const { data, error } = await query;
            if (error) throw error;

            setNews(data || []);
        } catch (err) {
            console.error('[NewsFeed] Error fetching news:', err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={`bg-sentinel-900/50 rounded-xl border border-sentinel-800 overflow-hidden flex flex-col ${className}`}>
            {/* Header */}
            <div className="p-4 border-b border-sentinel-800 bg-sentinel-950/30 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-sentinel-100 uppercase tracking-widest flex items-center gap-2">
                    <Rss className="w-4 h-4 text-orange-400" />
                    {title}
                </h3>
                {showControls && (
                    <div className="flex gap-2 text-xs">
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="bg-sentinel-950 border border-sentinel-700 text-sentinel-300 rounded-md px-2 py-1 focus:outline-none focus:border-sentinel-500"
                        >
                            <option value="all">All Channels</option>
                            <option value="market_moving">Macro & Markets</option>
                            <option value="tech_ai">Tech & AI</option>
                            <option value="biotech">Biotech</option>
                            <option value="regulatory">Regulatory</option>
                        </select>
                    </div>
                )}
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[600px] custom-scrollbar">
                {loading && news.length === 0 ? (
                    <div className="p-8 flex justify-center items-center">
                        <div className="w-6 h-6 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div>
                    </div>
                ) : news.length === 0 ? (
                    <div className="p-8 text-center text-sentinel-500 text-sm">
                        No recent news found{ticker ? ` for ${ticker}` : ''}.
                    </div>
                ) : (
                    <div className="divide-y divide-sentinel-800/30">
                        {news.map((item) => {
                            const isAlphaVantage = item.feed_name.startsWith('AV:');
                            // Look for sentiment keyword from Alpha Vantage array
                            const sentimentObj = isAlphaVantage && item.keywords
                                ? Object.entries(SENTIMENT_STYLES).find(([key]) => item.keywords.includes(key))
                                : null;
                            const sentiment = sentimentObj ? { label: sentimentObj[0], ...sentimentObj[1] } : null;

                            return (
                                <a
                                    key={item.id}
                                    href={item.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block p-4 hover:bg-sentinel-800/20 transition-colors group"
                                >
                                    <div className="flex justify-between items-start mb-1.5 gap-4">
                                        <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono tracking-wider text-sentinel-400">
                                            <span className="flex items-center gap-1.5">
                                                {CATEGORY_ICONS[item.feed_category] || <Rss className="w-3 h-3 text-sentinel-500" />}
                                                {item.feed_name.replace('AV: ', '')}
                                            </span>
                                            <span className="text-sentinel-600">•</span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {item.published_at ? timeAgo(item.published_at) : 'Unknown'}
                                            </span>

                                            {/* Show sentiment tag if it's AV data */}
                                            {sentiment && (
                                                <>
                                                    <span className="text-sentinel-600">•</span>
                                                    <span className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${sentiment.bg} ${sentiment.text}`}>
                                                        {sentiment.icon} {sentiment.label.replace('-', ' ')}
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                        <ExternalLink className="w-3.5 h-3.5 text-sentinel-600 group-hover:text-sentinel-300 transition-colors flex-shrink-0" />
                                    </div>

                                    <h4 className="text-sm font-medium text-sentinel-100 leading-snug mb-2 group-hover:text-blue-200 transition-colors line-clamp-2">
                                        {item.title}
                                    </h4>

                                    {/* Subtitle/Description */}
                                    {item.description && !isAlphaVantage && (
                                        <p className="text-xs text-sentinel-400 line-clamp-2 mb-3 leading-relaxed">
                                            {item.description}
                                        </p>
                                    )}

                                    {/* Tickers Tag */}
                                    {item.tickers_mentioned && item.tickers_mentioned.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {item.tickers_mentioned.slice(0, 4).map(t => (
                                                <span
                                                    key={t}
                                                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded ring-1 ring-inset ${t === ticker
                                                        ? 'bg-blue-500/10 text-blue-400 ring-blue-500/30'
                                                        : 'bg-sentinel-800/50 text-sentinel-400 ring-sentinel-700/50'
                                                        }`}
                                                >
                                                    ${t}
                                                </span>
                                            ))}
                                            {item.tickers_mentioned.length > 4 && (
                                                <span className="px-1.5 py-0.5 text-[10px] text-sentinel-500">
                                                    +{item.tickers_mentioned.length - 4} more
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </a>
                            );
                        })}
                    </div>
                )}
            </div>
            {/* Footer shadow / styling */}
            <div className="h-1 w-full bg-gradient-to-r from-sentinel-800 via-sentinel-700 to-sentinel-800 opacity-20" />
        </div>
    );
}
