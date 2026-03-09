import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import type { SentinelResponse } from '@/types/sentinel';

// 60-second polling interval as per spec
const DEFAULT_INTERVAL_MS = 60_000;

// Retry config for initial fetch failures
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];

/**
 * Extract a meaningful error message from Supabase Edge Function errors.
 * The default client message is just "Edge Function returned a non-2xx status code"
 * which hides the actual cause (auth failure, Gemini error, etc.).
 */
async function extractErrorMessage(apiError: any): Promise<string> {
    // Try to get the actual response body from the error context
    if (apiError?.context?.body) {
        try {
            const reader = apiError.context.body.getReader();
            const { value } = await reader.read();
            if (value) {
                const text = new TextDecoder().decode(value);
                const parsed = JSON.parse(text);
                if (parsed.error) return parsed.error;
            }
        } catch {
            // Fall through to default message
        }
    }

    // Check if the error has a nested JSON message
    const msg = apiError?.message || '';
    if (msg === 'Edge Function returned a non-2xx status code') {
        return 'Edge Function failed. Check Supabase Dashboard → Edge Functions → sentinel → Logs for details.';
    }

    return msg || 'Failed to fetch intelligence feed';
}

export function useSentinel(intervalMs = DEFAULT_INTERVAL_MS) {
    const [data, setData] = useState<SentinelResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Use a ref to prevent overlapping fetches if API is slow
    const isFetchingRef = useRef(false);
    const activeRef = useRef(true);

    const fetchSentinel = useCallback(async (isInitial = false) => {
        if (isFetchingRef.current) return;

        try {
            isFetchingRef.current = true;
            if (isInitial) setLoading(true);
            else setIsRefreshing(true);

            setError(null);

            let lastError: Error | null = null;
            const attempts = isInitial ? MAX_RETRIES : 1;

            for (let attempt = 0; attempt < attempts; attempt++) {
                try {
                    const { data: resData, error: apiError } = await supabase.functions.invoke<SentinelResponse>('sentinel');

                    if (apiError) {
                        const message = await extractErrorMessage(apiError);
                        throw new Error(message);
                    }

                    if (activeRef.current && resData) {
                        setData(resData);
                    }
                    lastError = null;
                    break; // Success — exit retry loop
                } catch (err: any) {
                    lastError = err;
                    if (attempt < attempts - 1) {
                        console.warn(`[useSentinel] Attempt ${attempt + 1} failed, retrying in ${RETRY_DELAYS[attempt]}ms...`);
                        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                    }
                }
            }

            if (lastError) {
                throw lastError;
            }
        } catch (err: any) {
            console.error('[useSentinel] Fetch failed:', err);
            if (activeRef.current) setError(err.message || 'Failed to fetch intelligence feed');
        } finally {
            if (activeRef.current) {
                setLoading(false);
                setIsRefreshing(false);
            }
            isFetchingRef.current = false;
        }
    }, []);

    useEffect(() => {
        activeRef.current = true;

        // Initial fetch
        fetchSentinel(true);

        // Setup polling
        const timer = setInterval(() => fetchSentinel(false), intervalMs);

        return () => {
            activeRef.current = false;
            clearInterval(timer);
        };
    }, [intervalMs, fetchSentinel]);

    // Manual refresh callable by components
    const refresh = useCallback(() => fetchSentinel(false), [fetchSentinel]);

    return {
        data,
        loading,
        error,
        isRefreshing,
        refresh
    };
}
