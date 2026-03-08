/**
 * useTickerAnalysis — On-demand AI-powered analysis for a specific ticker.
 *
 * Lazily fetches 3 datasets via proxy-gemini with Google Search grounding:
 * 1. Bias weights (why was this flagged?)
 * 2. Recent events (news, filings, analyst actions)
 * 3. Fundamental metrics (P/E, institutional ownership, etc.)
 *
 * Results are cached per ticker so re-expanding doesn't re-fetch.
 */

import { useState, useCallback, useRef } from 'react';
import { CACHE_TTL_TICKER_ANALYSIS } from '@/config/constants';
import { supabase } from '@/config/supabase';
import type { GroundingSource } from '@/types/agents';

export interface BiasWeight {
    factor: string;
    weight: number;        // 0-100
    description: string;
    sentiment: 'bullish' | 'bearish' | 'neutral';
}

export interface AIEvent {
    date: string;
    type: string;           // 'earnings' | 'filing' | 'analyst' | 'news' | 'insider' | 'macro'
    headline: string;
    impact: 'high' | 'medium' | 'low';
    priceMove?: string;     // e.g. "+3.2%" or "-1.5%"
    source?: string;
}

export interface FundamentalMetrics {
    forwardPE: number | null;
    priceToSales: number | null;
    evToEbitda: number | null;
    debtToEquity: number | null;
    institutionalOwnershipPct: number | null;
    shortInterestPct: number | null;
    insiderTransactions30d: string | null;
    revenueGrowthYoY: number | null;
    profitMargin: number | null;
    marketCap: string | null;
    sector: string | null;
    industry: string | null;
}

export interface TickerAnalysis {
    biasWeights: BiasWeight[];
    events: AIEvent[];
    fundamentals: FundamentalMetrics | null;
    groundingSources: GroundingSource[];
}

interface CacheEntry {
    timestamp: number;
    data: TickerAnalysis;
}

// Per-session cache
const CACHE_KEY = 'sentinel_analysis_cache';
const MAX_AGE_MS = CACHE_TTL_TICKER_ANALYSIS;

// Initialize cache from sessionStorage if available
const loadInitialCache = (): Map<string, CacheEntry> => {
    try {
        const stored = sessionStorage.getItem(CACHE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            const now = Date.now();
            const validEntries = new Map<string, CacheEntry>();

            // Filter out expired items during initial load
            for (const [key, value] of Object.entries(parsed) as [string, CacheEntry][]) {
                if (now - value.timestamp < MAX_AGE_MS) {
                    validEntries.set(key, value);
                }
            }
            return validEntries;
        }
    } catch (e) {
        console.warn('Failed to parse analysis cache from sessionStorage', e);
    }
    return new Map<string, CacheEntry>();
};

const analysisCache = loadInitialCache();

export function useTickerAnalysis() {
    // Initialize component state with what's already in the cache
    const [data, setData] = useState<Record<string, TickerAnalysis>>(() => {
        const initialData: Record<string, TickerAnalysis> = {};
        analysisCache.forEach((value, key) => {
            initialData[key] = value.data;
        });
        return initialData;
    });

    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const inflight = useRef<Set<string>>(new Set());

    // Helper to sync Map to sessionStorage
    const persistCache = () => {
        try {
            const obj = Object.fromEntries(analysisCache);
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(obj));
        } catch (e) {
            console.warn('Failed to persist analysis cache', e);
        }
    };

    const fetchAnalysis = useCallback(async (ticker: string) => {
        if (!ticker) return;

        // Return cached if not expired
        const cached = analysisCache.get(ticker);
        if (cached && (Date.now() - cached.timestamp < MAX_AGE_MS)) {
            setData(prev => ({ ...prev, [ticker]: cached.data }));
            return;
        }

        // Prevent duplicate in-flight requests
        if (inflight.current.has(ticker)) return;
        inflight.current.add(ticker);

        setLoading(prev => ({ ...prev, [ticker]: true }));

        try {
            // Fire all 3 AI calls in parallel
            const [biasRes, eventsRes, fundRes] = await Promise.allSettled([
                fetchBiasWeights(ticker),
                fetchEvents(ticker),
                fetchFundamentals(ticker),
            ]);

            // Collect grounding sources from all fulfilled responses
            const allSources: GroundingSource[] = [];
            for (const res of [biasRes, eventsRes, fundRes]) {
                if (res.status === 'fulfilled' && Array.isArray((res.value as any)?._groundingSources)) {
                    allSources.push(...(res.value as any)._groundingSources);
                }
            }

            const result: TickerAnalysis = {
                biasWeights: biasRes.status === 'fulfilled' ? biasRes.value : [],
                events: eventsRes.status === 'fulfilled' ? eventsRes.value : [],
                fundamentals: fundRes.status === 'fulfilled' ? fundRes.value : null,
                groundingSources: allSources,
            };

            analysisCache.set(ticker, { timestamp: Date.now(), data: result });
            persistCache(); // Persist to sessionStorage
            setData(prev => ({ ...prev, [ticker]: result }));
        } catch (err) {
            console.error(`[useTickerAnalysis] Failed for ${ticker}:`, err);
        } finally {
            inflight.current.delete(ticker);
            setLoading(prev => ({ ...prev, [ticker]: false }));
        }
    }, []);

    return { data, loading, fetchAnalysis };
}


// ── Internal fetch helpers ─────────────────────────────────────────

async function fetchBiasWeights(ticker: string): Promise<BiasWeight[]> {
    const { data, error } = await supabase.functions.invoke('proxy-gemini', {
        body: {
            systemInstruction: `You are a financial signal analysis engine. For the stock ticker ${ticker}, analyze the current market environment and break down the primary factors that would drive a trading signal for this stock right now. Return a JSON array of factors with their relative weights (must sum to 100).`,
            prompt: `Analyze ${ticker} and return the primary signal drivers with weighted contributions. Consider: market sentiment (social media, news tone), insider buying/selling, technical signals (RSI, moving averages, volume), analyst ratings, institutional flow, sector momentum, and macro factors. Return the top 4-6 most relevant factors.`,
            requireGroundedSearch: true,
            responseSchema: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        factor: { type: 'STRING', description: 'Short label like "Bearish Sentiment" or "Insider Buying"' },
                        weight: { type: 'NUMBER', description: 'Percentage weight 0-100, all must sum to 100' },
                        description: { type: 'STRING', description: 'One sentence explanation' },
                        sentiment: { type: 'STRING', enum: ['bullish', 'bearish', 'neutral'] }
                    },
                    required: ['factor', 'weight', 'description', 'sentiment']
                }
            }
        }
    });

    if (error) throw error;
    if (!data?.text) throw new Error('Empty response from Gemini');
    return JSON.parse(data.text);
}

async function fetchEvents(ticker: string): Promise<AIEvent[]> {
    const { data, error } = await supabase.functions.invoke('proxy-gemini', {
        body: {
            systemInstruction: `You are a financial event tracker. For stock ticker ${ticker}, find the most significant recent events (last 30 days) that have affected or could affect its stock price. Include earnings, SEC filings, analyst actions, major news, insider transactions, and macro events.`,
            prompt: `List the 6-10 most impactful recent events for ${ticker} in the last 30 days. For each, include the exact date, the type of event, a headline, the impact level, and the approximate price move (if known). Order by date, most recent first.`,
            requireGroundedSearch: true,
            responseSchema: {
                type: 'ARRAY',
                items: {
                    type: 'OBJECT',
                    properties: {
                        date: { type: 'STRING', description: 'ISO date string YYYY-MM-DD' },
                        type: { type: 'STRING', enum: ['earnings', 'filing', 'analyst', 'news', 'insider', 'macro'] },
                        headline: { type: 'STRING', description: 'Event headline' },
                        impact: { type: 'STRING', enum: ['high', 'medium', 'low'] },
                        priceMove: { type: 'STRING', description: 'Approximate price change like +3.2% or -1.5%, or empty if unknown' },
                        source: { type: 'STRING', description: 'Source name like Reuters, SEC, Bloomberg' }
                    },
                    required: ['date', 'type', 'headline', 'impact']
                }
            }
        }
    });

    if (error) throw error;
    if (!data?.text) throw new Error('Empty response from Gemini');
    const events = JSON.parse(data.text);
    // Attach grounding sources for aggregation
    if (data.groundingSources) {
        (events as any)._groundingSources = data.groundingSources;
    }
    return events;
}

async function fetchFundamentals(ticker: string): Promise<FundamentalMetrics> {
    const { data, error } = await supabase.functions.invoke('proxy-gemini', {
        body: {
            systemInstruction: `You are a financial data extraction engine. For stock ticker ${ticker}, find the latest fundamental financial metrics. Use the most recent publicly available data from financial websites.`,
            prompt: `Get the latest fundamental metrics for ${ticker}: Forward P/E ratio, Price/Sales ratio, EV/EBITDA, Debt/Equity ratio, Institutional Ownership %, Short Interest %, recent insider transactions (last 30 days summary), Revenue Growth YoY %, Profit Margin %, Market Cap (formatted like "$2.5T"), Sector, and Industry. Return null for any metric you cannot find.`,
            requireGroundedSearch: true,
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    forwardPE: { type: 'NUMBER', nullable: true },
                    priceToSales: { type: 'NUMBER', nullable: true },
                    evToEbitda: { type: 'NUMBER', nullable: true },
                    debtToEquity: { type: 'NUMBER', nullable: true },
                    institutionalOwnershipPct: { type: 'NUMBER', nullable: true },
                    shortInterestPct: { type: 'NUMBER', nullable: true },
                    insiderTransactions30d: { type: 'STRING', nullable: true },
                    revenueGrowthYoY: { type: 'NUMBER', nullable: true },
                    profitMargin: { type: 'NUMBER', nullable: true },
                    marketCap: { type: 'STRING', nullable: true },
                    sector: { type: 'STRING', nullable: true },
                    industry: { type: 'STRING', nullable: true }
                },
                required: ['forwardPE', 'priceToSales', 'evToEbitda', 'debtToEquity', 'institutionalOwnershipPct', 'shortInterestPct', 'insiderTransactions30d', 'revenueGrowthYoY', 'profitMargin', 'marketCap', 'sector', 'industry']
            }
        }
    });

    if (error) throw error;
    if (!data?.text) throw new Error('Empty response from Gemini');
    return JSON.parse(data.text);
}
