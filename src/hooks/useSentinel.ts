import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/config/supabase';
import type { SentinelResponse } from '@/types/sentinel';

// 60-second polling interval as per spec
const DEFAULT_INTERVAL_MS = 60_000;

export function useSentinel(intervalMs = DEFAULT_INTERVAL_MS) {
    const [data, setData] = useState<SentinelResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Use a ref to prevent overlapping fetches if API is slow
    const isFetchingRef = useRef(false);

    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setInterval>;

        const fetchSentinel = async (isInitial = false) => {
            if (isFetchingRef.current) return;

            try {
                isFetchingRef.current = true;
                if (isInitial) setLoading(true);
                else setIsRefreshing(true);

                setError(null);

                // Call the monolith Edge Function
                const { data: resData, error: apiError } = await supabase.functions.invoke<SentinelResponse>('sentinel');

                if (apiError) throw new Error(apiError.message);

                if (active && resData) {
                    setData(resData);
                }
            } catch (err: any) {
                console.error('[useSentinel] Fetch failed:', err);
                if (active) setError(err.message || 'Failed to fetch intelligence feed');
            } finally {
                if (active) {
                    setLoading(false);
                    setIsRefreshing(false);
                }
                isFetchingRef.current = false;
            }
        };

        // Initial fetch
        fetchSentinel(true);

        // Setup polling
        timer = setInterval(() => fetchSentinel(false), intervalMs);

        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [intervalMs]);

    return {
        data,
        loading,
        error,
        isRefreshing
    };
}
