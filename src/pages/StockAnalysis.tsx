/**
 * StockAnalysis — Dedicated deep-dive analysis page for any ticker.
 *
 * Provides a search bar where the user types a ticker symbol, then fetches
 * live AI-powered analysis: quote data, bias weights, event timeline,
 * fundamental metrics, and a Yahoo Finance link.
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Search, ExternalLink, Loader2, TrendingUp, TrendingDown, BarChart3, Target, RefreshCw } from 'lucide-react';
import { useTickerAnalysis } from '@/hooks/useTickerAnalysis';
import { MarketDataService } from '@/services/marketData';
import { BiasBreakdown } from '@/components/analysis/BiasBreakdown';
import { EventTimeline } from '@/components/analysis/EventTimeline';
import { FundamentalSnapshot } from '@/components/analysis/FundamentalSnapshot';
import { TradingViewChart } from '@/components/analysis/TradingViewChart';
import { formatPrice } from '@/utils/formatters';
import type { Quote } from '@/types/market';

// Storage keys
const STORAGE_KEYS = {
    TICKER: 'sentinel_active_ticker',
    QUOTE: 'sentinel_active_quote',
    RECENT: 'sentinel_recent_tickers',
};

// Helper to init state from sessionStorage
function getStoredState<T>(key: string, defaultValue: T): T {
    try {
        const stored = sessionStorage.getItem(key);
        if (stored) return JSON.parse(stored);
    } catch {
        // ignore parse errors
    }
    return defaultValue;
}

export function StockAnalysis() {
    const { ticker: urlTicker } = useParams<{ ticker?: string }>();

    // Initialize state from sessionStorage
    const [activeTicker, setActiveTicker] = useState<string | null>(() => getStoredState(STORAGE_KEYS.TICKER, null));
    const [tickerInput, setTickerInput] = useState(() => getStoredState(STORAGE_KEYS.TICKER, '') || '');
    const [quote, setQuote] = useState<Quote | null>(() => getStoredState(STORAGE_KEYS.QUOTE, null));
    const [recentTickers, setRecentTickers] = useState<string[]>(() => getStoredState(STORAGE_KEYS.RECENT, []));

    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError, setQuoteError] = useState<string | null>(null);

    const { data: analysisData, loading: analysisLoading, fetchAnalysis } = useTickerAnalysis();

    // Sync state to sessionStorage when it changes
    useEffect(() => {
        if (activeTicker) sessionStorage.setItem(STORAGE_KEYS.TICKER, JSON.stringify(activeTicker));
        else sessionStorage.removeItem(STORAGE_KEYS.TICKER);
    }, [activeTicker]);

    useEffect(() => {
        if (quote) sessionStorage.setItem(STORAGE_KEYS.QUOTE, JSON.stringify(quote));
        else sessionStorage.removeItem(STORAGE_KEYS.QUOTE);
    }, [quote]);

    useEffect(() => {
        sessionStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(recentTickers));
    }, [recentTickers]);

    // Auto-run analysis if a ticker is in the URL (e.g. /research/NVDA)
    // ONLY if it doesn't match the currently active one (prevents redundant fetch on reload)
    useEffect(() => {
        if (urlTicker && urlTicker.toUpperCase() !== activeTicker) {
            runAnalysis(urlTicker);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [urlTicker]);

    const runAnalysis = useCallback(async (ticker: string) => {
        const t = ticker.trim().toUpperCase();
        if (!t) return;

        setActiveTicker(t);
        setTickerInput(t);
        setQuote(null);
        setQuoteError(null);
        setQuoteLoading(true);

        // Track recent tickers (deduplicate, max 8)
        setRecentTickers(prev => [t, ...prev.filter(x => x !== t)].slice(0, 8));

        // Fetch quote + AI analysis in parallel
        fetchAnalysis(t);

        try {
            const q = await MarketDataService.getQuote(t);
            setQuote(q);
        } catch (err: any) {
            setQuoteError(err.message || 'Failed to fetch quote');
        } finally {
            setQuoteLoading(false);
        }
    }, [fetchAnalysis]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        runAnalysis(tickerInput);
    };

    const tickerAnalysis = activeTicker ? analysisData[activeTicker] : null;
    const isLoadingAnalysis = activeTicker ? (analysisLoading[activeTicker] || false) : false;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100">
                    Stock Analysis
                </h1>
                <p className="text-sentinel-400 mt-1">
                    Enter any ticker for a full AI-powered deep dive — fundamentals, events, sentiment, and bias analysis.
                </p>
            </div>

            {/* Search Bar */}
            <form onSubmit={handleSubmit} className="flex items-stretch gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-sentinel-500 pointer-events-none" />
                    <input
                        type="text"
                        value={tickerInput}
                        onChange={e => setTickerInput(e.target.value.toUpperCase())}
                        placeholder="Enter ticker (e.g. AAPL, NVDA, TSLA)"
                        className="w-full pl-10 pr-4 py-3 bg-sentinel-900/50 border border-sentinel-700 rounded-xl text-sentinel-100 text-lg font-mono placeholder:text-sentinel-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all"
                        autoFocus
                    />
                </div>
                <button
                    type="submit"
                    disabled={!tickerInput.trim() || (isLoadingAnalysis && activeTicker === tickerInput.trim().toUpperCase())}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
                >
                    {isLoadingAnalysis ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Target className="w-4 h-4" />
                    )}
                    Analyze
                </button>
            </form>

            {/* Recent Tickers */}
            {recentTickers.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-sentinel-600">Recent:</span>
                    {recentTickers.map(t => (
                        <button
                            key={t}
                            onClick={() => runAnalysis(t)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer border-none ${t === activeTicker
                                ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/30'
                                : 'bg-sentinel-800/50 text-sentinel-400 hover:text-sentinel-200 hover:bg-sentinel-800'
                                }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            )}

            {/* ── Active Analysis ── */}
            {activeTicker && (
                <div className="space-y-6">

                    {/* Quote Header Card */}
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-6 backdrop-blur-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600/20 to-purple-600/20 flex items-center justify-center ring-1 ring-blue-500/20">
                                    <span className="text-xl font-bold font-mono text-sentinel-100">{activeTicker.slice(0, 2)}</span>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-sentinel-100 font-mono">{activeTicker}</h2>
                                    {tickerAnalysis?.fundamentals?.sector && (
                                        <p className="text-sm text-sentinel-400">
                                            {tickerAnalysis.fundamentals.sector}
                                            {tickerAnalysis.fundamentals.industry ? ` • ${tickerAnalysis.fundamentals.industry}` : ''}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Price data */}
                            <div className="flex items-center gap-6">
                                {quoteLoading ? (
                                    <div className="flex items-center gap-2 text-sentinel-400">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Loading quote...
                                    </div>
                                ) : quoteError ? (
                                    <p className="text-sm text-sentinel-500">{quoteError}</p>
                                ) : quote ? (
                                    <>
                                        <div className="text-right">
                                            <p className="text-3xl font-bold font-mono text-sentinel-100">{formatPrice(quote.price)}</p>
                                            <div className="flex items-center justify-end gap-1 mt-0.5">
                                                {quote.changePercent >= 0 ? (
                                                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                                                ) : (
                                                    <TrendingDown className="w-4 h-4 text-red-400" />
                                                )}
                                                <span className={`text-sm font-mono font-bold ${quote.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {quote.changePercent >= 0 ? '+' : ''}{quote.changePercent.toFixed(2)}%
                                                </span>
                                            </div>
                                        </div>
                                        {tickerAnalysis?.fundamentals?.marketCap && (
                                            <div className="text-right border-l border-sentinel-800 pl-4">
                                                <p className="text-xs text-sentinel-500">Market Cap</p>
                                                <p className="text-sm font-mono text-sentinel-300 flex items-center gap-1">
                                                    <BarChart3 className="w-3 h-3" /> {tickerAnalysis.fundamentals.marketCap}
                                                </p>
                                            </div>
                                        )}
                                    </>
                                ) : null}

                                {/* External links */}
                                <div className="flex flex-col gap-1.5 border-l border-sentinel-800 pl-4">
                                    <a
                                        href={`https://finance.yahoo.com/quote/${activeTicker}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-sentinel-500 hover:text-blue-400 transition-colors flex items-center gap-1 no-underline"
                                    >
                                        Yahoo Finance <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <a
                                        href={`https://finviz.com/quote.ashx?t=${activeTicker}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-sentinel-500 hover:text-blue-400 transition-colors flex items-center gap-1 no-underline"
                                    >
                                        Finviz <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* TradingView Interactive Chart */}
                    <TradingViewChart ticker={activeTicker} height={600} />

                    {/* Analysis Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Left column */}
                        <div className="space-y-6">
                            <BiasBreakdown
                                biasType="analysis"
                                biasWeights={tickerAnalysis?.biasWeights}
                                weightsLoading={isLoadingAnalysis}
                            />

                            <FundamentalSnapshot
                                fundamentals={tickerAnalysis?.fundamentals}
                                fundamentalsLoading={isLoadingAnalysis}
                                onRefresh={() => {
                                    // Clear cache and refetch
                                    fetchAnalysis(activeTicker);
                                }}
                            />
                        </div>

                        {/* Right column */}
                        <div className="space-y-6">
                            <EventTimeline
                                events={[]}
                                aiEvents={tickerAnalysis?.events}
                                aiEventsLoading={isLoadingAnalysis}
                            />

                            {/* Quick Actions */}
                            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-3">
                                    Quick Actions
                                </h3>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => runAnalysis(activeTicker)}
                                        className="w-full px-4 py-2.5 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-200 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700 flex items-center justify-center gap-2 cursor-pointer border-none"
                                    >
                                        <RefreshCw className="w-4 h-4" /> Re-analyze {activeTicker}
                                    </button>
                                    <a
                                        href={`https://finance.yahoo.com/quote/${activeTicker}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="w-full px-4 py-2.5 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-200 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700 flex items-center justify-center gap-2 no-underline"
                                    >
                                        <ExternalLink className="w-4 h-4" /> View on Yahoo Finance
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!activeTicker && (
                <div className="bg-sentinel-900/30 rounded-xl border border-sentinel-800/30 p-16 text-center">
                    <div className="w-16 h-16 rounded-full bg-blue-600/10 flex items-center justify-center mx-auto mb-4 ring-1 ring-blue-500/20">
                        <Search className="w-8 h-8 text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-sentinel-200 mb-2">Search for a stock</h3>
                    <p className="text-sm text-sentinel-500 max-w-md mx-auto">
                        Enter a ticker symbol above to get a full AI-powered analysis including sentiment drivers,
                        recent events, and fundamental metrics powered by Gemini with live web search.
                    </p>
                    <div className="flex items-center justify-center gap-2 mt-6">
                        {['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'].map(t => (
                            <button
                                key={t}
                                onClick={() => runAnalysis(t)}
                                className="px-3 py-1.5 bg-sentinel-800/50 hover:bg-sentinel-800 text-sentinel-400 hover:text-sentinel-200 rounded-lg text-xs font-mono transition-colors cursor-pointer border-none"
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
