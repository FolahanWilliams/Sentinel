import { supabase } from '@/config/supabase';

export interface EarningsResult {
    hasUpcomingEarnings: boolean;
    daysUntilEarnings: number;
    earningsDate?: string;
}

export class EarningsCalendarService {
    /**
     * Last-resort static cache for the major indices, used only if the live
     * source is unreachable. These dates go stale — the real path is the
     * `earnings` proxy endpoint (Yahoo calendarEvents, keyless; Finnhub fallback).
     */
    private static readonly STATIC_FALLBACK: Record<string, string> = {
        AAPL: '2026-04-30', MSFT: '2026-04-23', AMZN: '2026-04-25', NVDA: '2026-05-20',
        META: '2026-04-24', GOOGL: '2026-04-23', TSLA: '2026-04-19', 'BRK.B': '2026-05-02',
        JPM: '2026-04-12', V: '2026-04-23', JNJ: '2026-04-16', SHEL: '2026-05-01',
        HSBA: '2026-04-28', ULVR: '2026-04-25',
    };

    private static daysUntil(dateStr: string): number {
        const diffMs = new Date(dateStr + 'T00:00:00Z').getTime() - Date.now();
        return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    }

    /**
     * Next earnings date for any ticker. Hits the live `earnings` proxy endpoint
     * first (real data, no key required); falls back to the static cache only
     * when the proxy is unreachable.
     */
    static async getUpcomingEarnings(ticker: string, thresholdDays = 7): Promise<EarningsResult> {
        const uTicker = ticker.toUpperCase();

        try {
            const { data, error } = await supabase.functions.invoke('proxy-market-data', {
                body: { endpoint: 'earnings', ticker: uTicker },
            });
            if (!error && data?.success && data.data?.earningsDate) {
                const earningsDate: string = data.data.earningsDate;
                const daysUntilEarnings = typeof data.data.daysUntil === 'number'
                    ? data.data.daysUntil
                    : this.daysUntil(earningsDate);
                return {
                    hasUpcomingEarnings: daysUntilEarnings >= 0 && daysUntilEarnings <= thresholdDays,
                    daysUntilEarnings,
                    earningsDate,
                };
            }
            // Proxy reachable but found no scheduled earnings → treat as none.
            if (!error && data?.success) {
                return { hasUpcomingEarnings: false, daysUntilEarnings: 999 };
            }
        } catch (e) {
            console.warn(`[EarningsCalendar] Live earnings fetch failed for ${uTicker}, falling back to static cache:`, e);
        }

        return this.checkStaticFallback(uTicker, thresholdDays);
    }

    private static checkStaticFallback(uTicker: string, thresholdDays: number): EarningsResult {
        const dateStr = this.STATIC_FALLBACK[uTicker];
        if (!dateStr) {
            return { hasUpcomingEarnings: false, daysUntilEarnings: 999 };
        }
        const daysUntilEarnings = this.daysUntil(dateStr);
        if (daysUntilEarnings >= 0 && daysUntilEarnings <= thresholdDays) {
            return { hasUpcomingEarnings: true, daysUntilEarnings, earningsDate: dateStr };
        }
        return {
            hasUpcomingEarnings: false,
            daysUntilEarnings: daysUntilEarnings > 0 ? daysUntilEarnings : 999,
            earningsDate: dateStr,
        };
    }
}
