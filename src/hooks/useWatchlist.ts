import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

interface WatchlistTicker {
    id: string;
    ticker: string;
    company_name: string;
    sector: string;
    is_active: boolean;
    notes: string | null;
    added_at: string;
}

export function useWatchlist() {
    const [tickers, setTickers] = useState<WatchlistTicker[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchTickers = useCallback(async () => {
        setLoading(true);
        const { data, error: err } = await supabase
            .from('watchlist')
            .select('*')
            .order('added_at', { ascending: false });

        if (err) {
            setError(err.message);
        } else {
            setTickers(data || []);
            setError(null);
        }
        setLoading(false);
    }, []);

    useEffect(() => { fetchTickers(); }, [fetchTickers]);

    const addTicker = useCallback(async (ticker: string, companyName: string, sector: string) => {
        const { error: err } = await supabase
            .from('watchlist')
            .insert({ ticker: ticker.toUpperCase(), company_name: companyName, sector, is_active: true } as any);
        if (err) { setError(err.message); return false; }
        await fetchTickers();
        return true;
    }, [fetchTickers]);

    const removeTicker = useCallback(async (id: string) => {
        const { error: err } = await supabase.from('watchlist').delete().eq('id', id);
        if (err) { setError(err.message); return false; }
        await fetchTickers();
        return true;
    }, [fetchTickers]);

    const toggleActive = useCallback(async (id: string, isActive: boolean) => {
        const { error: err } = await supabase
            .from('watchlist')
            .update({ is_active: isActive } as any)
            .eq('id', id);
        if (err) { setError(err.message); return false; }
        await fetchTickers();
        return true;
    }, [fetchTickers]);

    return { tickers, loading, error, addTicker, removeTicker, toggleActive, refetch: fetchTickers };
}
