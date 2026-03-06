import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

interface NotableEvent {
    date: string;
    text: string;
}

interface EarningsEntry {
    date: string;
    tickers: string[];
}

interface EconomicEntry {
    date: string;
    name: string;
    importance: string;
}

interface UpcomingEventsData {
    notable: NotableEvent[];
    earnings: EarningsEntry[];
    economic: EconomicEntry[];
}

const CACHE_KEY = 'sentinel_upcoming_events';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCached(): UpcomingEventsData | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { data, timestamp } = JSON.parse(raw);
        if (Date.now() - timestamp < CACHE_TTL_MS) return data;
    } catch { /* ignore */ }
    return null;
}

function setCache(data: UpcomingEventsData) {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
    } catch { /* ignore */ }
}

export function useUpcomingEvents() {
    const [data, setData] = useState<UpcomingEventsData | null>(getCached());
    const [loading, setLoading] = useState(!getCached());
    const [error, setError] = useState<string | null>(null);

    const fetch_ = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Use Gemini with grounded search to get current events
            const today = new Date().toISOString().split('T')[0];
            const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const { data: geminiRes, error: geminiErr } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    systemInstruction: `You are a financial events calendar analyst. Today is ${today}. Find REAL upcoming events for the next 7 days (${today} to ${nextWeek}).`,
                    prompt: `List the upcoming notable market events, earnings reports, and economic data releases for the next 7 days. Only include REAL, VERIFIED events. Return JSON only.`,
                    requireGroundedSearch: true,
                    responseSchema: {
                        type: 'object',
                        properties: {
                            notable: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        date: { type: 'string', description: 'Full date string e.g. "Wednesday, March 5, 2026"' },
                                        text: { type: 'string', description: 'Brief description of the notable event' }
                                    },
                                    required: ['date', 'text']
                                },
                                description: 'Top 3 notable events this week'
                            },
                            earnings: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        date: { type: 'string', description: 'Short date e.g. "Mon, Mar 3"' },
                                        tickers: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            description: 'Stock tickers reporting earnings on this date (max 5)'
                                        }
                                    },
                                    required: ['date', 'tickers']
                                },
                                description: 'Earnings dates for this week (max 5 days)'
                            },
                            economic: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        date: { type: 'string', description: 'Short date e.g. "Wed, Mar 5"' },
                                        name: { type: 'string', description: 'Name of economic data release' },
                                        importance: { type: 'string', enum: ['high', 'medium', 'low'] }
                                    },
                                    required: ['date', 'name', 'importance']
                                },
                                description: 'Economic data releases this week (max 5)'
                            }
                        },
                        required: ['notable', 'earnings', 'economic']
                    }
                }
            });

            if (geminiErr) throw new Error(geminiErr.message);

            if (geminiRes?.text) {
                const cleanText = geminiRes.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const parsed = JSON.parse(cleanText);
                const eventsData: UpcomingEventsData = {
                    notable: (parsed.notable || []).slice(0, 3),
                    earnings: (parsed.earnings || []).slice(0, 5),
                    economic: (parsed.economic || []).slice(0, 5),
                };
                setData(eventsData);
                setCache(eventsData);
            }
        } catch (err: any) {
            setError(err.message);
            console.error('[useUpcomingEvents] Error:', err);
            setData(prev => prev ?? { notable: [], earnings: [], economic: [] });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetch_(); }, [fetch_]);

    return { data, loading, error, refetch: fetch_ };
}
