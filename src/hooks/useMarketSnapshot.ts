import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';

interface MarketSnapshotData {
    headline: string;
    description: string;
    fearGreedValue: number;
    fearGreedLabel: string;
    tickers: {
        vix: { price: number; changePercent: number };
        sp500: { price: number; changePercent: number };
        btc: { price: number; changePercent: number };
    };
    summaryBullets: { color: string; text: string }[];
    lastUpdated: string;
}

const CACHE_KEY = 'sentinel_market_snapshot';
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
            let vix = { price: 0, changePercent: 0 };
            let sp500 = { price: 0, changePercent: 0 };
            let btc = { price: 0, changePercent: 0 };

            const tickerMap = [
                { key: 'vix', symbol: '^VIX' },
                { key: 'sp500', symbol: '^GSPC' },
                { key: 'btc', symbol: 'BTC-USD' },
            ] as const;

            const quoteResults = await Promise.allSettled(
                tickerMap.map(t => MarketDataService.getQuote(t.symbol))
            );

            quoteResults.forEach((result, i) => {
                if (result.status === 'fulfilled') {
                    const q = result.value;
                    const entry = { price: q.price, changePercent: q.changePercent };
                    const t = tickerMap[i];
                    if (t) {
                        if (t.key === 'vix') vix = entry;
                        if (t.key === 'sp500') sp500 = entry;
                        if (t.key === 'btc') btc = entry;
                    }
                }
            });

            // --- 2. Generate AI headline, summary, and get CNN Fear & Greed via Gemini ---
            let headline = 'Markets in Motion';
            let description = 'Loading market intelligence...';
            let summaryBullets: { color: string; text: string }[] = [];

            try {
                const { data: geminiRes, error: geminiErr } = await supabase.functions.invoke('proxy-gemini', {
                    body: {
                        systemInstruction: `You are a concise financial market analyst. Today is ${new Date().toISOString().split('T')[0]}. The current market data is: VIX=${vix.price} (${vix.changePercent > 0 ? '+' : ''}${vix.changePercent.toFixed(2)}%), S&P 500=${sp500.price} (${sp500.changePercent > 0 ? '+' : ''}${sp500.changePercent.toFixed(2)}%), Bitcoin=${btc.price} (${btc.changePercent > 0 ? '+' : ''}${btc.changePercent.toFixed(2)}%).`,
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
                tickers: { vix, sp500, btc },
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
