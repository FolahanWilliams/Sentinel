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
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.accessToken}`,
            'apikey': state.supabaseAnonKey,
        };
        // Yahoo returns LSE (.L) prices in GBX (pence); normalize to pounds so they
        // match the pound-denominated entry prices (mirrors MarketDataService).
        // Use the RESOLVED symbol: a bare ticker resolved server-side to ".L" arrives as
        // pence under the bare key, so checking the requested symbol would skip the ÷100.
        const toQuote = (ticker: string, q: any): QuoteData | null => {
            if (!q || q.price == null) return null;
            const factor = (q.resolvedTicker ?? ticker).toUpperCase().endsWith('.L') ? 100 : 1;
            return {
                price: q.price / factor,
                changePercent: q.changePercent ?? 0,
                volume: q.volume,
                timestamp: Date.now(),
            };
        };

        // Bulk endpoint — proxy expects `bulk_quote` and returns { success, data: Record<TICKER, Quote> }.
        const response = await fetch(`${state.supabaseUrl}/functions/v1/proxy-market-data`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ endpoint: 'bulk_quote', tickers: state.tickers.map(t => t.toUpperCase()) }),
        });

        if (response.ok) {
            const data = await response.json();
            if (data?.success && data?.data) {
                for (const [ticker, quote] of Object.entries(data.data as Record<string, any>)) {
                    const norm = toQuote(ticker, quote);
                    if (norm) results[ticker.toUpperCase()] = norm;
                }
            }
        } else {
            // Fallback: fetch individually — proxy returns { success, data: Quote }.
            for (const ticker of state.tickers) {
                try {
                    const res = await fetch(`${state.supabaseUrl}/functions/v1/proxy-market-data`, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify({ endpoint: 'quote', ticker: ticker.toUpperCase() }),
                    });
                    if (res.ok) {
                        const data = await res.json();
                        const norm = data?.success ? toQuote(ticker, data.data) : null;
                        if (norm) results[ticker.toUpperCase()] = norm;
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
