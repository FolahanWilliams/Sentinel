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
const allListeners = new Set<(data: Record<string, QuoteData>) => void>();
const currentTickers = new Set<string>();

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

        // Keep the worker's auth token fresh
        supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.access_token) {
                sharedWorker?.postMessage({
                    type: 'updateToken',
                    accessToken: session.access_token,
                });
            }
        });
    }
    return sharedWorker;
}

function syncWorkerTickers() {
    if (sharedWorker && currentTickers.size > 0) {
        sharedWorker.postMessage({
            type: 'subscribe',
            tickers: Array.from(currentTickers),
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

        // Register this component's tickers
        const newTickers = tickerKey.split(',');
        for (const t of newTickers) {
            currentTickers.add(t);
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

            // Remove this component's tickers
            for (const t of newTickers) {
                currentTickers.delete(t);
            }

            if (subscriberCount <= 0 && sharedWorker) {
                sharedWorker.postMessage({ type: 'unsubscribe' });
                sharedWorker.terminate();
                sharedWorker = null;
                subscriberCount = 0;
            } else {
                syncWorkerTickers();
            }
        };
    }, [tickerKey, intervalMs, handleQuotes]);

    return quotes;
}
