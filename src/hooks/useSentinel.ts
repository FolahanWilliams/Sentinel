/**
 * Sentinel — useSentinel Hook (Spec §8)
 *
 * Polls the sentinel Edge Function every 60s and returns the latest
 * processed articles, briefing, and meta stats.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import type { SentinelResponse } from '@/types/sentinel';

export function useSentinel(intervalMs = 60_000) {
    const [data, setData] = useState<SentinelResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSentinel = useCallback(async () => {
        try {
            const { data: response, error: fnError } = await supabase.functions.invoke('sentinel');

            if (fnError) {
                console.error('[useSentinel] Edge Function error:', fnError.message);
                setError(fnError.message);
                return;
            }

            if (response) {
                setData(response as SentinelResponse);
                setError(null);
            }
        } catch (err) {
            console.error('[useSentinel] Fetch failed:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;

        const run = async () => {
            if (!active) return;
            await fetchSentinel();
        };

        run(); // initial fetch
        const timer = setInterval(run, intervalMs);

        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [fetchSentinel, intervalMs]);

    return { data, loading, error, refresh: fetchSentinel };
}
