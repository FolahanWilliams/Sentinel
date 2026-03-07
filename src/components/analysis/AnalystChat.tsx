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
import { supabase } from '@/config/supabase';
import { useChat } from '@/contexts/ChatContext';
import { MarketDataService } from '@/services/marketData';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { formatPrice } from '@/utils/formatters';
import { inferCurrency, getPositionExposure } from '@/utils/portfolio';
import type { Position, PortfolioConfig } from '@/hooks/usePortfolio';

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

                const { data: signal } = await supabase
                    .from('signals')
                    .select('agent_outputs')
                    .eq('ticker', activeTicker)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                if (isMounted) {
                    const agentOutputs = signal?.agent_outputs as any;
                    setTickerAnalysis({
                        events,
                        fundamentals: agentOutputs?.overreaction?.fundamentals || {},
                        biasWeights: agentOutputs?.overreaction?.biasWeights || {}
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

    const [messages, setMessages] = useState<ChatMessage[]>(() => {
        try {
            const stored = sessionStorage.getItem(`sentinel_chat_${ticker}`);
            if (stored) {
                const parsed = JSON.parse(stored);
                return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
            }
        } catch { /* ignore */ }
        return [];
    });
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
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

    // Persist messages to sessionStorage (cap at 50 messages to prevent quota overflow)
    useEffect(() => {
        if (messages.length > 0) {
            try {
                const toStore = messages.slice(-50); // Keep last 50 messages max
                sessionStorage.setItem(`sentinel_chat_${ticker}`, JSON.stringify(toStore));
            } catch {
                // Quota exceeded — clear oldest chat caches to make room
                try {
                    for (let i = 0; i < sessionStorage.length; i++) {
                        const key = sessionStorage.key(i);
                        if (key?.startsWith('sentinel_chat_') && key !== `sentinel_chat_${ticker}`) {
                            sessionStorage.removeItem(key);
                            break; // Remove one at a time
                        }
                    }
                } catch { /* give up */ }
            }
        }
    }, [messages, ticker]);

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

        // Open positions with exposure
        if (openPositions.length > 0) {
            let totalExposure = 0;

            parts.push(`\nOPEN POSITIONS (${openPositions.length}):`);
            for (const pos of openPositions) {
                const size = getPositionExposure(pos);
                totalExposure += size;
                const currency = inferCurrency(pos.ticker);
                const pct = totalCapital > 0 ? (size / totalCapital * 100) : 0;
                const sector = sectorMap[pos.ticker] || sectorMap[pos.ticker.replace('.L', '')] || 'Unknown';

                // Approximate P&L using entry price (no live quotes in this context)
                const entryPrice = pos.entry_price ?? 0;
                const shares = pos.shares ?? 0;

                parts.push(`  ${pos.ticker} | ${pos.side.toUpperCase()} | ${shares} shares @ ${formatPrice(entryPrice, currency)} | Size: ${formatPrice(size, currency)} (${pct.toFixed(1)}%) | Sector: ${sector}`);
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
    }, [portfolio]);

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
            parts.push(`\nBIAS ANALYSIS:`);
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
                    case '/screen':
                        systemResponse = `**Screening command recognized:** Searching for \`${args || 'general setups'}\`...\n\n*Note: In a full production environment, this would trigger the backend scanner with specific filter criteria and return the top results directly in this chat.*`;
                        break;
                    case '/compare':
                        if (!args) {
                            systemResponse = `**Usage:** \`/compare TICKER\`\nExample: \`/compare MSFT\` to compare ${ticker} with MSFT.`;
                        } else {
                            systemResponse = `**Comparison command recognized:** Comparing ${ticker} vs \`${args.toUpperCase()}\`...\n\n*Note: This would fetch fundamental and technical data for both assets and provide a side-by-side Gemini analysis.*`;
                        }
                        break;
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

            // Build conversation history for context
            const historyBlock = messages.slice(-6).map(m =>
                `${m.role === 'user' ? 'USER' : (m.role === 'assistant' ? 'ANALYST' : 'SYSTEM')}: ${m.content}`
            ).join('\n');

            const prompt = `
You are Sentinel's AI Trading Analyst. You have FULL access to the user's live portfolio data and active trading signals.
${activeTicker ? `The user is currently viewing ${ticker}.` : 'The user is in global market mode.'}

${portfolioContext}

${tickerContext}

${historyBlock ? `CONVERSATION HISTORY:\n${historyBlock}\n` : ''}
USER'S QUESTION: ${trimmed}

INSTRUCTIONS:
1. You have the user's COMPLETE portfolio state above — positions, sector allocation, exposure limits, P&L, and active signals. Use this data to give specific, quantitative answers.
2. When asked about exposure, concentration, or risk — reference their ACTUAL numbers (sector %, position sizes, limit breaches).
3. When asked about rotation opportunities or high-conviction finds — reference their ACTIVE SIGNALS with confidence scores and theses. Also use your grounded search capability to find current market opportunities.
4. Keep responses concise (2-4 paragraphs). Be direct with numbers and specific tickers.
5. If the user explicitly asks to log a trade, extract the details and include them in your response with the prefix "[ACTION:ADD_POSITION]" followed by ticker, price, shares, side.
6. If the user asks about something not in the provided context, use your knowledge and grounded search to answer.
7. Do NOT add financial disclaimers. Be opinionated and direct — this is a trading intelligence system.
`;

            const result = await GeminiService.generate<any>({
                prompt,
                requireGroundedSearch: true,
                temperature: 0.4,
            });

            if (!result.success || !result.data) {
                throw new Error(result.error || 'Failed to generate response');
            }

            // With grounded search + no responseSchema, result.data is the raw text string
            let messageText: string;
            if (typeof result.data === 'string') {
                messageText = result.data;
            } else if (result.data.message) {
                messageText = result.data.message;
            } else {
                messageText = JSON.stringify(result.data);
            }

            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: messageText,
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMsg]);

            // Check for action patterns in the response
            if (messageText.includes('[ACTION:ADD_POSITION]')) {
                try {
                    const actionMatch = messageText.match(/\[ACTION:ADD_POSITION\]\s*(\w+)\s*@?\s*\$?([\d.]+)\s*x?\s*(\d+)?\s*(LONG|SHORT)?/i);
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
                } catch (actionErr: any) {
                    console.error('Failed to execute AI action:', actionErr);
                }
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

    // ─── Quick Questions (portfolio-aware) ───────────────────────────────────

    const hasPositions = (portfolio?.positions.filter(p => p.status === 'open').length ?? 0) > 0;
    const hasSignals = (portfolio?.activeSignals.length ?? 0) > 0;

    const quickQuestions = activeTicker ? [
        `What's the bull case for ${ticker}?`,
        `Am I already overexposed to ${ticker}'s sector?`,
        `What are the biggest risks for ${ticker}?`,
        `Should I add to my ${ticker} position or trim?`,
    ] : [
        ...(hasPositions ? [
            'Am I over-exposed to any single sector right now?',
            'Which of my positions has the worst risk/reward?',
        ] : []),
        ...(hasSignals ? [
            'What are the highest conviction signals I should act on?',
            'Where should I rotate my capital based on active signals?',
        ] : [
            'What sectors are showing the most opportunity right now?',
            'Find me high-conviction setups in the current market.',
        ]),
        ...(hasPositions ? [
            'Give me a portfolio health check — concentration, risk, and suggestions.',
        ] : []),
        ...(!hasPositions && !hasSignals ? [
            'What is the overall market sentiment today?',
            'Which sectors are showing extreme overreaction?',
        ] : []),
    ].slice(0, 4);

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
