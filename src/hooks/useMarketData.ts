import { useEffect, useState, useCallback } from 'react';
import { MarketDataService } from '@/services/marketData';
import type { Quote } from '@/types/market';

export function useMarketData(tickers: string[]) {
    const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchQuotes = useCallback(async () => {
        if (tickers.length === 0) {
            setQuotes(new Map());
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const bulk = await MarketDataService.getQuotesBulk(tickers);
            const map = new Map<string, Quote>();
            for (const [ticker, quote] of Object.entries(bulk)) {
                map.set(ticker, quote);
            }
            setQuotes(map);
            setError(null);
        } catch (err: any) {
            setError(err.message);
        }
        setLoading(false);
    }, [tickers.join(',')]);

    useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

    return { quotes, loading, error, refetch: fetchQuotes };
}
