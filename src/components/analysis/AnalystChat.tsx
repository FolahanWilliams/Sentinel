/**
 * AnalystChat — Floating conversational AI panel.
 *
 * Portfolio-aware: injects full portfolio state (positions, exposure, P&L,
 * sector allocation, active signals) into every prompt so the AI can answer
 * questions like "Am I over-exposed to one sector?" or "Where should I rotate?"
 *
 * Also injects per-ticker context when a ticker is active (bias, fundamentals,
 * news, signals) so the user can interrogate the AI's logic.
 *
 * Uses Gemini with grounded search for real-time web data in recommendations.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Loader2, Sparkles, Bot, User, CheckCircle2 } from 'lucide-react';
import { GeminiService } from '@/services/gemini';
import { GEMINI_MODEL_LITE } from '@/config/constants';
import { supabase } from '@/config/supabase';
import { useChat } from '@/contexts/ChatContext';
import { MarketDataService } from '@/services/marketData';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { formatPrice } from '@/utils/formatters';
import { inferCurrency, getPositionExposure } from '@/utils/portfolio';
import { PostMortemService } from '@/services/postMortemService';
import { PositionSizer } from '@/services/positionSizer';
import { AgentService } from '@/services/agents';
import type { Position, PortfolioConfig } from '@/hooks/usePortfolio';
import type { TASnapshot } from '@/types/signals';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

interface PortfolioSnapshot {
    config: PortfolioConfig | null;
    positions: Position[];
    sectorMap: Record<string, string>;
    activeSignals: ActiveSignalSummary[];
}

interface ActiveSignalSummary {
    ticker: string;
    signal_type: string;
    confidence_score: number;
    thesis: string;
    target_price: number | null;
    stop_loss: number | null;
    created_at: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AnalystChat() {
    return (
        <ErrorBoundary fallback={
            <div className="fixed bottom-6 right-6 z-50">
                <div className="bg-sentinel-950 border border-red-500/30 rounded-2xl p-6 text-center max-w-xs shadow-2xl">
                    <p className="text-sm text-red-400 mb-2">Chat encountered an error</p>
                    <button onClick={() => window.location.reload()} className="text-xs text-sentinel-400 hover:text-sentinel-200 underline cursor-pointer bg-transparent border-none">Reload</button>
                </div>
            </div>
        }>
            <AnalystChatInner />
        </ErrorBoundary>
    );
}

function AnalystChatInner() {
    const { isOpen, setIsOpen, activeTicker, setActiveTicker } = useChat();

    const ticker = activeTicker || 'GLOBAL';
    const [tickerAnalysis, setTickerAnalysis] = useState<any>(null);
    const [quote, setQuote] = useState<any>(null);
    const [hasLoadedContext, setHasLoadedContext] = useState(false);

    // Portfolio state — always loaded when chat opens
    const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
    const [portfolioLoading, setPortfolioLoading] = useState(false);

    // Conversation memory — rolling summary of older messages
    const [conversationSummary, setConversationSummary] = useState<string>('');

    // Live quotes for open positions (for unrealized P&L)
    const [positionQuotes, setPositionQuotes] = useState<Record<string, number>>({});

    // News context — per-ticker or cross-portfolio
    const [tickerNews, setTickerNews] = useState<{ ticker?: string; title: string; source: string; published_at: string; sentiment_score?: number }[]>([]);

    // Scanner/signal intelligence for replacement trade ideas
    const [scannerResults, setScannerResults] = useState<{
        ticker: string;
        signal_type: string;
        confidence_score: number;
        projected_roi: number | null;
        confluence_level: string | null;
        thesis: string;
        target_price: number | null;
        stop_loss: number | null;
        historical_win_rate: number | null;
        risk_level: string;
        created_at: string;
    }[]>([]);

    // Follow-up suggestions after AI responses
    const [suggestedFollowups, setSuggestedFollowups] = useState<string[]>([]);

    // Fetch portfolio context (positions, config, signals, sector data)
    useEffect(() => {
        if (!isOpen) return;
        let isMounted = true;

        async function fetchPortfolio() {
            setPortfolioLoading(true);
            try {
                // Parallel fetch: config, positions, active signals, watchlist (for sectors)
                const [configRes, positionsRes, signalsRes, watchlistRes] = await Promise.all([
                    supabase.from('portfolio_config').select('*').limit(1).maybeSingle(),
                    supabase.from('positions').select('*').order('opened_at', { ascending: false }),
                    supabase.from('signals').select('ticker, signal_type, confidence_score, thesis, target_price, stop_loss, created_at')
                        .eq('status', 'active').order('created_at', { ascending: false }).limit(20),
                    supabase.from('watchlist').select('ticker, sector'),
                ]);

                if (!isMounted) return;

                const config = configRes.data ? {
                    id: configRes.data.id,
                    total_capital: Number(configRes.data.total_capital),
                    max_position_pct: Number(configRes.data.max_position_pct),
                    max_total_exposure_pct: Number(configRes.data.max_total_exposure_pct),
                    max_sector_exposure_pct: Number(configRes.data.max_sector_exposure_pct),
                    max_concurrent_positions: configRes.data.max_concurrent_positions,
                    risk_per_trade_pct: Number(configRes.data.risk_per_trade_pct),
                    kelly_fraction: Number(configRes.data.kelly_fraction),
                } as PortfolioConfig : null;

                const positions = (positionsRes.data || []) as Position[];

                // Build sector map from watchlist
                const sectorMap: Record<string, string> = {};
                (watchlistRes.data || []).forEach((w: any) => {
                    if (w.ticker && w.sector) sectorMap[w.ticker] = w.sector;
                });

                const activeSignals: ActiveSignalSummary[] = (signalsRes.data || []).map((s: any) => ({
                    ticker: s.ticker,
                    signal_type: s.signal_type,
                    confidence_score: s.confidence_score,
                    thesis: s.thesis,
                    target_price: s.target_price,
                    stop_loss: s.stop_loss,
                    created_at: s.created_at,
                }));

                setPortfolio({ config, positions, sectorMap, activeSignals });
            } catch (err) {
                console.error('[AnalystChat] Failed to fetch portfolio context:', err);
            } finally {
                if (isMounted) setPortfolioLoading(false);
            }
        }

        fetchPortfolio();
        return () => { isMounted = false; };
    }, [isOpen]);

    // Fetch live quotes for all open positions (for unrealized P&L)
    useEffect(() => {
        if (!portfolio?.positions) return;
        let cancelled = false;

        const openTickers = portfolio.positions
            .filter(p => p.status === 'open' && p.ticker)
            .map(p => p.ticker);

        if (openTickers.length === 0) return;

        async function fetchQuotes() {
            const quotes: Record<string, number> = {};
            // Fetch in parallel, cap at 10 to avoid rate limits
            const results = await Promise.allSettled(
                openTickers.slice(0, 10).map(async (tk) => {
                    const q = await MarketDataService.getQuote(tk);
                    return { ticker: tk, price: q?.price ?? null };
                })
            );
            if (cancelled) return;
            for (const r of results) {
                if (r.status === 'fulfilled' && r.value.price != null) {
                    quotes[r.value.ticker] = r.value.price;
                }
            }
            setPositionQuotes(quotes);
        }

        fetchQuotes();
        return () => { cancelled = true; };
    }, [portfolio]);

    // Fetch ticker-specific context if we have an active ticker
    useEffect(() => {
        let isMounted = true;

        async function fetchContext() {
            if (!activeTicker || !isOpen) return;

            setHasLoadedContext(false);
            try {
                const q = await MarketDataService.getQuote(activeTicker);
                if (isMounted) setQuote(q);

                const { data: events } = await supabase
                    .from('market_events')
                    .select('*')
                    .eq('ticker', activeTicker)
                    .order('detected_at', { ascending: false })
                    .limit(5);

                // Fetch multiple signals for aggregated bias analysis
                const { data: signals } = await supabase
                    .from('signals')
                    .select('agent_outputs, created_at')
                    .eq('ticker', activeTicker)
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (isMounted) {
                    // Use newest signal for fundamentals
                    const newestOutputs = (signals?.[0] as any)?.agent_outputs;
                    const fundamentals = newestOutputs?.overreaction?.fundamentals || {};

                    // Aggregate bias weights across all signals (weighted by recency)
                    const biasFields = ['recency_bias', 'anchoring_bias', 'herding_bias', 'loss_aversion', 'confirmation_bias'] as const;
                    const aggregatedBias: Record<string, any> = {};

                    if (signals && signals.length > 0) {
                        const allBiases = signals
                            .map((s: any) => s.agent_outputs?.overreaction?.biasWeights)
                            .filter(Boolean);

                        if (allBiases.length > 0) {
                            // Weighted average: newest signal gets highest weight
                            const weights = allBiases.map((_: any, i: number) => Math.pow(0.7, i));
                            const totalWeight = weights.reduce((a: number, b: number) => a + b, 0);

                            for (const field of biasFields) {
                                const values = allBiases.map((b: any) => b[field]).filter((v: any) => v != null);
                                if (values.length > 0) {
                                    const weightedSum = values.reduce((sum: number, v: number, i: number) => sum + v * (weights[i] ?? 0), 0);
                                    aggregatedBias[field] = Math.round(weightedSum / totalWeight);
                                }
                            }

                            // Take newest overall bias label + explanation, but recalculate score as average
                            const newestBias = allBiases[0];
                            aggregatedBias.overall_bias = newestBias.overall_bias;
                            aggregatedBias.overall_score = newestBias.overall_score;
                            aggregatedBias.bias_explanation = newestBias.bias_explanation;
                            aggregatedBias.signals_analyzed = allBiases.length;
                        }
                    }

                    setTickerAnalysis({
                        events,
                        fundamentals,
                        biasWeights: Object.keys(aggregatedBias).length > 0 ? aggregatedBias : (newestOutputs?.overreaction?.biasWeights || {}),
                    });
                    setHasLoadedContext(true);
                }
            } catch (err) {
                console.error("Failed to fetch chat context:", err);
                if (isMounted) setHasLoadedContext(true);
            }
        }

        fetchContext();

        return () => { isMounted = false; };
    }, [activeTicker, isOpen]);

    // Fetch news articles — per-ticker when active, cross-portfolio in global mode
    useEffect(() => {
        if (!isOpen) {
            setTickerNews([]);
            return;
        }
        let cancelled = false;

        async function fetchNews() {
            try {
                if (activeTicker) {
                    // Single ticker mode
                    const { data } = await supabase
                        .from('rss_cache')
                        .select('title, feed_name, published_at, sentiment_score')
                        .contains('tickers_mentioned', [activeTicker.toUpperCase()])
                        .order('published_at', { ascending: false })
                        .limit(5);

                    if (!cancelled && data) {
                        setTickerNews(data.map(d => ({
                            title: d.title,
                            source: d.feed_name,
                            published_at: d.published_at || '',
                            sentiment_score: d.sentiment_score ?? undefined,
                        })));
                    }
                } else if (portfolio?.positions) {
                    // Cross-portfolio mode — fetch news for all open position tickers
                    const openTickers = portfolio.positions
                        .filter(p => p.status === 'open')
                        .map(p => p.ticker.toUpperCase());

                    if (openTickers.length === 0) {
                        if (!cancelled) setTickerNews([]);
                        return;
                    }

                    // Fetch recent news mentioning any portfolio ticker (parallel queries, 3 per ticker max)
                    const newsPromises = openTickers.slice(0, 10).map(tk =>
                        supabase
                            .from('rss_cache')
                            .select('title, feed_name, published_at, tickers_mentioned, sentiment_score')
                            .contains('tickers_mentioned', [tk])
                            .order('published_at', { ascending: false })
                            .limit(3)
                    );

                    const results = await Promise.all(newsPromises);
                    if (cancelled) return;

                    // Deduplicate by title and tag with the matched ticker
                    const seen = new Set<string>();
                    const allNews: typeof tickerNews = [];

                    for (let i = 0; i < results.length; i++) {
                        const result = results[i];
                        const tk = openTickers[i];
                        if (!result?.data) continue;
                        const { data } = result;
                        for (const d of data) {
                            if (seen.has(d.title)) continue;
                            seen.add(d.title);
                            allNews.push({
                                ticker: tk,
                                title: d.title,
                                source: d.feed_name,
                                published_at: d.published_at || '',
                                sentiment_score: (d as any).sentiment_score ?? undefined,
                            });
                        }
                    }

                    // Sort by date, cap at 10
                    allNews.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());
                    setTickerNews(allNews.slice(0, 10));
                } else {
                    setTickerNews([]);
                }
            } catch {
                if (!cancelled) setTickerNews([]);
            }
        }

        fetchNews();
        return () => { cancelled = true; };
    }, [activeTicker, isOpen, portfolio]);

    // Fetch enriched scanner results for replacement trade ideas
    useEffect(() => {
        if (!isOpen) {
            setScannerResults([]);
            return;
        }
        let cancelled = false;

        async function fetchScannerResults() {
            try {
                const { data } = await supabase
                    .from('signals')
                    .select('ticker, signal_type, confidence_score, projected_roi, confluence_level, thesis, target_price, stop_loss, historical_win_rate, risk_level, created_at')
                    .eq('status', 'active')
                    .order('projected_roi', { ascending: false, nullsFirst: false })
                    .limit(10);

                if (!cancelled && data) {
                    setScannerResults(data.map((s: any) => ({
                        ticker: s.ticker,
                        signal_type: s.signal_type,
                        confidence_score: s.confidence_score,
                        projected_roi: s.projected_roi,
                        confluence_level: s.confluence_level,
                        thesis: s.thesis,
                        target_price: s.target_price,
                        stop_loss: s.stop_loss,
                        historical_win_rate: s.historical_win_rate,
                        risk_level: s.risk_level,
                        created_at: s.created_at,
                    })));
                }
            } catch {
                if (!cancelled) setScannerResults([]);
            }
        }

        fetchScannerResults();
        return () => { cancelled = true; };
    }, [isOpen]);

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // Load conversation from Supabase on open (with sessionStorage as fast cache)
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;

        async function loadConversation() {
            // Try sessionStorage first for instant load
            try {
                const cached = sessionStorage.getItem(`sentinel_chat_${ticker}`);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    if (!cancelled && parsed.messages?.length > 0) {
                        setMessages(parsed.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
                        if (parsed.id) setConversationId(parsed.id);
                        if (parsed.summary) setConversationSummary(parsed.summary);
                    }
                }
            } catch { /* ignore */ }

            // Then load from Supabase (authoritative)
            try {
                const { data } = await supabase
                    .from('chat_conversations')
                    .select('id, messages, summary')
                    .eq('ticker', ticker)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .single();

                if (!cancelled && data) {
                    const dbMessages = (data.messages as any[] || []).map((m: any) => ({
                        ...m,
                        timestamp: new Date(m.timestamp),
                    }));
                    if (dbMessages.length > 0) {
                        setMessages(dbMessages);
                    }
                    setConversationId(data.id);
                    if (data.summary) setConversationSummary(data.summary);
                }
            } catch {
                // No existing conversation — will create one on first message
            }
        }

        loadConversation();
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, ticker]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (data.type === 'ticker' && data.payload) {
                const droppedTicker = data.payload.toUpperCase();
                if (activeTicker !== droppedTicker) {
                    setActiveTicker(droppedTicker);
                }
                setInput(`Run a deep-dive analysis on ${droppedTicker}`);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        } catch { /* ignore */ }
    };

    // Persist messages to sessionStorage (fast) + Supabase (durable)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (messages.length === 0) return;

        // 1. Always write to sessionStorage immediately
        try {
            const toStore = messages.slice(-50);
            sessionStorage.setItem(`sentinel_chat_${ticker}`, JSON.stringify({
                id: conversationId,
                summary: conversationSummary,
                messages: toStore,
            }));
        } catch { /* quota exceeded — non-critical */ }

        // 2. Debounced write to Supabase (500ms after last message change)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            const toSave = messages.slice(-100); // Keep last 100 in DB
            try {
                if (conversationId) {
                    await supabase
                        .from('chat_conversations')
                        .update({
                            messages: toSave as any,
                            summary: conversationSummary || null,
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', conversationId);
                } else if (toSave.length > 0) {
                    const { data } = await supabase
                        .from('chat_conversations')
                        .insert({
                            ticker,
                            messages: toSave as any,
                            summary: conversationSummary || null,
                        })
                        .select('id')
                        .single();
                    if (data?.id) setConversationId(data.id);
                }
            } catch (err) {
                console.warn('[AnalystChat] Failed to persist to Supabase:', err);
            }
        }, 500);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [messages, ticker, conversationId, conversationSummary]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // ─── Build Portfolio Context ─────────────────────────────────────────────

    const buildPortfolioContext = useCallback((): string => {
        if (!portfolio) return '';
        const parts: string[] = [];
        const { config, positions, sectorMap, activeSignals } = portfolio;

        const openPositions = positions.filter(p => p.status === 'open');
        const closedPositions = positions.filter(p => p.status === 'closed');
        const totalCapital = config?.total_capital ?? 10000;

        parts.push('=== PORTFOLIO SNAPSHOT ===');
        parts.push(`Total Capital: ${formatPrice(totalCapital)}`);
        parts.push(`Risk Limits: Max ${config?.max_position_pct ?? 10}% per position, ${config?.max_total_exposure_pct ?? 50}% total exposure, ${config?.max_sector_exposure_pct ?? 25}% per sector`);

        // Open positions with exposure and live P&L
        if (openPositions.length > 0) {
            let totalExposure = 0;
            let totalUnrealizedPnl = 0;

            parts.push(`\nOPEN POSITIONS (${openPositions.length}):`);
            for (const pos of openPositions) {
                const size = getPositionExposure(pos);
                totalExposure += size;
                const currency = inferCurrency(pos.ticker);
                const pct = totalCapital > 0 ? (size / totalCapital * 100) : 0;
                const sector = sectorMap[pos.ticker] || sectorMap[pos.ticker.replace('.L', '')] || 'Unknown';

                const entryPrice = pos.entry_price ?? 0;
                const shares = pos.shares ?? 0;
                const currentPrice = positionQuotes[pos.ticker];

                let pnlStr = '';
                if (currentPrice != null && entryPrice > 0 && shares > 0) {
                    const multiplier = pos.side === 'short' ? -1 : 1;
                    const unrealizedPnl = (currentPrice - entryPrice) * shares * multiplier;
                    const unrealizedPct = ((currentPrice - entryPrice) / entryPrice) * 100 * multiplier;
                    totalUnrealizedPnl += unrealizedPnl;
                    pnlStr = ` | Current: ${formatPrice(currentPrice, currency)} | P&L: ${unrealizedPnl >= 0 ? '+' : ''}${formatPrice(unrealizedPnl, currency)} (${unrealizedPct >= 0 ? '+' : ''}${unrealizedPct.toFixed(1)}%)`;
                }

                parts.push(`  ${pos.ticker} | ${pos.side.toUpperCase()} | ${shares} shares @ ${formatPrice(entryPrice, currency)} | Size: ${formatPrice(size, currency)} (${pct.toFixed(1)}%) | Sector: ${sector}${pnlStr}`);
            }

            if (Object.keys(positionQuotes).length > 0) {
                parts.push(`\nTOTAL UNREALIZED P&L: ${totalUnrealizedPnl >= 0 ? '+' : ''}${formatPrice(totalUnrealizedPnl)}`);
            }

            // Sector allocation breakdown
            const sectorExposure: Record<string, number> = {};
            for (const pos of openPositions) {
                const sector = sectorMap[pos.ticker] || sectorMap[pos.ticker.replace('.L', '')] || 'Other';
                const size = getPositionExposure(pos);
                sectorExposure[sector] = (sectorExposure[sector] || 0) + size;
            }

            parts.push(`\nSECTOR ALLOCATION:`);
            for (const [sector, exposure] of Object.entries(sectorExposure).sort((a, b) => b[1] - a[1])) {
                const pct = totalCapital > 0 ? (exposure / totalCapital * 100) : 0;
                const overLimit = pct > (config?.max_sector_exposure_pct ?? 25);
                parts.push(`  ${sector}: ${formatPrice(exposure)} (${pct.toFixed(1)}%)${overLimit ? ' ⚠️ OVER LIMIT' : ''}`);
            }

            const exposurePct = totalCapital > 0 ? (totalExposure / totalCapital * 100) : 0;
            const overTotalLimit = exposurePct > (config?.max_total_exposure_pct ?? 50);
            parts.push(`\nTOTAL EXPOSURE: ${formatPrice(totalExposure)} (${exposurePct.toFixed(1)}% of capital)${overTotalLimit ? ' ⚠️ OVER LIMIT' : ''}`);
            parts.push(`CASH AVAILABLE: ${formatPrice(totalCapital - totalExposure)} (${(100 - exposurePct).toFixed(1)}%)`);

            // Realized P&L from closed positions
            if (closedPositions.length > 0) {
                const realizedPnl = closedPositions.reduce((sum, p) => sum + (p.realized_pnl ?? 0), 0);
                const wins = closedPositions.filter(p => (p.realized_pnl ?? 0) > 0).length;
                const losses = closedPositions.filter(p => (p.realized_pnl ?? 0) < 0).length;
                parts.push(`\nCLOSED TRADES: ${closedPositions.length} (${wins}W/${losses}L) | Realized P&L: ${formatPrice(realizedPnl)}`);
            }
        } else {
            parts.push('\nNo open positions.');
        }

        // Active signals (high-conviction opportunities)
        if (activeSignals.length > 0) {
            parts.push(`\nACTIVE SIGNALS (${activeSignals.length}):`);
            for (const sig of activeSignals.slice(0, 10)) {
                const target = sig.target_price ? formatPrice(sig.target_price) : 'N/A';
                const stop = sig.stop_loss ? formatPrice(sig.stop_loss) : 'N/A';
                parts.push(`  ${sig.ticker} | ${sig.signal_type} | Confidence: ${sig.confidence_score}/100 | Target: ${target} | Stop: ${stop}`);
                if (sig.thesis) parts.push(`    Thesis: ${sig.thesis.slice(0, 120)}${sig.thesis.length > 120 ? '...' : ''}`);
            }
        }

        parts.push('=== END PORTFOLIO ===');
        return parts.join('\n');
    }, [portfolio, positionQuotes]);

    // ─── Build Ticker Context ────────────────────────────────────────────────

    const buildTickerContext = useCallback((): string => {
        if (!activeTicker) return '';
        const parts: string[] = [];

        parts.push(`\n=== ACTIVE TICKER: ${ticker} ===`);

        if (quote) {
            parts.push(`PRICE: $${quote.price != null ? Number(quote.price).toFixed(2) : 'N/A'} | CHANGE: ${quote.changePercent != null ? Number(quote.changePercent).toFixed(2) : 'N/A'}%`);
            if (quote.volume) parts.push(`VOLUME: ${quote.volume.toLocaleString()}`);
        }

        if (tickerAnalysis?.biasWeights) {
            const bw = tickerAnalysis.biasWeights;
            const signalCount = bw.signals_analyzed || 1;
            parts.push(`\nBIAS ANALYSIS (aggregated across ${signalCount} signal${signalCount > 1 ? 's' : ''}):`);
            parts.push(`  Overall Bias: ${bw.overall_bias || 'N/A'} (Score: ${bw.overall_score || 'N/A'})`);
            if (bw.recency_bias) parts.push(`  Recency Bias: ${bw.recency_bias}/100`);
            if (bw.anchoring_bias) parts.push(`  Anchoring Bias: ${bw.anchoring_bias}/100`);
            if (bw.herding_bias) parts.push(`  Herding Bias: ${bw.herding_bias}/100`);
            if (bw.loss_aversion) parts.push(`  Loss Aversion: ${bw.loss_aversion}/100`);
            if (bw.confirmation_bias) parts.push(`  Confirmation Bias: ${bw.confirmation_bias}/100`);
            if (bw.bias_explanation) parts.push(`  Explanation: ${bw.bias_explanation}`);
        }

        if (tickerAnalysis?.fundamentals) {
            const f = tickerAnalysis.fundamentals;
            parts.push(`\nFUNDAMENTALS:`);
            if (f.sector) parts.push(`  Sector: ${f.sector}`);
            if (f.industry) parts.push(`  Industry: ${f.industry}`);
            if (f.marketCap) parts.push(`  Market Cap: ${f.marketCap}`);
            if (f.pe) parts.push(`  P/E Ratio: ${f.pe}`);
            if (f.eps) parts.push(`  EPS: ${f.eps}`);
            if (f.dividendYield) parts.push(`  Dividend Yield: ${f.dividendYield}`);
            if (f.beta) parts.push(`  Beta: ${f.beta}`);
            if (f.week52High) parts.push(`  52W High: $${f.week52High}`);
            if (f.week52Low) parts.push(`  52W Low: $${f.week52Low}`);
        }

        if (tickerAnalysis?.events?.length > 0) {
            parts.push(`\nRECENT EVENTS:`);
            tickerAnalysis.events.slice(0, 5).forEach((ev: any, i: number) => {
                parts.push(`  ${i + 1}. [${ev.event_type}] ${ev.headline} (Severity: ${ev.severity}/10)`);
            });
        }

        parts.push(`=== END TICKER ===`);
        return parts.join('\n');
    }, [ticker, activeTicker, tickerAnalysis, quote]);

    // ─── Build News Context ────────────────────────────────────────────────

    const buildNewsContext = useCallback((): string => {
        if (tickerNews.length === 0) return '';
        const parts: string[] = [];
        const heading = activeTicker
            ? `=== RECENT NEWS FOR ${ticker} ===`
            : '=== PORTFOLIO NEWS (across your holdings) ===';
        parts.push(`\n${heading}`);
        for (const article of tickerNews) {
            const timeStr = article.published_at
                ? new Date(article.published_at).toLocaleDateString()
                : 'Unknown date';
            const tickerTag = article.ticker && !activeTicker ? `[${article.ticker}] ` : '';
            const sentimentTag = article.sentiment_score != null
                ? ` [Sentiment: ${article.sentiment_score > 0.3 ? 'Positive' : article.sentiment_score < -0.3 ? 'Negative' : 'Neutral'} (${article.sentiment_score.toFixed(2)})]`
                : '';
            parts.push(`  • ${tickerTag}[${article.source}] ${article.title} (${timeStr})${sentimentTag}`);
        }
        parts.push('=== END NEWS ===');
        return parts.join('\n');
    }, [tickerNews, ticker, activeTicker]);

    // ─── Build Scanner Context ───────────────────────────────────────────────

    const buildScannerContext = useCallback((): string => {
        if (scannerResults.length === 0) return '';
        const parts: string[] = [];
        parts.push('\n=== SCANNER INTELLIGENCE (Top Active Signals) ===');
        for (const sig of scannerResults) {
            const roi = sig.projected_roi != null ? `ROI: ${sig.projected_roi}%` : '';
            const wr = sig.historical_win_rate != null ? `WinRate: ${sig.historical_win_rate}%` : '';
            const conf = `Conf: ${sig.confidence_score}/100`;
            const confl = sig.confluence_level ? `Confluence: ${sig.confluence_level}` : '';
            const target = sig.target_price != null ? `Target: ${formatPrice(sig.target_price)}` : '';
            const stop = sig.stop_loss != null ? `Stop: ${formatPrice(sig.stop_loss)}` : '';
            const meta = [conf, roi, wr, confl, target, stop, `Risk: ${sig.risk_level}`].filter(Boolean).join(' | ');

            parts.push(`  ${sig.ticker} [${sig.signal_type}] — ${meta}`);
            if (sig.thesis) parts.push(`    Thesis: ${sig.thesis.slice(0, 150)}${sig.thesis.length > 150 ? '...' : ''}`);
        }
        parts.push('=== END SCANNER ===');
        return parts.join('\n');
    }, [scannerResults]);

    // ─── Conversation Memory — Summarize when history grows long ──────────

    const summarizeHistory = useCallback(async (msgs: ChatMessage[]): Promise<string> => {
        // Only summarize if we have enough messages
        if (msgs.length < 14) return conversationSummary;

        // Take older messages beyond the recent window (12 messages)
        const olderMessages = msgs.slice(0, -12);
        if (olderMessages.length === 0) return conversationSummary;

        const historyText = olderMessages.map(m =>
            `${m.role === 'user' ? 'USER' : 'ANALYST'}: ${m.content.slice(0, 200)}`
        ).join('\n');

        const existingSummary = conversationSummary
            ? `Previous summary: ${conversationSummary}\n\nNew messages to incorporate:\n`
            : '';

        try {
            const result = await GeminiService.generate<any>({
                prompt: `${existingSummary}Summarize this trading conversation in 2-3 concise sentences, preserving key decisions, tickers discussed, and any actions taken:\n\n${historyText}`,
                temperature: 0.2,
            });

            if (result.success && result.data) {
                const summary = typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
                return summary;
            }
        } catch (err) {
            console.error('[AnalystChat] Failed to summarize history:', err);
        }
        return conversationSummary;
    }, [conversationSummary]);

    // ─── Extract AI-generated Follow-up Suggestions ─────────────────────────

    const extractFollowups = useCallback((assistantResponse: string): string[] => {
        // First try to extract AI-generated follow-ups from the [FOLLOWUPS] tag
        const followupMatch = assistantResponse.match(/\[FOLLOWUPS\]\s*(.+?)$/m);
        if (followupMatch?.[1]) {
            const aiFollowups = followupMatch[1]
                .split('|')
                .map(q => q.trim())
                .filter(q => q.length > 0)
                .slice(0, 3);
            if (aiFollowups.length >= 2) return aiFollowups;
        }

        // Fallback: keyword-based suggestions
        const followups: string[] = [];
        const lowerResp = assistantResponse.toLowerCase();

        if (activeTicker) {
            if (lowerResp.includes('risk') || lowerResp.includes('stop loss')) {
                followups.push(`What's the optimal position size for ${ticker}?`);
            }
            if (lowerResp.includes('bullish') || lowerResp.includes('upside')) {
                followups.push(`Run a sanity check on ${ticker}`);
            }
            if (followups.length < 2) {
                followups.push(`Compare ${ticker} with its top competitor`);
            }
        } else {
            if (lowerResp.includes('sector')) {
                followups.push('Which sectors have the strongest momentum right now?');
            }
            if (lowerResp.includes('exposure')) {
                followups.push('How should I rebalance to reduce concentration risk?');
            }
        }

        if (followups.length < 3) {
            followups.push(activeTicker
                ? `What are the key catalysts for ${ticker} this quarter?`
                : 'Give me your top 3 trade ideas for this week');
        }

        return followups.slice(0, 3);
    }, [activeTicker, ticker]);

    // ─── Execute Actions from AI Response ─────────────────────────────────

    const executeActions = useCallback(async (messageText: string) => {
        // ACTION: Add Position
        if (messageText.includes('[ACTION:ADD_POSITION]')) {
            const actionMatch = messageText.match(/\[ACTION:ADD_POSITION\]\s*(\w+(?:\.\w+)?)\s*@?\s*\$?([\d.]+)\s*x?\s*(\d+)?\s*(LONG|SHORT)?/i);
            if (actionMatch) {
                const [, actionTicker, price, shares, side] = actionMatch;
                await supabase.from('positions').insert({
                    ticker: (actionTicker || ticker).toUpperCase(),
                    entry_price: parseFloat(price || '0'),
                    shares: parseInt(shares || '100', 10),
                    side: (side || 'long').toLowerCase(),
                    status: 'open',
                    currency: inferCurrency((actionTicker || ticker).toUpperCase()),
                    opened_at: new Date().toISOString(),
                });
                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `Position added: ${(actionTicker || ticker).toUpperCase()}`,
                    timestamp: new Date(),
                }]);
            }
        }

        // ACTION: Close Position (with P&L calc + post-mortem)
        if (messageText.includes('[ACTION:CLOSE_POSITION]')) {
            const closeMatch = messageText.match(/\[ACTION:CLOSE_POSITION\]\s*(\w+(?:\.\w+)?)\s*@?\s*\$?([\d.]+)\s*([\w_]+)?/i);
            if (closeMatch?.[1] && closeMatch?.[2]) {
                const closeTicker = closeMatch[1].toUpperCase();
                const exitPrice = parseFloat(closeMatch[2]);
                const closeReason = closeMatch[3] || 'manual';

                // Find the open position
                const { data: openPos } = await supabase
                    .from('positions')
                    .select('*')
                    .eq('ticker', closeTicker)
                    .eq('status', 'open')
                    .limit(1)
                    .single();

                if (openPos && openPos.entry_price && openPos.shares) {
                    const multiplier = openPos.side === 'short' ? -1 : 1;
                    const realizedPnl = (exitPrice - openPos.entry_price) * openPos.shares * multiplier;
                    const realizedPnlPct = ((exitPrice - openPos.entry_price) / openPos.entry_price) * 100 * multiplier;

                    const { error } = await supabase.from('positions')
                        .update({
                            status: 'closed',
                            exit_price: exitPrice,
                            closed_at: new Date().toISOString(),
                            realized_pnl: realizedPnl,
                            realized_pnl_pct: realizedPnlPct,
                            close_reason: closeReason,
                        })
                        .eq('id', openPos.id);

                    if (!error) {
                        const pnlStr = `${realizedPnl >= 0 ? '+' : ''}$${realizedPnl.toFixed(2)} (${realizedPnlPct >= 0 ? '+' : ''}${realizedPnlPct.toFixed(1)}%)`;
                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: `Position closed: ${closeTicker} @ $${exitPrice.toFixed(2)} | P&L: ${pnlStr}`,
                            timestamp: new Date(),
                        }]);

                        // Fire-and-forget post-mortem generation
                        PostMortemService.generateAndSave(openPos.id, {
                            ticker: closeTicker,
                            side: openPos.side,
                            entry_price: openPos.entry_price,
                            exit_price: exitPrice,
                            shares: openPos.shares,
                            realized_pnl: realizedPnl,
                            realized_pnl_pct: realizedPnlPct,
                            opened_at: openPos.opened_at || new Date().toISOString(),
                            closed_at: new Date().toISOString(),
                            close_reason: closeReason,
                            original_notes: openPos.notes || undefined,
                        }).catch(err => console.error('[Chat] Post-mortem failed:', err));
                    } else {
                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: `Failed to close ${closeTicker}: ${error.message}`,
                            timestamp: new Date(),
                        }]);
                    }
                } else {
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `No open position found for ${closeTicker}`,
                        timestamp: new Date(),
                    }]);
                }
            }
        }

        // ACTION: Update Position
        if (messageText.includes('[ACTION:UPDATE_POSITION]')) {
            const updateMatch = messageText.match(/\[ACTION:UPDATE_POSITION\]\s*(\w+(?:\.\w+)?)\s+(\w+)=([\d.]+)/i);
            if (updateMatch?.[1] && updateMatch?.[2] && updateMatch?.[3]) {
                const updateTicker = updateMatch[1].toUpperCase();
                const field = updateMatch[2].toLowerCase();
                const value = parseFloat(updateMatch[3]);

                const allowedFields: Record<string, string> = {
                    shares: 'shares',
                    entry_price: 'entry_price',
                    stop_loss: 'notes', // Store stop loss in notes since no dedicated column
                };

                if (allowedFields[field]) {
                    const updateData: Record<string, any> = {};
                    if (field === 'stop_loss') {
                        // Append stop loss to notes
                        const { data: pos } = await supabase
                            .from('positions')
                            .select('notes')
                            .eq('ticker', updateTicker)
                            .eq('status', 'open')
                            .limit(1)
                            .single();

                        const existingNotes = (pos as any)?.notes || '';
                        updateData.notes = `${existingNotes}\n[Stop Loss: $${value.toFixed(2)}]`.trim();
                    } else {
                        updateData[allowedFields[field]!] = value;
                    }

                    const { error } = await supabase.from('positions')
                        .update(updateData)
                        .eq('ticker', updateTicker)
                        .eq('status', 'open');

                    if (!error) {
                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: `Position updated: ${updateTicker} ${field} = ${value}`,
                            timestamp: new Date(),
                        }]);
                    } else {
                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: `Failed to update ${updateTicker}: ${error.message}`,
                            timestamp: new Date(),
                        }]);
                    }
                }
            }
        }

        // ACTION: Delete Position (mistaken entries only)
        if (messageText.includes('[ACTION:DELETE_POSITION]')) {
            const deleteMatch = messageText.match(/\[ACTION:DELETE_POSITION\]\s*(\w+(?:\.\w+)?)/i);
            if (deleteMatch?.[1]) {
                const deleteTicker = deleteMatch[1].toUpperCase();
                const { error } = await supabase
                    .from('positions')
                    .delete()
                    .eq('ticker', deleteTicker)
                    .eq('status', 'open');
                if (!error) {
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `Position deleted: ${deleteTicker}`,
                        timestamp: new Date(),
                    }]);
                } else {
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `Failed to delete ${deleteTicker}: ${error.message}`,
                        timestamp: new Date(),
                    }]);
                }
            }
        }

        // ACTION: Add to Watchlist
        if (messageText.includes('[ACTION:ADD_WATCHLIST]')) {
            const watchMatch = messageText.match(/\[ACTION:ADD_WATCHLIST\]\s*(\w+(?:\.\w+)?)/i);
            if (watchMatch?.[1]) {
                const watchTicker = watchMatch[1].toUpperCase();
                await supabase.from('watchlist').upsert(
                    { ticker: watchTicker, is_active: true, sector: 'Other', company_name: watchTicker } as any,
                    { onConflict: 'ticker' }
                );
                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `Added ${watchTicker} to watchlist`,
                    timestamp: new Date(),
                }]);
            }
        }

        // ACTION: Remove from Watchlist
        if (messageText.includes('[ACTION:REMOVE_WATCHLIST]')) {
            const removeMatch = messageText.match(/\[ACTION:REMOVE_WATCHLIST\]\s*(\w+(?:\.\w+)?)/i);
            if (removeMatch?.[1]) {
                const removeTicker = removeMatch[1].toUpperCase();
                const { error } = await supabase.from('watchlist')
                    .update({ is_active: false } as any)
                    .eq('ticker', removeTicker);
                if (!error) {
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `Removed ${removeTicker} from watchlist`,
                        timestamp: new Date(),
                    }]);
                }
            }
        }

        // ACTION: Run Scanner
        if (messageText.includes('[ACTION:RUN_SCAN]')) {
            const scanMatch = messageText.match(/\[ACTION:RUN_SCAN\]\s*(\w+(?:\.\w+)?)/i);
            if (scanMatch?.[1]) {
                const scanTicker = scanMatch[1].toUpperCase();
                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `Opening scanner for ${scanTicker}...`,
                    timestamp: new Date(),
                }]);
                setTimeout(() => {
                    window.location.href = `/scanner?ticker=${scanTicker}`;
                }, 500);
            }
        }

        // ACTION: Run Agent (Overreaction, Sanity Check, Earnings)
        if (messageText.includes('[ACTION:RUN_AGENT]')) {
            const agentMatch = messageText.match(/\[ACTION:RUN_AGENT\]\s*(\w+)\s+(\w+(?:\.\w+)?)/i);
            if (agentMatch?.[1] && agentMatch?.[2]) {
                const agentType = agentMatch[1].toUpperCase();
                const agentTicker = agentMatch[2].toUpperCase();

                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `Running ${agentType} agent on ${agentTicker}...`,
                    timestamp: new Date(),
                }]);

                try {
                    let agentResult: any = null;
                    const agentQuote = await MarketDataService.getQuote(agentTicker);
                    const currentPrice = agentQuote?.price || 0;

                    // Fetch latest event for context
                    const { data: latestEvent } = await supabase
                        .from('market_events')
                        .select('headline, description, price_change_pct')
                        .eq('ticker', agentTicker)
                        .order('detected_at', { ascending: false })
                        .limit(1)
                        .single();

                    if (agentType === 'OVERREACTION') {
                        agentResult = await AgentService.evaluateOverreaction(
                            agentTicker,
                            latestEvent?.headline || `Analyzing ${agentTicker}`,
                            latestEvent?.description || 'User-requested analysis',
                            currentPrice,
                            Math.abs(latestEvent?.price_change_pct || 0),
                        );
                    } else if (agentType === 'SANITY_CHECK') {
                        // Get the latest signal thesis for this ticker
                        const { data: signal } = await supabase
                            .from('signals')
                            .select('thesis, target_price, stop_loss, signal_type')
                            .eq('ticker', agentTicker)
                            .eq('status', 'active')
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .single();

                        if (signal) {
                            agentResult = await AgentService.runSanityCheck(
                                agentTicker,
                                signal.thesis || '',
                                signal.target_price || currentPrice * 1.1,
                                signal.stop_loss || currentPrice * 0.9,
                                signal.signal_type || 'overreaction',
                            );
                        } else {
                            setMessages(prev => [...prev, {
                                role: 'system',
                                content: `No active signal found for ${agentTicker} — sanity check requires an existing thesis to red-team.`,
                                timestamp: new Date(),
                            }]);
                        }
                    } else if (agentType === 'EARNINGS') {
                        agentResult = await AgentService.evaluateEarnings(
                            agentTicker, 0, 0, 0, 0,
                            latestEvent?.description || 'User-requested earnings analysis',
                            Math.abs(latestEvent?.price_change_pct || 0),
                        );
                    }

                    if (agentResult?.success && agentResult.data) {
                        const data = agentResult.data;
                        let summary = `**${agentType} Agent Result for ${agentTicker}:**\n`;

                        if (agentType === 'OVERREACTION' && data.reasoning) {
                            summary += `Overreaction: ${data.is_overreaction ? 'YES' : 'NO'} | Confidence: ${data.confidence_score}/100\n`;
                            summary += `Thesis: ${data.thesis || 'N/A'}\n`;
                            if (data.target_price) summary += `Target: $${data.target_price} | Stop: $${data.stop_loss}\n`;
                            summary += `Reasoning: ${data.reasoning.slice(0, 300)}`;
                        } else if (agentType === 'SANITY_CHECK') {
                            summary += `Passes: ${data.passes_sanity_check ? 'YES' : 'NO'} | Risk: ${data.risk_score}/100\n`;
                            if (data.fatal_flaws?.length) summary += `Fatal Flaws: ${data.fatal_flaws.join('; ')}\n`;
                            summary += `Counter-thesis: ${data.counter_thesis || 'N/A'}`;
                        } else if (agentType === 'EARNINGS') {
                            summary += JSON.stringify(data, null, 2).slice(0, 500);
                        }

                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: summary,
                            timestamp: new Date(),
                        }]);
                    } else if (agentResult && !agentResult.success) {
                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: `Agent ${agentType} failed: ${agentResult.error || 'Unknown error'}`,
                            timestamp: new Date(),
                        }]);
                    }
                } catch (agentErr: any) {
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `Agent error: ${agentErr.message}`,
                        timestamp: new Date(),
                    }]);
                }
            }
        }

        // ACTION: Position Size calculation
        if (messageText.includes('[ACTION:POSITION_SIZE]')) {
            const sizeMatch = messageText.match(/\[ACTION:POSITION_SIZE\]\s*(\w+(?:\.\w+)?)\s*@?\s*\$?([\d.]+)\s*TARGET=([\d.]+)\s*STOP=([\d.]+)\s*(\w+)?/i);
            if (sizeMatch?.[1] && sizeMatch?.[2]) {
                const sizeTicker = sizeMatch[1].toUpperCase();
                const entryPrice = parseFloat(sizeMatch[2]);
                const targetPrice = sizeMatch[3] ? parseFloat(sizeMatch[3]) : null;
                // sizeMatch[4] is the user-provided stop loss (for reference in prompt context)
                const signalType = sizeMatch[5] || 'overreaction';

                setMessages(prev => [...prev, {
                    role: 'system',
                    content: `Calculating position size for ${sizeTicker}...`,
                    timestamp: new Date(),
                }]);

                try {
                    // Fetch TA snapshot if available
                    const { data: signalData } = await supabase
                        .from('signals')
                        .select('ta_snapshot, confidence_score, confluence_score, conviction_score')
                        .eq('ticker', sizeTicker)
                        .eq('status', 'active')
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    const taSnapshot = signalData?.ta_snapshot as TASnapshot | null;
                    const confidence = signalData?.confidence_score || 65;
                    const confluenceScore = signalData?.confluence_score || undefined;
                    const convictionScore = signalData?.conviction_score || undefined;

                    const result = await PositionSizer.calculateSizeV2(
                        confidence,
                        entryPrice,
                        targetPrice,
                        signalType,
                        taSnapshot,
                        sizeTicker,
                        confluenceScore,
                        convictionScore,
                    );

                    let sizeMsg = `**Position Size for ${sizeTicker}:**\n`;
                    sizeMsg += `Recommended: ${result.recommendedPct.toFixed(2)}% ($${result.usdValue.toFixed(2)})`;
                    if (result.shares) sizeMsg += ` = ~${result.shares} shares`;
                    sizeMsg += `\nMethod: ${result.method.replace('_', ' ')}`;
                    if (result.stopLoss) sizeMsg += ` | Stop: $${result.stopLoss.toFixed(2)}`;
                    if (result.riskRewardRatio) sizeMsg += ` | R:R ${result.riskRewardRatio}:1`;
                    if (result.trailingStopRule) sizeMsg += `\n${result.trailingStopRule}`;
                    if (result.limitReason) sizeMsg += `\nNote: ${result.limitReason}`;

                    sizeMsg += `\n\nComparison: Fixed ${result.comparisons.fixedPct.pct}% ($${result.comparisons.fixedPct.usd.toFixed(0)})`;
                    sizeMsg += ` | Risk-based ${result.comparisons.riskBased.pct}% ($${result.comparisons.riskBased.usd.toFixed(0)})`;
                    if (result.comparisons.kelly) sizeMsg += ` | Kelly ${result.comparisons.kelly.pct}% ($${result.comparisons.kelly.usd.toFixed(0)})`;

                    if (result.drawdownScaling && result.drawdownScaling.scalingFactor < 1) {
                        sizeMsg += `\nDrawdown: ${result.drawdownScaling.currentDrawdownPct.toFixed(1)}% → sizing at ${Math.round(result.drawdownScaling.scalingFactor * 100)}%`;
                    }

                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: sizeMsg,
                        timestamp: new Date(),
                    }]);
                } catch (sizeErr: any) {
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `Position sizing error: ${sizeErr.message}`,
                        timestamp: new Date(),
                    }]);
                }
            }
        }
    }, [ticker, setMessages]);

    // ─── Send Message ────────────────────────────────────────────────────────

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            // --- SLASH COMMANDS HANDLING ---
            if (trimmed.startsWith('/')) {
                const parts = trimmed.split(' ');
                const command = (parts[0] || '').toLowerCase();
                const args = parts.slice(1).join(' ');

                let systemResponse = '';

                switch (command) {
                    case '/screen': {
                        const screenCriteria = args || 'high-conviction overreaction setups';
                        // Show immediate feedback
                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: `Screening for: ${screenCriteria}...`,
                            timestamp: new Date(),
                        }]);

                        // Build context from scanner results + portfolio for Gemini
                        const screenContext = buildScannerContext();
                        const portfolioCtx = buildPortfolioContext();

                        try {
                            const screenResult = await GeminiService.generate<string>({
                                prompt: `You are a trading screen tool. The user wants to screen for: "${screenCriteria}".

Here are the current active signals from the scanner:
${screenContext || 'No active scanner signals available.'}

${portfolioCtx}

Based on the active signals and scanner data, return the top 3-5 matches for the user's criteria. For each match, include:
- Ticker and signal type
- Confidence score and projected ROI
- Brief thesis (1-2 sentences)
- Entry/target/stop if available
- Why it matches the screen criteria

If no signals match the criteria well, say so and suggest what to look for instead. Be concise and direct.`,
                                requireGroundedSearch: true,
                                temperature: 0.3,
                            });

                            if (screenResult.success && screenResult.data) {
                                systemResponse = typeof screenResult.data === 'string'
                                    ? screenResult.data
                                    : JSON.stringify(screenResult.data);
                            } else {
                                systemResponse = `Screen failed: ${screenResult.error || 'Unknown error'}`;
                            }
                        } catch (screenErr: any) {
                            systemResponse = `Screen error: ${screenErr.message}`;
                        }
                        break;
                    }
                    case '/compare': {
                        if (!args) {
                            systemResponse = `**Usage:** \`/compare TICKER\`\nExample: \`/compare MSFT\` to compare ${ticker} with MSFT.`;
                        } else {
                            const compareTicker = args.trim().toUpperCase();
                            // Show immediate feedback
                            setMessages(prev => [...prev, {
                                role: 'system',
                                content: `Comparing ${ticker} vs ${compareTicker}...`,
                                timestamp: new Date(),
                            }]);

                            try {
                                // Fetch quotes for both tickers in parallel
                                const [quoteA, quoteB] = await Promise.all([
                                    MarketDataService.getQuote(ticker),
                                    MarketDataService.getQuote(compareTicker),
                                ]);

                                // Fetch signals for both
                                const [sigA, sigB] = await Promise.all([
                                    supabase.from('signals')
                                        .select('signal_type, confidence_score, thesis, target_price, stop_loss, projected_roi')
                                        .eq('ticker', ticker).eq('status', 'active')
                                        .order('created_at', { ascending: false }).limit(1).single(),
                                    supabase.from('signals')
                                        .select('signal_type, confidence_score, thesis, target_price, stop_loss, projected_roi')
                                        .eq('ticker', compareTicker).eq('status', 'active')
                                        .order('created_at', { ascending: false }).limit(1).single(),
                                ]);

                                const tickerCtx = buildTickerContext();

                                const compareResult = await GeminiService.generate<string>({
                                    prompt: `Compare these two stocks for a trading decision:

**${ticker}:**
- Price: $${quoteA?.price ?? 'N/A'} | Change: ${quoteA?.changePercent ?? 'N/A'}%
- Volume: ${quoteA?.volume?.toLocaleString() ?? 'N/A'}
${sigA.data ? `- Signal: ${sigA.data.signal_type} | Confidence: ${sigA.data.confidence_score}/100 | ROI: ${sigA.data.projected_roi ?? 'N/A'}%\n- Thesis: ${sigA.data.thesis || 'N/A'}` : '- No active signal'}
${tickerCtx}

**${compareTicker}:**
- Price: $${quoteB?.price ?? 'N/A'} | Change: ${quoteB?.changePercent ?? 'N/A'}%
- Volume: ${quoteB?.volume?.toLocaleString() ?? 'N/A'}
${sigB.data ? `- Signal: ${sigB.data.signal_type} | Confidence: ${sigB.data.confidence_score}/100 | ROI: ${sigB.data.projected_roi ?? 'N/A'}%\n- Thesis: ${sigB.data.thesis || 'N/A'}` : '- No active signal'}

Provide a side-by-side comparison covering:
1. Valuation & momentum
2. Risk profile
3. Signal strength (if available)
4. Clear recommendation: which is the better trade RIGHT NOW and why

Be direct and opinionated. Use actual numbers.`,
                                    requireGroundedSearch: true,
                                    temperature: 0.3,
                                });

                                if (compareResult.success && compareResult.data) {
                                    systemResponse = typeof compareResult.data === 'string'
                                        ? compareResult.data
                                        : JSON.stringify(compareResult.data);
                                } else {
                                    systemResponse = `Compare failed: ${compareResult.error || 'Unknown error'}`;
                                }
                            } catch (compareErr: any) {
                                systemResponse = `Compare error: ${compareErr.message}`;
                            }
                        }
                        break;
                    }
                    case '/risk': {
                        const severitySum = tickerAnalysis?.events?.reduce((acc: number, ev: any) => acc + (ev?.severity || 0), 0) || 0;
                        systemResponse = `**Risk Profile for ${ticker}:**\n- Volatility (Beta): ${tickerAnalysis?.fundamentals?.beta || 'Unknown'}\n- Recent Events Severity: ${severitySum} (Cumulative)\n- AI Bias Confidence: ${tickerAnalysis?.biasWeights?.overall_score || 'Unknown'}/100\n\n*Note: This is a simulated risk profile based on current context.*`;
                        break;
                    }
                    case '/portfolio': {
                        const ctx = buildPortfolioContext();
                        systemResponse = ctx || 'No portfolio data loaded. Try reopening the chat.';
                        break;
                    }
                    case '/help':
                        systemResponse = `**Available Commands:**\n- \`/screen [criteria]\`: Run a custom market screen\n- \`/compare [ticker]\`: Compare current active ticker with another\n- \`/risk\`: Get a quick risk summary for the current ticker\n- \`/portfolio\`: Show raw portfolio snapshot\n- \`/clear\`: Clear the chat history`;
                        break;
                    case '/clear':
                        setMessages([]);
                        setConversationSummary('');
                        // Clear Supabase conversation
                        if (conversationId) {
                            supabase.from('chat_conversations').delete().eq('id', conversationId).then(() => {
                                setConversationId(null);
                            });
                        }
                        try { sessionStorage.removeItem(`sentinel_chat_${ticker}`); } catch { /* ignore */ }
                        setIsLoading(false);
                        return;
                    default:
                        systemResponse = `Unknown command: \`${command}\`. Type \`/help\` to see available commands.`;
                }

                setMessages(prev => [...prev, {
                    role: 'system',
                    content: systemResponse,
                    timestamp: new Date()
                }]);
                setIsLoading(false);
                return;
            }
            // --- END SLASH COMMANDS ---

            const portfolioContext = buildPortfolioContext();
            const tickerContext = buildTickerContext();
            const newsContext = buildNewsContext();
            const scannerContext = buildScannerContext();

            // Build conversation history with rolling memory (expanded window)
            const recentMessages = messages.slice(-12);
            const historyBlock = recentMessages.map(m =>
                `${m.role === 'user' ? 'USER' : (m.role === 'assistant' ? 'ANALYST' : 'SYSTEM')}: ${m.content.slice(0, 500)}`
            ).join('\n');

            // Include conversation summary for long-running chats
            const memoryBlock = conversationSummary
                ? `CONVERSATION SUMMARY (earlier context):\n${conversationSummary}\n`
                : '';

            const prompt = `
You are Sentinel's AI Trading Analyst. You have FULL access to the user's live portfolio data, active trading signals, scanner intelligence, and recent news.
${activeTicker ? `The user is currently viewing ${ticker}.` : 'The user is in global market mode.'}

${portfolioContext}

${tickerContext}

${newsContext}

${scannerContext}

${memoryBlock}${historyBlock ? `RECENT CONVERSATION:\n${historyBlock}\n` : ''}
USER'S QUESTION: ${trimmed}

INSTRUCTIONS:
1. You have the user's COMPLETE portfolio state above — positions, sector allocation, exposure limits, P&L, and active signals. Use this data to give specific, quantitative answers.
2. When asked about exposure, concentration, or risk — reference their ACTUAL numbers (sector %, position sizes, limit breaches).
3. When asked about rotation opportunities or what to sell/buy — cross-reference their PORTFOLIO positions against the SCANNER INTELLIGENCE section. Recommend specific replacements with projected ROI, win rates, and confidence scores from the scanner data.
4. When recent NEWS is provided, reference specific headlines to support your analysis. In portfolio mode, news is tagged with the ticker it affects — use this to flag positions that have negative news catalysts.
5. Keep responses concise but detailed (2-5 paragraphs). Be direct with numbers and specific tickers. When suggesting trades, include entry/target/stop from scanner data.
6. AVAILABLE ACTIONS — If the user requests any of these, include the action tag in your response:
   - Log a trade: [ACTION:ADD_POSITION] TICKER @PRICE xSHARES SIDE (e.g., [ACTION:ADD_POSITION] AAPL @150.00 x100 LONG)
   - Close a trade with exit price: [ACTION:CLOSE_POSITION] TICKER @EXIT_PRICE REASON (e.g., [ACTION:CLOSE_POSITION] AAPL @165.00 target_hit)
   - Update a position (shares, stop, entry): [ACTION:UPDATE_POSITION] TICKER FIELD=VALUE (e.g., [ACTION:UPDATE_POSITION] AAPL shares=50 or [ACTION:UPDATE_POSITION] AAPL entry_price=148.50)
   - Delete/remove a position (mistaken entry): [ACTION:DELETE_POSITION] TICKER (e.g., [ACTION:DELETE_POSITION] AZN.L)
   - Add to watchlist: [ACTION:ADD_WATCHLIST] TICKER (e.g., [ACTION:ADD_WATCHLIST] TSLA)
   - Remove from watchlist: [ACTION:REMOVE_WATCHLIST] TICKER (e.g., [ACTION:REMOVE_WATCHLIST] TSLA)
   - Run scanner on a ticker: [ACTION:RUN_SCAN] TICKER (e.g., [ACTION:RUN_SCAN] NVDA)
   - Run a specialized agent: [ACTION:RUN_AGENT] AGENT_TYPE TICKER (e.g., [ACTION:RUN_AGENT] SANITY_CHECK AAPL or [ACTION:RUN_AGENT] OVERREACTION NVDA or [ACTION:RUN_AGENT] EARNINGS MSFT)
   - Calculate position size: [ACTION:POSITION_SIZE] TICKER @PRICE TARGET=X STOP=X SIGNAL_TYPE (e.g., [ACTION:POSITION_SIZE] AAPL @150.00 TARGET=180.00 STOP=140.00 overreaction)
   IMPORTANT: Use CLOSE_POSITION (not DELETE) when the user wants to exit a trade — this preserves the record with P&L. Use DELETE_POSITION only for mistaken entries.
   IMPORTANT: When the user asks about position sizing, use [ACTION:POSITION_SIZE] to get real calculations from the engine.
7. If the user asks about something not in the provided context, use your knowledge and grounded search to answer.
8. Do NOT add financial disclaimers. Be opinionated and direct — this is a trading intelligence system.
9. At the END of your response, include 2-3 contextual follow-up questions the user might want to ask next, formatted as: [FOLLOWUPS] question1 | question2 | question3
`;

            // Add a placeholder assistant message for streaming
            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: '',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMsg]);

            let messageText = '';
            const streamResult = await GeminiService.generateStream(
                {
                    prompt,
                    requireGroundedSearch: true,
                    temperature: 0.4,
                },
                (chunk: string) => {
                    messageText += chunk;
                    // Update the last assistant message with the streamed content
                    setMessages(prev => {
                        const updated = [...prev];
                        const lastIdx = updated.length - 1;
                        if (lastIdx >= 0 && updated[lastIdx]?.role === 'assistant') {
                            updated[lastIdx] = { ...updated[lastIdx]!, content: messageText };
                        }
                        return updated;
                    });
                },
            );

            if (streamResult.error && !messageText) {
                // Streaming failed entirely — fall back to non-streaming
                const result = await GeminiService.generate<any>({
                    prompt,
                    requireGroundedSearch: true,
                    temperature: 0.4,
                });

                if (!result.success || !result.data) {
                    throw new Error(result.error || 'Failed to generate response');
                }

                if (typeof result.data === 'string') {
                    messageText = result.data;
                } else if (result.data.message) {
                    messageText = result.data.message;
                } else {
                    messageText = JSON.stringify(result.data);
                }

                setMessages(prev => {
                    const updated = [...prev];
                    const lastIdx = updated.length - 1;
                    if (lastIdx >= 0 && updated[lastIdx]?.role === 'assistant') {
                        updated[lastIdx] = { ...updated[lastIdx]!, content: messageText };
                    }
                    return updated;
                });
            }

            // Generate follow-up suggestions based on the response
            setSuggestedFollowups(extractFollowups(messageText));

            // Strip action tags and followup tags from the displayed message for clean UX
            const cleanedText = messageText
                .replace(/\[ACTION:\w+\][^\n]*/g, '')
                .replace(/\[FOLLOWUPS\][^\n]*/g, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
            if (cleanedText !== messageText) {
                setMessages(prev => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg && lastMsg.role === 'assistant') {
                        updated[updated.length - 1] = { ...lastMsg, content: cleanedText };
                    }
                    return updated;
                });
            }

            // Check for action patterns in the response
            try {
                await executeActions(messageText);
            } catch (actionErr: any) {
                console.error('Failed to execute AI action:', actionErr);
            }

            // Trigger conversation summary if history is getting long
            const updatedMessages = [...messages, userMsg, assistantMsg];
            if (updatedMessages.length >= 12 && updatedMessages.length % 4 === 0) {
                // Fire-and-forget: summarize older messages in background
                void (async () => {
                    const summary = await summarizeHistory(updatedMessages);
                    if (summary) setConversationSummary(summary);
                })();
            }

        } catch (err) {
            console.error('Chat error:', err);
            setMessages(prev => [...prev, {
                role: 'system',
                content: 'An unexpected error occurred. Please try again.',
                timestamp: new Date(),
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // ─── Quick Questions (AI-generated) ────────────────────────────────────

    const openPositions = portfolio?.positions.filter(p => p.status === 'open') ?? [];
    const hasPositions = openPositions.length > 0;
    const hasSignals = (portfolio?.activeSignals.length ?? 0) > 0;
    const hasNews = tickerNews.length > 0;

    const [aiQuickQuestions, setAiQuickQuestions] = useState<string[] | null>(null);

    // Generate contextual quick questions via Gemini when portfolio/context loads
    useEffect(() => {
        if (!isOpen || messages.length > 0) return; // Only generate for empty chat
        let cancelled = false;

        async function generateQuickQuestions() {
            // Build a compact context summary for the AI
            const positionsSummary = openPositions.length > 0
                ? openPositions.slice(0, 5).map(p => {
                    const livePrice = positionQuotes[p.ticker];
                    const pnlInfo = livePrice && p.entry_price
                        ? ` (${((livePrice - p.entry_price) / p.entry_price * 100 * (p.side === 'short' ? -1 : 1)).toFixed(1)}%)`
                        : '';
                    return `${p.ticker} ${p.side}${pnlInfo}`;
                }).join(', ')
                : 'none';

            const signalsSummary = (portfolio?.activeSignals || []).slice(0, 3)
                .map(s => `${s.ticker} (${s.confidence_score}/100)`)
                .join(', ') || 'none';

            const newsSnippet = tickerNews.slice(0, 3)
                .map(n => `${n.ticker ? `[${n.ticker}] ` : ''}${n.title}`)
                .join('; ') || 'none';

            try {
                const result = await GeminiService.generate<string>({
                    prompt: `Generate exactly 4 short, actionable trading questions a user would want to ask their AI analyst right now.

Context:
- Active ticker: ${activeTicker || 'none (global mode)'}
- Open positions: ${positionsSummary}
- Active signals: ${signalsSummary}
- Recent news: ${newsSnippet}

Rules:
- Each question must be under 80 characters
- Be specific — reference actual tickers from the context when relevant
- Mix question types: risk, opportunity, portfolio, and market
- If there's an active ticker, 2 questions should be about it
- Return ONLY the 4 questions, one per line, no numbering or bullets`,
                    temperature: 0.7,
                    model: GEMINI_MODEL_LITE, // Use lite model for speed
                });

                if (!cancelled && result.success && result.data) {
                    const text = typeof result.data === 'string' ? result.data : '';
                    const questions = text.split('\n')
                        .map((q: string) => q.replace(/^\d+[.)]\s*/, '').replace(/^[-•]\s*/, '').trim())
                        .filter((q: string) => q.length > 10 && q.length < 100)
                        .slice(0, 4);
                    if (questions.length >= 2) {
                        setAiQuickQuestions(questions);
                    }
                }
            } catch {
                // Silently fall back to hardcoded questions
            }
        }

        // Small delay to avoid competing with other context fetches
        const timer = setTimeout(generateQuickQuestions, 800);
        return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, activeTicker, portfolio, tickerNews.length, messages.length]);

    // Fallback hardcoded questions (used while AI generates or if it fails)
    const fallbackQuestions = activeTicker ? [
        `What's the bull case for ${ticker}?`,
        ...(hasNews ? [`What's the latest news saying about ${ticker}?`] : []),
        `What are the biggest risks for ${ticker}?`,
        `Should I add to my ${ticker} position or trim?`,
    ].slice(0, 4) : [
        ...(hasPositions ? [
            'Am I over-exposed to any single sector right now?',
            'Which of my positions has the worst risk/reward?',
        ] : []),
        ...(hasSignals ? [
            'What are the highest conviction signals I should act on?',
        ] : [
            'What sectors are showing the most opportunity right now?',
        ]),
        'Give me a portfolio health check.',
    ].slice(0, 4);

    const quickQuestions = aiQuickQuestions || fallbackQuestions;

    const availableCommands = [
        { cmd: '/screen', desc: 'Run a custom market screen', usage: '/screen ' },
        { cmd: '/compare', desc: 'Compare active ticker with another', usage: '/compare ' },
        { cmd: '/risk', desc: 'Get a quick risk summary', usage: '/risk' },
        { cmd: '/portfolio', desc: 'Show portfolio snapshot', usage: '/portfolio' },
        { cmd: '/help', desc: 'Show available commands', usage: '/help' },
        { cmd: '/clear', desc: 'Clear the chat history', usage: '/clear' },
    ];

    const showCommandPalette = input.startsWith('/');
    const filteredCommands = availableCommands.filter(c => c.cmd.startsWith(input.split(' ')[0] || '/'));

    // ─── Render ──────────────────────────────────────────────────────────────

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {/* Floating Toggle Button */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsOpen(true)}
                        className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25 flex items-center justify-center cursor-pointer border-none outline-none"
                        title="Ask the AI Analyst"
                    >
                        <Sparkles className="w-6 h-6" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Chat Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className={`w-[420px] h-[560px] bg-sentinel-950 rounded-2xl border ${isDragging ? 'border-blue-500 ring-2 ring-blue-500/50' : 'border-sentinel-800/60'} shadow-2xl shadow-black/50 flex flex-col overflow-hidden backdrop-blur-xl relative`}
                    >
                        {/* Drag Overlay */}
                        <AnimatePresence>
                            {isDragging && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 bg-sentinel-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center border-2 border-dashed border-blue-500/50 rounded-2xl"
                                >
                                    <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mb-4">
                                        <Bot className="w-8 h-8 text-blue-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-sentinel-100">Drop Ticker Here</h3>
                                    <p className="text-sm text-sentinel-400 mt-2">to run a deep-dive analysis</p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-800/50 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center ring-1 ring-blue-500/20">
                                    <Bot className="w-4 h-4 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-sentinel-100">AI Analyst</h3>
                                    <p className="text-[10px] text-sentinel-500 font-mono">
                                        {activeTicker ? `${ticker} + Portfolio` : 'Portfolio Mode'}
                                        {portfolioLoading ? ' (loading...)' : ''}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-sentinel-400 hover:text-sentinel-200 hover:bg-sentinel-800 transition-colors cursor-pointer border-none outline-none"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {messages.length === 0 && (
                                <div className="text-center py-6 space-y-4">
                                    <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto ring-1 ring-blue-500/20">
                                        <MessageSquare className="w-6 h-6 text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-sentinel-300 font-medium">
                                            {activeTicker ? `Ask about ${ticker} or your portfolio` : 'Ask about your portfolio or the market'}
                                        </p>
                                        <p className="text-xs text-sentinel-500 mt-1">
                                            {hasPositions
                                                ? 'I can see your positions, exposure, signals, and sector allocation.'
                                                : 'I can help you screen stocks, find opportunities, and analyze the market.'}
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        {quickQuestions.map((q, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { setInput(q); }}
                                                className="block w-full text-left px-3 py-2 text-xs text-sentinel-400 hover:text-sentinel-200 bg-sentinel-900/50 hover:bg-sentinel-800/50 rounded-lg transition-colors cursor-pointer border border-sentinel-800/30 hover:border-sentinel-700/50"
                                            >
                                                {q}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, i) => (
                                <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center shrink-0 mt-0.5 ring-1 ring-blue-500/20">
                                            <Bot className="w-3.5 h-3.5 text-blue-400" />
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${msg.role === 'user'
                                        ? 'bg-blue-600/20 text-sentinel-100 rounded-br-sm border border-blue-500/20'
                                        : msg.role === 'system'
                                            ? 'bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20 text-xs flex items-center gap-2'
                                            : 'bg-sentinel-900/80 text-sentinel-200 rounded-bl-sm border border-sentinel-800/50'
                                        }`}
                                        style={{ whiteSpace: 'pre-wrap' }}
                                    >
                                        {msg.role === 'system' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                        {msg.content}
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-6 h-6 rounded-md bg-sentinel-700 flex items-center justify-center shrink-0 mt-0.5">
                                            <User className="w-3.5 h-3.5 text-sentinel-300" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Follow-up suggestions */}
                            {!isLoading && suggestedFollowups.length > 0 && messages.length > 0 && (
                                <div className="space-y-1.5 pl-8">
                                    <span className="text-[10px] text-sentinel-600 uppercase tracking-wider font-mono">Follow up</span>
                                    {suggestedFollowups.map((q, i) => (
                                        <button
                                            key={i}
                                            onClick={() => { setInput(q); setSuggestedFollowups([]); setTimeout(() => inputRef.current?.focus(), 50); }}
                                            className="block w-full text-left px-2.5 py-1.5 text-[11px] text-sentinel-400 hover:text-sentinel-200 bg-sentinel-900/30 hover:bg-sentinel-800/50 rounded-lg transition-colors cursor-pointer border border-sentinel-800/20 hover:border-blue-500/20"
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {isLoading && (
                                <div className="flex gap-2.5">
                                    <div className="w-6 h-6 rounded-md bg-blue-500/15 flex items-center justify-center shrink-0 ring-1 ring-blue-500/20">
                                        <Bot className="w-3.5 h-3.5 text-blue-400" />
                                    </div>
                                    <div className="bg-sentinel-900/80 border border-sentinel-800/50 px-4 py-3 rounded-xl rounded-bl-sm">
                                        <div className="flex items-center gap-2 text-sentinel-400 text-sm">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Analyzing...
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="p-3 border-t border-sentinel-800/50 bg-sentinel-950/80 relative">
                            {/* Command Palette */}
                            <AnimatePresence>
                                {showCommandPalette && filteredCommands.length > 0 && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 10 }}
                                        className="absolute bottom-[100%] left-3 right-3 mb-2 bg-sentinel-900 border border-sentinel-700/50 rounded-xl shadow-xl overflow-hidden z-10"
                                    >
                                        {filteredCommands.map(c => (
                                            <button
                                                key={c.cmd}
                                                onClick={() => {
                                                    setInput(c.usage);
                                                    inputRef.current?.focus();
                                                }}
                                                className="w-full text-left px-4 py-2.5 hover:bg-sentinel-800 transition-colors border-b border-sentinel-800/50 last:border-0 flex justify-between items-center cursor-pointer"
                                            >
                                                <div className="font-mono text-blue-400 text-sm font-bold">{c.cmd}</div>
                                                <div className="text-xs text-sentinel-500">{c.desc}</div>
                                            </button>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <div className="flex items-center gap-2 bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 px-3 py-2 focus-within:border-blue-500/40 transition-colors relative z-20">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={activeTicker ? `Ask about ${ticker} or your portfolio...` : 'Ask about your portfolio or the market...'}
                                    disabled={isLoading}
                                    className="flex-1 bg-transparent text-sm text-sentinel-100 placeholder-sentinel-500 border-none outline-none"
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!input.trim() || isLoading}
                                    className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-sentinel-700 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors cursor-pointer border-none outline-none"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </div>
                            {activeTicker && !hasLoadedContext && isOpen && (
                                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-sentinel-500">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Fetching latest context for {activeTicker}...
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
