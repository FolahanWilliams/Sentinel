/**
 * QuotePoller Web Worker — offloads periodic quote fetching from the main thread.
 *
 * Messages IN:
 *   { type: 'subscribe', tickers: string[] }      — set which tickers to poll
 *   { type: 'unsubscribe' }                        — stop polling
 *   { type: 'setInterval', intervalMs: number }     — change poll interval
 *
 * Messages OUT:
 *   { type: 'quotes', data: Record<string, QuoteData> }  — latest quotes
 *   { type: 'error', message: string }                      — fetch error
 */

export interface QuoteData {
    price: number;
    changePercent: number;
    volume?: number;
    timestamp: number;
}

interface WorkerState {
    tickers: string[];
    intervalMs: number;
    timerId: ReturnType<typeof setInterval> | null;
    supabaseUrl: string;
    supabaseAnonKey: string;
    accessToken: string;
}

const state: WorkerState = {
    tickers: [],
    intervalMs: 60_000,
    timerId: null,
    supabaseUrl: '',
    supabaseAnonKey: '',
    accessToken: '',
};

async function fetchQuotes() {
    if (state.tickers.length === 0 || !state.supabaseUrl || !state.accessToken) return;

    try {
        const results: Record<string, QuoteData> = {};

        // Use bulk endpoint if available, otherwise fetch individually
        const response = await fetch(`${state.supabaseUrl}/functions/v1/proxy-market-data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.accessToken}`,
                'apikey': state.supabaseAnonKey,
            },
            body: JSON.stringify({
                endpoint: 'bulk-quotes',
                tickers: state.tickers,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            if (data?.quotes) {
                for (const [ticker, quote] of Object.entries(data.quotes as Record<string, any>)) {
                    if (quote?.price) {
                        results[ticker] = {
                            price: quote.price,
                            changePercent: quote.changePercent ?? 0,
                            volume: quote.volume,
                            timestamp: Date.now(),
                        };
                    }
                }
            }
        } else {
            // Fallback: fetch individually with staggered timing
            for (const ticker of state.tickers) {
                try {
                    const res = await fetch(`${state.supabaseUrl}/functions/v1/proxy-market-data`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${state.accessToken}`,
                            'apikey': state.supabaseAnonKey,
                        },
                        body: JSON.stringify({ endpoint: 'quote', ticker }),
                    });

                    if (res.ok) {
                        const data = await res.json();
                        if (data?.quote?.price) {
                            results[ticker] = {
                                price: data.quote.price,
                                changePercent: data.quote.changePercent ?? 0,
                                volume: data.quote.volume,
                                timestamp: Date.now(),
                            };
                        }
                    }
                } catch { /* skip individual failures */ }
            }
        }

        if (Object.keys(results).length > 0) {
            self.postMessage({ type: 'quotes', data: results });
        }
    } catch (err: any) {
        self.postMessage({ type: 'error', message: err.message || 'Quote fetch failed' });
    }
}

function startPolling() {
    stopPolling();
    // Fetch immediately, then on interval
    fetchQuotes();
    state.timerId = setInterval(fetchQuotes, state.intervalMs);
}

function stopPolling() {
    if (state.timerId !== null) {
        clearInterval(state.timerId);
        state.timerId = null;
    }
}

self.onmessage = (event: MessageEvent) => {
    const msg = event.data;
    switch (msg.type) {
        case 'init':
            state.supabaseUrl = msg.supabaseUrl;
            state.supabaseAnonKey = msg.supabaseAnonKey;
            state.accessToken = msg.accessToken;
            break;

        case 'updateToken':
            state.accessToken = msg.accessToken;
            break;

        case 'subscribe':
            state.tickers = msg.tickers || [];
            if (state.tickers.length > 0) {
                startPolling();
            } else {
                stopPolling();
            }
            break;

        case 'unsubscribe':
            state.tickers = [];
            stopPolling();
            break;

        case 'setInterval':
            state.intervalMs = msg.intervalMs || 60_000;
            if (state.tickers.length > 0) {
                startPolling(); // restart with new interval
            }
            break;
    }
};
