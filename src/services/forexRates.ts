/**
 * Forex rates for non-React consumers (exposure / sizing services).
 *
 * Mirrors the useForex hook's source (the proxy-forex edge function, base USD)
 * and shares its sessionStorage cache so the dashboard's fetch is reused. Returns
 * null when unavailable so callers degrade to no-op (native-currency) conversion
 * rather than throwing.
 */
import { supabase } from '@/config/supabase';
import type { ForexRatesLike } from '@/utils/portfolio';

const SESSION_KEY = 'sentinel_forex_v1'; // shared with useForex
const TTL_MS = 15 * 60 * 1000;

let mem: { data: ForexRatesLike; expiresAt: number } | null = null;

function fromSession(): ForexRatesLike | null {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const { data } = JSON.parse(raw);
        if (Array.isArray(data?.rates)) return { rates: data.rates };
    } catch { /* malformed/unavailable sessionStorage — ignore */ }
    return null;
}

export async function getForexRates(): Promise<ForexRatesLike | null> {
    if (mem && Date.now() < mem.expiresAt) return mem.data;

    const session = fromSession();
    if (session) {
        mem = { data: session, expiresAt: Date.now() + TTL_MS };
        return session;
    }

    try {
        const { data, error } = await supabase.functions.invoke('proxy-forex');
        if (!error && data?.success && Array.isArray(data.rates)) {
            const rates = (data.rates as { code: string; inverseRate: number }[])
                .map(r => ({ code: r.code, inverseRate: r.inverseRate }));
            mem = { data: { rates }, expiresAt: Date.now() + TTL_MS };
            return mem.data;
        }
    } catch { /* network/edge failure — degrade to no conversion */ }

    return null;
}
