/**
 * Sentinel — useSentinel Hook (Spec §8)
 *
 * Polls the sentinel Edge Function every 60s and returns the latest
 * processed articles, briefing, and meta stats.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/config/supabase';
import type { SentinelResponse } from '@/types/sentinel';

export function useSentinel(intervalMs = 60_000) {
    const [data, setData] = useState<SentinelResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const consecutiveErrors = useRef(0);

    const fetchSentinel = useCallback(async () => {
        try {
            const { data: response, error: fnError } = await supabase.functions.invoke('sentinel');

            if (fnError) {
                // Extract the actual error body — supabase-js still returns
                // the response payload in `response` even on non-2xx status
                const detail = response?.error || fnError.message;
                console.error('[useSentinel] Edge Function error:', detail, response);
                setError(detail);
                consecutiveErrors.current++;
                return;
            }

            if (response) {
                setData(response as SentinelResponse);
                setError(null);
                consecutiveErrors.current = 0;
            }
        } catch (err) {
            console.error('[useSentinel] Fetch failed:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
            consecutiveErrors.current++;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        let timer: ReturnType<typeof setTimeout>;

        const schedule = () => {
            // Back off on repeated errors: 60s → 120s → 240s, max 5 min
            const backoff = Math.min(
                intervalMs * Math.pow(2, consecutiveErrors.current),
                5 * 60_000,
            );
            const delay = consecutiveErrors.current > 0 ? backoff : intervalMs;
            timer = setTimeout(async () => {
                if (!active) return;
                await fetchSentinel();
                if (active) schedule();
            }, delay);
        };

        // Initial fetch, then start schedule
        fetchSentinel().then(() => { if (active) schedule(); });

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [fetchSentinel, intervalMs]);

    return { data, loading, error, refresh: fetchSentinel };
}
