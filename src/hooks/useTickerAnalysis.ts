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

/**
 * Extract JSON from Gemini free-form text responses.
 * When grounded search is enabled, responseSchema is stripped by the proxy,
 * so Gemini may wrap JSON in markdown fences or prose.
 */
function extractJSON(text: string): any {
    // Try direct parse first
    try { return JSON.parse(text); } catch { /* continue */ }

    // Try extracting from markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
        try { return JSON.parse(fenceMatch[1]!.trim()); } catch { /* continue */ }
    }

    // Try finding first [ or { and matching to last ] or }
    const arrStart = text.indexOf('[');
    const objStart = text.indexOf('{');
    const start = arrStart >= 0 && (objStart < 0 || arrStart < objStart) ? arrStart : objStart;
    if (start >= 0) {
        const isArray = text[start] === '[';
        const end = isArray ? text.lastIndexOf(']') : text.lastIndexOf('}');
        if (end > start) {
            try { return JSON.parse(text.slice(start, end + 1)); } catch { /* continue */ }
        }
    }

    throw new Error('Could not extract JSON from response');
}

async function fetchBiasWeights(ticker: string): Promise<BiasWeight[]> {
    const { data, error } = await supabase.functions.invoke('proxy-gemini', {
        body: {
            systemInstruction: `You are a financial signal analysis engine. You MUST respond with ONLY a valid JSON array — no markdown, no explanation, no code fences. For the stock ticker ${ticker}, analyze the current market environment and break down the primary factors that would drive a trading signal.`,
            prompt: `Analyze ${ticker} and return a JSON array of the top 4-6 signal drivers. Each object must have: "factor" (short label), "weight" (number 0-100, all must sum to 100), "description" (one sentence), "sentiment" ("bullish"|"bearish"|"neutral"). Consider: market sentiment, insider activity, technical signals, analyst ratings, institutional flow, sector momentum, macro factors. Respond with ONLY the JSON array.`,
            requireGroundedSearch: true,
        }
    });

    if (error) throw error;
    if (!data?.text) throw new Error('Empty response from Gemini');
    const parsed = extractJSON(data.text);
    const weights = Array.isArray(parsed) ? parsed : [];
    if (data.groundingSources) (weights as any)._groundingSources = data.groundingSources;
    return weights;
}

async function fetchEvents(ticker: string): Promise<AIEvent[]> {
    const { data, error } = await supabase.functions.invoke('proxy-gemini', {
        body: {
            systemInstruction: `You are a financial event tracker. You MUST respond with ONLY a valid JSON array — no markdown, no explanation, no code fences. For stock ticker ${ticker}, find significant recent events (last 30 days).`,
            prompt: `List the 6-10 most impactful recent events for ${ticker} in the last 30 days as a JSON array. Each object must have: "date" (YYYY-MM-DD), "type" ("earnings"|"filing"|"analyst"|"news"|"insider"|"macro"), "headline" (string), "impact" ("high"|"medium"|"low"), "priceMove" (e.g. "+3.2%" or "" if unknown), "source" (e.g. "Reuters"). Order by date, most recent first. Respond with ONLY the JSON array.`,
            requireGroundedSearch: true,
        }
    });

    if (error) throw error;
    if (!data?.text) throw new Error('Empty response from Gemini');
    const events = extractJSON(data.text);
    if (data.groundingSources) (events as any)._groundingSources = data.groundingSources;
    return Array.isArray(events) ? events : [];
}

async function fetchFundamentals(ticker: string): Promise<FundamentalMetrics> {
    const { data, error } = await supabase.functions.invoke('proxy-gemini', {
        body: {
            systemInstruction: `You are a financial data extraction engine. You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no code fences. For stock ticker ${ticker}, find the latest fundamental metrics.`,
            prompt: `Get the latest fundamental metrics for ${ticker} and return a single JSON object with these exact keys: "forwardPE" (number|null), "priceToSales" (number|null), "evToEbitda" (number|null), "debtToEquity" (number|null), "institutionalOwnershipPct" (number|null), "shortInterestPct" (number|null), "insiderTransactions30d" (string|null), "revenueGrowthYoY" (number|null), "profitMargin" (number|null), "marketCap" (string like "$2.5T"|null), "sector" (string|null), "industry" (string|null). Use null for any metric you cannot find. Respond with ONLY the JSON object.`,
            requireGroundedSearch: true,
        }
    });

    if (error) throw error;
    if (!data?.text) throw new Error('Empty response from Gemini');
    return extractJSON(data.text);
}
