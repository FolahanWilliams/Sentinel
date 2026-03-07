import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

interface TrendItem {
    text: string;
    direction: 'up' | 'down' | 'neutral';
}

interface MarketTrendsData {
    midTerm: TrendItem[];
    longTerm: TrendItem[];
}

const CACHE_KEY = 'sentinel_market_trends';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached(): MarketTrendsData | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    } catch { /* ignore */ }
    return null;
}

function setCache(data: MarketTrendsData) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch { /* ignore */ }
}

export function useMarketTrends() {
    const [data, setData] = useState<MarketTrendsData | null>(getCached());
    const [loading, setLoading] = useState(!getCached());
    const [error, setError] = useState<string | null>(null);

    const fetch_ = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { data: geminiRes, error: geminiErr } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    systemInstruction: `You are a macro market strategist. Today is ${new Date().toISOString().split('T')[0]}. Analyze current market conditions and identify key trends.`,
                    prompt: 'Identify the top 3 mid-term (1-3 month) and top 3 long-term (6-12 month) investment themes/trends currently shaping markets. Use real, current market data. Return JSON only.',
                    requireGroundedSearch: true,
                    responseSchema: {
                        type: 'object',
                        properties: {
                            midTerm: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        text: { type: 'string', description: 'Concise trend name (2-4 words)' },
                                        direction: { type: 'string', enum: ['up', 'down', 'neutral'] }
                                    },
                                    required: ['text', 'direction']
                                }
                            },
                            longTerm: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        text: { type: 'string', description: 'Concise trend name (2-4 words)' },
                                        direction: { type: 'string', enum: ['up', 'down', 'neutral'] }
                                    },
                                    required: ['text', 'direction']
                                }
                            }
                        },
                        required: ['midTerm', 'longTerm']
                    }
                }
            });

            if (geminiErr) throw new Error(geminiErr.message);

            if (geminiRes?.text) {
                const cleanText = geminiRes.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const parsed = JSON.parse(cleanText);
                const trendsData: MarketTrendsData = {
                    midTerm: (parsed.midTerm || []).slice(0, 3),
                    longTerm: (parsed.longTerm || []).slice(0, 3),
                };
                setData(trendsData);
                setCache(trendsData);
            }
        } catch (err: any) {
            const errorMsg = err.message || 'Failed to load trends';
            setError(errorMsg);
            console.error('[useMarketTrends] Error:', err);
            // Use cached data if available, otherwise show error state (not fake "Loading" text)
            setData(prev => prev ?? {
                midTerm: [
                    { text: 'Trends unavailable', direction: 'neutral' as const },
                ],
                longTerm: [
                    { text: 'Trends unavailable', direction: 'neutral' as const },
                ],
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { data, loading, error, refetch: fetch_ };
}
