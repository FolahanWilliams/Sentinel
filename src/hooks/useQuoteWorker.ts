/**
 * useQuoteWorker — Hook that manages a shared Web Worker for quote polling.
 *
 * Replaces per-component setInterval + MarketDataService.getQuote() calls
 * with a single worker thread that polls quotes and broadcasts results.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import type { QuoteData } from '@/workers/quotePoller';

// Singleton worker — shared across all components that use this hook
let sharedWorker: Worker | null = null;
let subscriberCount = 0;
let authSubscription: { unsubscribe: () => void } | null = null;
const allListeners = new Set<(data: Record<string, QuoteData>) => void>();
const tickerRefCounts = new Map<string, number>();

function getOrCreateWorker(): Worker {
    if (!sharedWorker) {
        sharedWorker = new Worker(
            new URL('../workers/quotePoller.ts', import.meta.url),
            { type: 'module' }
        );

        sharedWorker.onmessage = (event) => {
            if (event.data.type === 'quotes') {
                for (const listener of allListeners) {
                    listener(event.data.data);
                }
            }
        };

        // Initialize with Supabase credentials
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.access_token) {
                sharedWorker?.postMessage({
                    type: 'init',
                    supabaseUrl,
                    supabaseAnonKey,
                    accessToken: session.access_token,
                });
            }
        });

        // Keep the worker's auth token fresh — store subscription to clean up later
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.access_token) {
                sharedWorker?.postMessage({
                    type: 'updateToken',
                    accessToken: session.access_token,
                });
            }
        });
        authSubscription = data.subscription;
    }
    return sharedWorker;
}

function syncWorkerTickers() {
    const tickers = Array.from(tickerRefCounts.keys());
    if (sharedWorker && tickers.length > 0) {
        sharedWorker.postMessage({
            type: 'subscribe',
            tickers,
        });
    }
}

export function useQuoteWorker(tickers: string[], intervalMs = 60_000) {
    const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
    const tickerKey = tickers.sort().join(',');
    const prevTickerKey = useRef('');

    const handleQuotes = useCallback((data: Record<string, QuoteData>) => {
        setQuotes(prev => ({ ...prev, ...data }));
    }, []);

    useEffect(() => {
        if (!tickerKey) return;

        const worker = getOrCreateWorker();
        subscriberCount++;
        allListeners.add(handleQuotes);

        // Register this component's tickers with ref counting
        const newTickers = tickerKey.split(',');
        for (const t of newTickers) {
            tickerRefCounts.set(t, (tickerRefCounts.get(t) ?? 0) + 1);
        }

        // Update worker if tickers changed
        if (prevTickerKey.current !== tickerKey) {
            prevTickerKey.current = tickerKey;
            worker.postMessage({ type: 'setInterval', intervalMs });
            syncWorkerTickers();
        }

        return () => {
            allListeners.delete(handleQuotes);
            subscriberCount--;

            // Decrement ref counts; only remove ticker when no subscribers remain
            for (const t of newTickers) {
                const count = (tickerRefCounts.get(t) ?? 1) - 1;
                if (count <= 0) {
                    tickerRefCounts.delete(t);
                } else {
                    tickerRefCounts.set(t, count);
                }
            }

            if (subscriberCount <= 0 && sharedWorker) {
                sharedWorker.postMessage({ type: 'unsubscribe' });
                sharedWorker.terminate();
                sharedWorker = null;
                subscriberCount = 0;
                // Clean up auth listener to prevent leak
                if (authSubscription) {
                    authSubscription.unsubscribe();
                    authSubscription = null;
                }
            } else {
                syncWorkerTickers();
            }
        };
    }, [tickerKey, intervalMs, handleQuotes]);

    return quotes;
}
