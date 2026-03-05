import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';

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
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
                            price: q.price,
                            changePercent: q.changePercent,
                            change: q.change,
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
            let headline = 'Markets in Motion';
            let description = 'Loading market intelligence...';
            let summaryBullets: { color: string; text: string }[] = [];

            try {
                const { data: geminiRes, error: geminiErr } = await supabase.functions.invoke('proxy-gemini', {
                    body: {
                        systemInstruction: `You are a concise financial market analyst. Today is ${new Date().toISOString().split('T')[0]}. The current market data is: VIX=${vix.price} (${vix.changePercent > 0 ? '+' : ''}${vix.changePercent.toFixed(2)}%), S&P 500=${sp500.price} (${sp500.changePercent > 0 ? '+' : ''}${sp500.changePercent.toFixed(2)}%), NASDAQ=${nasdaq.price} (${nasdaq.changePercent > 0 ? '+' : ''}${nasdaq.changePercent.toFixed(2)}%), DJI=${dji.price} (${dji.changePercent > 0 ? '+' : ''}${dji.changePercent.toFixed(2)}%), Bitcoin=${btc.price} (${btc.changePercent > 0 ? '+' : ''}${btc.changePercent.toFixed(2)}%), Gold=${gold.price} (${gold.changePercent > 0 ? '+' : ''}${gold.changePercent.toFixed(2)}%), Oil=${oil.price} (${oil.changePercent > 0 ? '+' : ''}${oil.changePercent.toFixed(2)}%), 10Y Yield=${tnx.price}%.`,
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

                if (!geminiErr && geminiRes?.text) {
                    const parsed = JSON.parse(geminiRes.text);
                    headline = parsed.headline || headline;
                    description = parsed.description || description;
                    if (parsed.fearGreedValue !== undefined) fearGreedValue = parsed.fearGreedValue;
                    if (parsed.fearGreedLabel) fearGreedLabel = parsed.fearGreedLabel;
                    summaryBullets = (parsed.summaryBullets || []).map((b: any) => ({
                        color: `text-${b.color === 'gray' ? 'sentinel' : b.color}-400`,
                        text: b.text
                    }));
                }
            } catch (e) {
                console.warn('[useMarketSnapshot] Gemini headline generation failed', e);
            }

            // If Gemini didn't produce bullets, make simple fallback
            if (summaryBullets.length === 0) {
                summaryBullets = [
                    { color: 'text-sentinel-400', text: `VIX at ${vix.price.toFixed(2)} (${vix.changePercent > 0 ? '+' : ''}${vix.changePercent.toFixed(2)}%)` },
                    { color: sp500.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400', text: `S&P 500 ${sp500.changePercent >= 0 ? 'up' : 'down'} ${Math.abs(sp500.changePercent).toFixed(2)}%` },
                    { color: btc.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400', text: `Bitcoin ${btc.changePercent >= 0 ? 'up' : 'down'} ${Math.abs(btc.changePercent).toFixed(2)}%` },
                    { color: fearGreedValue < 40 ? 'text-red-400' : fearGreedValue > 60 ? 'text-emerald-400' : 'text-amber-400', text: `Market sentiment: ${fearGreedLabel} (${fearGreedValue})` },
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
