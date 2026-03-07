/**
 * Sentinel — Correlation-Aware Position Guard
 *
 * Prevents concentrated sector risk by tracking active signals per sector.
 * If multiple signals fire in the same sector, subsequent ones get penalized
 * to prevent correlated losses.
 *
 * Rules:
 * - 1st signal in a sector: no penalty
 * - 2nd signal in same sector: -5 confidence
 * - 3rd+ signal in same sector: -15 confidence
 * - 5th+ signal: block entirely (too concentrated)
 *
 * Also tracks overall active signal count to prevent portfolio over-concentration.
 */

import { supabase } from '@/config/supabase';

export interface CorrelationGuardResult {
    sectorSignalCount: number;
    totalActiveSignals: number;
    sector: string;
    confidencePenalty: number;
    shouldBlock: boolean;
    reason: string;
}

// In-memory cache of active signal counts, refreshed per scan cycle
let sectorCountCache: Map<string, number> | null = null;
let totalActiveCache: number = 0;
let cacheTimestamp = 0;
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export class CorrelationGuard {

    /**
     * Refresh the cache of active signal counts per sector.
     */
    private static async refreshCache(): Promise<void> {
        if (sectorCountCache && (Date.now() - cacheTimestamp) < CACHE_TTL) return;

        try {
            const { data: activeSignals } = await supabase
                .from('signals')
                .select('ticker, status')
                .eq('status', 'active');

            if (!activeSignals) {
                sectorCountCache = new Map();
                totalActiveCache = 0;
                cacheTimestamp = Date.now();
                return;
            }

            totalActiveCache = activeSignals.length;

            // Look up sectors from watchlist
            const tickers = [...new Set(activeSignals.map(s => s.ticker))];
            const { data: watchlistEntries } = await supabase
                .from('watchlist')
                .select('ticker, sector')
                .in('ticker', tickers);

            const tickerSectorMap = new Map<string, string>();
            for (const entry of watchlistEntries || []) {
                tickerSectorMap.set(entry.ticker, entry.sector || 'Unknown');
            }

            sectorCountCache = new Map();
            for (const signal of activeSignals) {
                const sector = tickerSectorMap.get(signal.ticker) || 'Unknown';
                sectorCountCache.set(sector, (sectorCountCache.get(sector) || 0) + 1);
            }

            cacheTimestamp = Date.now();
        } catch (err) {
            console.error('[CorrelationGuard] Cache refresh error:', err);
            sectorCountCache = new Map();
            totalActiveCache = 0;
            cacheTimestamp = Date.now();
        }
    }

    /**
     * Check if a new signal for this ticker/sector should be penalized or blocked
     * based on existing active signals in the same sector.
     */
    static async check(_ticker: string, sector: string): Promise<CorrelationGuardResult> {
        await this.refreshCache();

        const sectorLower = (sector || 'Unknown').toLowerCase();
        // Find matching sector case-insensitively
        let sectorCount = 0;
        if (sectorCountCache) {
            for (const [s, count] of sectorCountCache) {
                if (s.toLowerCase() === sectorLower) {
                    sectorCount = count;
                    break;
                }
            }
        }

        let penalty = 0;
        let shouldBlock = false;
        let reason = '';

        if (sectorCount >= 5) {
            shouldBlock = true;
            penalty = -30;
            reason = `BLOCKED: ${sectorCount} active signals in ${sector}. Portfolio too concentrated in one sector.`;
        } else if (sectorCount >= 3) {
            penalty = -15;
            reason = `${sectorCount} active signals in ${sector}. Heavy sector concentration — reducing confidence.`;
        } else if (sectorCount >= 2) {
            penalty = -5;
            reason = `${sectorCount} active signals in ${sector}. Moderate sector concentration.`;
        }

        // Also penalize if total active signals are very high
        if (totalActiveCache >= 10 && !shouldBlock) {
            penalty -= 5;
            reason += ` ${totalActiveCache} total active signals — portfolio approaching max capacity.`;
        }

        if (penalty === 0 && !shouldBlock) {
            reason = `${sectorCount} active signal(s) in ${sector}. No concentration risk.`;
        }

        return {
            sectorSignalCount: sectorCount,
            totalActiveSignals: totalActiveCache,
            sector,
            confidencePenalty: penalty,
            shouldBlock,
            reason,
        };
    }

    /**
     * Invalidate cache when a new signal is created (so next check uses fresh data).
     */
    static invalidateCache(): void {
        sectorCountCache = null;
        cacheTimestamp = 0;
    }
}
