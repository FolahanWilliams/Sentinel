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
const AI_CACHE_KEY = 'sentinel_market_ai_v2';
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

// Separate cache for AI-generated content (headline + bullets only — F&G now from CNN)
interface AiContent {
    headline: string;
    description: string;
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
            // --- 1. Fetch ticker quotes + CNN Fear & Greed in parallel ---
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

            // Fetch all ticker quotes in a single bulk request instead of 8 serial calls
            const symbols = tickerMap.map(t => t.symbol);
            const bulkQuotes = await MarketDataService.getQuotesBulk(symbols as unknown as string[]);

            for (const t of tickerMap) {
                const q = bulkQuotes[t.symbol];
                if (q) {
                    tickerResults[t.key] = {
                        price: Number(q.price || 0),
                        changePercent: Number(q.changePercent || 0),
                        change: Number(q.change || 0),
                    };
                }
            }

            const vix = tickerResults.vix ?? EMPTY_TICKER;
            const sp500 = tickerResults.sp500 ?? EMPTY_TICKER;
            const nasdaq = tickerResults.nasdaq ?? EMPTY_TICKER;
            const dji = tickerResults.dji ?? EMPTY_TICKER;
            const btc = tickerResults.btc ?? EMPTY_TICKER;
            const gold = tickerResults.gold ?? EMPTY_TICKER;
            const oil = tickerResults.oil ?? EMPTY_TICKER;
            const tnx = tickerResults.tnx ?? EMPTY_TICKER;

            // --- 2. Read Fear & Greed from useFearGreed's cache (avoids duplicate API call) ---
            let fearGreedValue = 50;
            let fearGreedLabel = 'Neutral';
            try {
                const fgCacheRaw = sessionStorage.getItem('sentinel_fear_greed_v1');
                if (fgCacheRaw) {
                    const { data: fgCached } = JSON.parse(fgCacheRaw);
                    if (fgCached && typeof fgCached.score === 'number') {
                        fearGreedValue = Math.round(fgCached.score);
                        fearGreedLabel = fgCached.rating || 'Neutral';
                    }
                }
            } catch { /* ignore */ }

            // --- 3. Generate AI headline + summary (no longer needs grounded search for F&G) ---
            let headline = 'Markets in Motion';
            let description = 'Loading market intelligence...';
            let summaryBullets: { color: string; text: string }[] = [];
            const cachedAi = getCachedAi();

            if (cachedAi) {
                headline = cachedAi.headline;
                description = cachedAi.description;
                summaryBullets = cachedAi.summaryBullets;
            }

            // Only call Gemini if no cached AI content
            if (!cachedAi) {
                try {
                    const { data: geminiRes, error: geminiErr } = await supabase.functions.invoke('proxy-gemini', {
                        body: {
                            systemInstruction: `You are a concise financial market analyst. Today is ${new Date().toISOString().split('T')[0]}. The current market data is: VIX=${Number(vix.price).toFixed(2)} (${vix.changePercent > 0 ? '+' : ''}${Number(vix.changePercent).toFixed(2)}%), S&P 500=${Number(sp500.price).toFixed(2)} (${sp500.changePercent > 0 ? '+' : ''}${Number(sp500.changePercent).toFixed(2)}%), NASDAQ=${Number(nasdaq.price).toFixed(2)} (${nasdaq.changePercent > 0 ? '+' : ''}${Number(nasdaq.changePercent).toFixed(2)}%), DJI=${Number(dji.price).toFixed(2)} (${dji.changePercent > 0 ? '+' : ''}${Number(dji.changePercent).toFixed(2)}%), Bitcoin=${Number(btc.price).toFixed(0)} (${btc.changePercent > 0 ? '+' : ''}${Number(btc.changePercent).toFixed(2)}%), Gold=${Number(gold.price).toFixed(2)} (${gold.changePercent > 0 ? '+' : ''}${Number(gold.changePercent).toFixed(2)}%), Oil=${Number(oil.price).toFixed(2)} (${oil.changePercent > 0 ? '+' : ''}${Number(oil.changePercent).toFixed(2)}%), 10Y Yield=${Number(tnx.price).toFixed(2)}%. CNN Fear & Greed Index: ${fearGreedValue} (${fearGreedLabel}).`,
                            prompt: 'Generate a market snapshot for a trading intelligence dashboard. The Fear & Greed data is already provided — use it in your analysis. Return JSON only.',
                            responseSchema: {
                                type: 'object',
                                properties: {
                                    headline: { type: 'string', description: 'Short punchy headline about today\'s market theme (max 10 words)' },
                                    description: { type: 'string', description: 'One paragraph summary of today\'s market conditions (2-3 sentences)' },
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
                                required: ['headline', 'description', 'summaryBullets']
                            }
                        }
                    });

                    if (!geminiErr && geminiRes?.text) {
                        const cleanText = geminiRes.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                        const parsed = JSON.parse(cleanText);
                        headline = parsed.headline || headline;
                        description = parsed.description || description;
                        summaryBullets = (parsed.summaryBullets || []).map((b: any) => ({
                            color: `text-${b.color === 'gray' ? 'sentinel' : b.color}-400`,
                            text: b.text
                        }));
                        setCachedAi({ headline, description, summaryBullets });
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

    // Periodic refresh every 5 minutes (market data stays reasonably fresh)
    useEffect(() => {
        const interval = setInterval(() => {
            if (!document.hidden) {
                fetch_();
            }
        }, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, [fetch_]);

    return { data, loading, error, refetch: fetch_ };
}
