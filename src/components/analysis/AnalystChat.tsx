/**
 * AnalystChat — Floating conversational AI panel for the Research page.
 *
 * Injects the current ticker's full context (bias, fundamentals, news, signals)
 * into every Gemini prompt so the user can interrogate the AI's logic.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Loader2, Sparkles, Bot, User, CheckCircle2 } from 'lucide-react';
import { GeminiService } from '@/services/gemini';
import { supabase } from '@/config/supabase';

// Schema for the chatbot response
export const ChatbotResponseSchema = {
    type: "object",
    properties: {
        message: {
            type: "string",
            description: "The conversational response to the user."
        },
        action: {
            type: "object",
            description: "Optional action to perform based on the user's intent. Only include if the user EXPLICITLY asks to add a position or journal entry.",
            nullable: true,
            properties: {
                type: {
                    type: "string",
                    enum: ["add_position", "add_journal_entry"]
                },
                payload: {
                    type: "object",
                    description: "The data required for the action.",
                    properties: {
                        ticker: { type: "string" },
                        entry_price: { type: "number" },
                        shares: { type: "number" },
                        side: { type: "string", enum: ["LONG", "SHORT"] },
                        content: { type: "string" },
                        entry_type: { type: "string", enum: ["TRADE_REVIEW", "MARKET_OBSERVATION", "STRATEGY_NOTE"] },
                        mood: { type: "string", enum: ["NEUTRAL", "CONFIDENT", "UNCERTAIN", "FRUSTRATED"] },
                        tags: { type: "array", items: { type: "string" } }
                    }
                }
            },
            required: ["type", "payload"]
        }
    },
    required: ["message"]
};

interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
}

interface AnalystChatProps {
    ticker: string;
    tickerAnalysis: any;
    quote: any;
}

export function AnalystChat({ ticker, tickerAnalysis, quote }: AnalystChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Focus input when chat opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Build rich context string from current page state
    const buildContext = useCallback(() => {
        const parts: string[] = [];

        parts.push(`TICKER: ${ticker}`);

        if (quote) {
            parts.push(`CURRENT PRICE: $${quote.price?.toFixed(2)} | CHANGE: ${quote.changePercent?.toFixed(2)}%`);
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

        return parts.join('\n');
    }, [ticker, tickerAnalysis, quote]);

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isLoading) return;

        const userMsg: ChatMessage = { role: 'user', content: trimmed, timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const context = buildContext();

            // Build conversation history for context
            const historyBlock = messages.slice(-6).map(m =>
                `${m.role === 'user' ? 'USER' : (m.role === 'assistant' ? 'ANALYST' : 'SYSTEM')}: ${m.content}`
            ).join('\n');

            const prompt = `
You are Sentinel's AI Stock Analyst. You are helping the user analyze ${ticker}.

CURRENT MARKET CONTEXT:
${context}

${historyBlock ? `CONVERSATION HISTORY:\n${historyBlock}\n` : ''}
USER'S QUESTION: ${trimmed}

INSTRUCTIONS:
1. Respond conversationally but with precision. Reference specific data points from the context above when relevant. 
2. Keep responses concise (2-4 paragraphs max). If the user asks about something not in the context, say so honestly.
3. If the user explicitly asks to log a trade (e.g., "I bought NVDA at 120", "Add my TSLA short to positions"), extract the details (ticker, price, shares, side) and include an \`action\` of type \`add_position\`. Default to LONG side and 100 shares if unspecified unless the context implies otherwise.
4. If the user explicitly asks to add a journal entry or note, include an \`action\` of type \`add_journal_entry\` with a summarized \`content\` and appropriate tags.
`;

            const result = await GeminiService.generate<any>({
                prompt,
                requireGroundedSearch: true,
                responseSchema: ChatbotResponseSchema
            });

            if (!result.success || !result.data) {
                throw new Error('Failed to generate response');
            }

            const parsed = result.data;

            const assistantMsg: ChatMessage = {
                role: 'assistant',
                content: parsed.message || 'Done.',
                timestamp: new Date(),
            };
            setMessages(prev => [...prev, assistantMsg]);

            // Execute the action if present
            if (parsed.action && parsed.action.type) {
                try {
                    const actionType = parsed.action.type;
                    const payload = parsed.action.payload || {};
                    let successMsg = '';

                    if (actionType === 'add_position') {
                        const targetTicker = (payload.ticker || ticker).toUpperCase();
                        await supabase.from('positions').insert({
                            ticker: targetTicker,
                            entry_price: typeof payload.entry_price === 'number' ? payload.entry_price : null,
                            shares: typeof payload.shares === 'number' ? payload.shares : 100,
                            side: payload.side === 'SHORT' ? 'SHORT' : 'LONG',
                            status: 'OPEN',
                            opened_at: new Date().toISOString()
                        });
                        successMsg = `Successfully added ${targetTicker} to your open positions.`;
                    }
                    else if (actionType === 'add_journal_entry') {
                        const targetTicker = (payload.ticker || ticker).toUpperCase();
                        await supabase.from('journal_entries').insert({
                            ticker: targetTicker,
                            content: payload.content || 'Added via AI Assistant',
                            entry_type: payload.entry_type || 'MARKET_OBSERVATION',
                            mood: payload.mood || 'NEUTRAL',
                            tags: Array.isArray(payload.tags) ? payload.tags : ['ai_note']
                        });
                        successMsg = `Successfully saved journal entry for ${targetTicker}.`;
                    }

                    if (successMsg) {
                        setMessages(prev => [...prev, {
                            role: 'system',
                            content: successMsg,
                            timestamp: new Date(),
                        }]);
                    }
                } catch (actionErr: any) {
                    console.error('Failed to execute AI action:', actionErr);
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `Failed to execute action: ${actionErr.message}`,
                        timestamp: new Date(),
                    }]);
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

    const quickQuestions = [
        `What's the bull case for ${ticker}?`,
        `Why is the bias ${tickerAnalysis?.biasWeights?.overall_bias || 'unknown'}?`,
        `What are the biggest risks?`,
        `Should I buy at this price?`,
    ];

    return (
        <>
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
                        className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25 flex items-center justify-center cursor-pointer border-none outline-none"
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
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="fixed bottom-6 right-6 z-50 w-[420px] h-[560px] bg-sentinel-950 rounded-2xl border border-sentinel-800/60 shadow-2xl shadow-black/50 flex flex-col overflow-hidden backdrop-blur-xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-sentinel-800/50 bg-gradient-to-r from-blue-600/10 to-purple-600/10">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center ring-1 ring-blue-500/20">
                                    <Bot className="w-4 h-4 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-semibold text-sentinel-100">AI Analyst</h3>
                                    <p className="text-[10px] text-sentinel-500 font-mono">{ticker} Context Active</p>
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
                                        <p className="text-sm text-sentinel-300 font-medium">Ask me anything about {ticker}</p>
                                        <p className="text-xs text-sentinel-500 mt-1">I have full context on the current analysis, fundamentals, and recent events.</p>
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
                        <div className="p-3 border-t border-sentinel-800/50 bg-sentinel-950/80">
                            <div className="flex items-center gap-2 bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 px-3 py-2 focus-within:border-blue-500/40 transition-colors">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={`Ask about ${ticker}...`}
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
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
