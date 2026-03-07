import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';
import { CACHE_TTL_MARKET_SNAPSHOT, CACHE_TTL_AI_CONTENT, FEAR_GREED_BEARISH_THRESHOLD, FEAR_GREED_BULLISH_THRESHOLD } from '@/config/constants';

interface TickerData {
    price: number;
    changePercent: number;
    change: number;
}

export interface MarketSnapshotData {
    headline: string;
    description: string;
    fearGreedValue: number;
    fearGreedLabel: string;
    tickers: {
        vix: TickerData;
        sp500: TickerData;
        nasdaq: TickerData;
        dji: TickerData;
        btc: TickerData;
        gold: TickerData;
        oil: TickerData;
        tnx: TickerData;
    };
    summaryBullets: { color: string; text: string }[];
    lastUpdated: string;
}

const CACHE_KEY = 'sentinel_market_snapshot_v2';
const AI_CACHE_KEY = 'sentinel_market_ai_v1';
const CACHE_TTL_MS = CACHE_TTL_MARKET_SNAPSHOT;
const AI_CACHE_TTL_MS = CACHE_TTL_AI_CONTENT;

function getCached(): MarketSnapshotData | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    } catch { /* ignore */ }
    return null;
}

function setCache(data: MarketSnapshotData) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch { /* ignore */ }
}

// Separate cache for AI-generated content (headline, Fear & Greed, bullets)
// to prevent hallucination flicker — these change less often than quotes
interface AiContent {
    headline: string;
    description: string;
    fearGreedValue: number;
    fearGreedLabel: string;
    summaryBullets: { color: string; text: string }[];
}

function getCachedAi(): AiContent | null {
    try {
        const raw = sessionStorage.getItem(AI_CACHE_KEY);
        if (!raw) return null;
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp < AI_CACHE_TTL_MS) return data;
    } catch { /* ignore */ }
    return null;
}

function setCachedAi(data: AiContent) {
    try {
        sessionStorage.setItem(AI_CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch { /* ignore */ }
}

const EMPTY_TICKER: TickerData = { price: 0, changePercent: 0, change: 0 };

export function useMarketSnapshot() {
    const [data, setData] = useState<MarketSnapshotData | null>(getCached());
    const [loading, setLoading] = useState(!getCached());
    const [error, setError] = useState<string | null>(null);

    const fetch_ = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            let fearGreedValue = 50;
            let fearGreedLabel = 'Neutral';

            // --- 1. Fetch ticker quotes via existing proxy ---
            const tickerMap = [
                { key: 'vix', symbol: '^VIX' },
                { key: 'sp500', symbol: '^GSPC' },
                { key: 'nasdaq', symbol: '^IXIC' },
                { key: 'dji', symbol: '^DJI' },
                { key: 'btc', symbol: 'BTC-USD' },
                { key: 'gold', symbol: 'GC=F' },
                { key: 'oil', symbol: 'CL=F' },
                { key: 'tnx', symbol: '^TNX' },
            ] as const;

            const tickerResults: Record<string, TickerData> = {};
            for (const t of tickerMap) {
                tickerResults[t.key] = { ...EMPTY_TICKER };
            }

            const quoteResults = await Promise.allSettled(
                tickerMap.map(t => MarketDataService.getQuote(t.symbol))
            );

            quoteResults.forEach((result, i) => {
                if (result.status === 'fulfilled') {
                    const q = result.value;
                    const t = tickerMap[i];
                    if (t) {
                        tickerResults[t.key] = {
                            price: Number(q.price || 0),
                            changePercent: Number(q.changePercent || 0),
                            change: Number(q.change || 0),
                        };
                    }
                }
            });

            const vix = tickerResults.vix ?? EMPTY_TICKER;
            const sp500 = tickerResults.sp500 ?? EMPTY_TICKER;
            const nasdaq = tickerResults.nasdaq ?? EMPTY_TICKER;
            const dji = tickerResults.dji ?? EMPTY_TICKER;
            const btc = tickerResults.btc ?? EMPTY_TICKER;
            const gold = tickerResults.gold ?? EMPTY_TICKER;
            const oil = tickerResults.oil ?? EMPTY_TICKER;
            const tnx = tickerResults.tnx ?? EMPTY_TICKER;

            // --- 2. Generate AI headline, summary, and get CNN Fear & Greed via Gemini ---
            // Use cached AI content if available (30-min TTL) to prevent hallucination flicker
            let headline = 'Markets in Motion';
            let description = 'Loading market intelligence...';
            let summaryBullets: { color: string; text: string }[] = [];
            const cachedAi = getCachedAi();

            if (cachedAi) {
                headline = cachedAi.headline;
                description = cachedAi.description;
                fearGreedValue = cachedAi.fearGreedValue;
                fearGreedLabel = cachedAi.fearGreedLabel;
                summaryBullets = cachedAi.summaryBullets;
            }

            // Only call Gemini if no cached AI content
            if (!cachedAi) {
                try {
                    // Timeout protection: abort if Gemini takes longer than 50s
                    const geminiController = new AbortController();
                    const geminiTimeout = setTimeout(() => geminiController.abort(), 50_000);
                    const { data: geminiRes, error: geminiErr } = await supabase.functions.invoke('proxy-gemini', {
                        body: {
                            systemInstruction: `You are a concise financial market analyst. Today is ${new Date().toISOString().split('T')[0]}. The current market data is: VIX=${Number(vix.price).toFixed(2)} (${vix.changePercent > 0 ? '+' : ''}${Number(vix.changePercent).toFixed(2)}%), S&P 500=${Number(sp500.price).toFixed(2)} (${sp500.changePercent > 0 ? '+' : ''}${Number(sp500.changePercent).toFixed(2)}%), NASDAQ=${Number(nasdaq.price).toFixed(2)} (${nasdaq.changePercent > 0 ? '+' : ''}${Number(nasdaq.changePercent).toFixed(2)}%), DJI=${Number(dji.price).toFixed(2)} (${dji.changePercent > 0 ? '+' : ''}${Number(dji.changePercent).toFixed(2)}%), Bitcoin=${Number(btc.price).toFixed(0)} (${btc.changePercent > 0 ? '+' : ''}${Number(btc.changePercent).toFixed(2)}%), Gold=${Number(gold.price).toFixed(2)} (${gold.changePercent > 0 ? '+' : ''}${Number(gold.changePercent).toFixed(2)}%), Oil=${Number(oil.price).toFixed(2)} (${oil.changePercent > 0 ? '+' : ''}${Number(oil.changePercent).toFixed(2)}%), 10Y Yield=${Number(tnx.price).toFixed(2)}%.`,
                            prompt: 'Generate a market snapshot for a trading intelligence dashboard. Look up the current CNN stock market Fear & Greed Index value (0-100) and classification (e.g. Extreme Greed, Neutral). Return JSON only.',
                            requireGroundedSearch: true,
                            responseSchema: {
                                type: 'object',
                                properties: {
                                    headline: { type: 'string', description: 'Short punchy headline about today\'s market theme (max 10 words)' },
                                    description: { type: 'string', description: 'One paragraph summary of today\'s market conditions (2-3 sentences)' },
                                    fearGreedValue: { type: 'number', description: 'Current CNN Fear & Greed Index value (0-100)' },
                                    fearGreedLabel: { type: 'string', description: 'Current CNN Fear & Greed Index classification (e.g., Extreme Fear, Fear, Neutral, Greed, Extreme Greed)' },
                                    summaryBullets: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                color: { type: 'string', enum: ['red', 'blue', 'green', 'amber', 'gray'], description: 'Sentiment color' },
                                                text: { type: 'string', description: 'One-line market observation' }
                                            },
                                            required: ['color', 'text']
                                        },
                                        description: '5 key market observations'
                                    }
                                },
                                required: ['headline', 'description', 'fearGreedValue', 'fearGreedLabel', 'summaryBullets']
                            }
                        }
                    });

                    clearTimeout(geminiTimeout);

                    if (!geminiErr && geminiRes?.text) {
                        // Strip markdown code fences — grounded search skips responseSchema,
                        // so Gemini may wrap JSON in ```json ... ```
                        const cleanText = geminiRes.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                        const parsed = JSON.parse(cleanText);
                        headline = parsed.headline || headline;
                        description = parsed.description || description;
                        if (parsed.fearGreedValue !== undefined) fearGreedValue = parsed.fearGreedValue;
                        if (parsed.fearGreedLabel) fearGreedLabel = parsed.fearGreedLabel;
                        summaryBullets = (parsed.summaryBullets || []).map((b: any) => ({
                            color: `text-${b.color === 'gray' ? 'sentinel' : b.color}-400`,
                            text: b.text
                        }));
                        // Cache AI content separately with longer TTL to prevent flicker
                        setCachedAi({ headline, description, fearGreedValue, fearGreedLabel, summaryBullets });
                    }
                } catch (e) {
                    console.warn('[useMarketSnapshot] Gemini headline generation failed', e);
                }
            } // end if (!cachedAi)

            // If Gemini didn't produce bullets, make simple fallback
            if (summaryBullets.length === 0) {
                summaryBullets = [
                    { color: 'text-sentinel-400', text: `VIX at ${Number(vix.price).toFixed(2)} (${Number(vix.changePercent).toFixed(2)}%)` },
                    { color: Number(sp500.changePercent) >= 0 ? 'text-emerald-400' : 'text-red-400', text: `S&P 500 ${Number(sp500.changePercent) >= 0 ? 'up' : 'down'} ${Math.abs(Number(sp500.changePercent)).toFixed(2)}%` },
                    { color: Number(btc.changePercent) >= 0 ? 'text-emerald-400' : 'text-red-400', text: `Bitcoin ${Number(btc.changePercent) >= 0 ? 'up' : 'down'} ${Math.abs(Number(btc.changePercent)).toFixed(2)}%` },
                    { color: fearGreedValue < FEAR_GREED_BEARISH_THRESHOLD ? 'text-red-400' : fearGreedValue > FEAR_GREED_BULLISH_THRESHOLD ? 'text-emerald-400' : 'text-amber-400', text: `Market sentiment: ${fearGreedLabel} (${fearGreedValue})` },
                ];
            }

            const snapshot: MarketSnapshotData = {
                headline,
                description,
                fearGreedValue,
                fearGreedLabel,
                tickers: { vix, sp500, nasdaq, dji, btc, gold, oil, tnx },
                summaryBullets,
                lastUpdated: new Date().toISOString(),
            };

            setData(snapshot);
            setCache(snapshot);
        } catch (err: any) {
            setError(err.message);
            console.error('[useMarketSnapshot] Error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { data, loading, error, refetch: fetch_ };
}
