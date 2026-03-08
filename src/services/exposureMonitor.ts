/**
 * ExposureMonitor — Continuously monitors sector exposure drift using live prices.
 *
 * Unlike PortfolioAwareSizer (which checks at position entry time only),
 * this service runs periodically to detect when price movements cause
 * sector exposure to drift beyond configured limits.
 */

import { supabase } from '@/config/supabase';
import { MarketDataService } from './marketData';
import { BrowserNotificationService } from './browserNotifications';
import {
    DEFAULT_MAX_EXPOSURE_PCT,
    DEFAULT_MAX_SECTOR_PCT,
    DEFAULT_STARTING_CAPITAL,
} from '@/config/constants';

interface ExposureSnapshot {
    totalExposurePct: number;
    sectorBreakdown: Record<string, { pct: number; usd: number; tickers: string[] }>;
    breaches: ExposureBreach[];
    timestamp: number;
}

interface ExposureBreach {
    type: 'sector' | 'total';
    sector?: string;
    currentPct: number;
    limitPct: number;
    overshootPct: number;
}

// Cooldown to avoid spamming — one alert per breach type per 30 minutes
const alertCooldowns = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

export class ExposureMonitor {
    /**
     * Compute a live exposure snapshot using current market prices.
     * This is more accurate than entry-price-based calculations.
     */
    static async getExposureSnapshot(): Promise<ExposureSnapshot> {
        // Fetch portfolio config
        const { data: config } = await supabase
            .from('portfolio_config')
            .select('*')
            .limit(1)
            .single();

        const totalCapital = config?.total_capital ?? DEFAULT_STARTING_CAPITAL;
        const maxSectorPct = config?.max_sector_exposure_pct ?? DEFAULT_MAX_SECTOR_PCT;
        const maxTotalPct = config?.max_total_exposure_pct ?? DEFAULT_MAX_EXPOSURE_PCT;

        // Fetch open positions
        const { data: positions } = await supabase
            .from('positions')
            .select('ticker, shares, entry_price')
            .eq('status', 'open');

        if (!positions || positions.length === 0) {
            return {
                totalExposurePct: 0,
                sectorBreakdown: {},
                breaches: [],
                timestamp: Date.now(),
            };
        }

        // Get sector mapping
        const tickers = positions.map(p => p.ticker).filter(Boolean);
        const { data: watchlist } = await supabase
            .from('watchlist')
            .select('ticker, sector')
            .in('ticker', tickers);

        const sectorMap: Record<string, string> = {};
        for (const w of watchlist || []) {
            if (w.ticker && w.sector) sectorMap[w.ticker] = w.sector;
        }

        // Fetch live quotes for all open positions
        const liveQuotes: Record<string, number> = {};
        await Promise.all(
            tickers.map(async (ticker) => {
                try {
                    const q = await MarketDataService.getQuote(ticker);
                    if (q?.price) liveQuotes[ticker] = q.price;
                } catch { /* use entry price as fallback */ }
            })
        );

        // Calculate exposure using live prices (fallback to entry price)
        const sectorBreakdown: Record<string, { pct: number; usd: number; tickers: string[] }> = {};
        let totalExposureUsd = 0;

        for (const pos of positions) {
            const price = liveQuotes[pos.ticker] || pos.entry_price || 0;
            const positionValue = (pos.shares || 0) * price;
            totalExposureUsd += positionValue;

            const sector = sectorMap[pos.ticker] || 'Unknown';
            if (!sectorBreakdown[sector]) {
                sectorBreakdown[sector] = { pct: 0, usd: 0, tickers: [] };
            }
            sectorBreakdown[sector].usd += positionValue;
            sectorBreakdown[sector].tickers.push(pos.ticker);
        }

        // Convert to percentages
        const totalExposurePct = totalCapital > 0 ? (totalExposureUsd / totalCapital) * 100 : 0;
        for (const [, data] of Object.entries(sectorBreakdown)) {
            data.pct = totalCapital > 0
                ? (data.usd / totalCapital) * 100
                : 0;
        }

        // Detect breaches
        const breaches: ExposureBreach[] = [];

        if (totalExposurePct > maxTotalPct) {
            breaches.push({
                type: 'total',
                currentPct: Math.round(totalExposurePct * 10) / 10,
                limitPct: maxTotalPct,
                overshootPct: Math.round((totalExposurePct - maxTotalPct) * 10) / 10,
            });
        }

        for (const [sector, data] of Object.entries(sectorBreakdown)) {
            if (data.pct > maxSectorPct) {
                breaches.push({
                    type: 'sector',
                    sector,
                    currentPct: Math.round(data.pct * 10) / 10,
                    limitPct: maxSectorPct,
                    overshootPct: Math.round((data.pct - maxSectorPct) * 10) / 10,
                });
            }
        }

        return {
            totalExposurePct: Math.round(totalExposurePct * 10) / 10,
            sectorBreakdown,
            breaches,
            timestamp: Date.now(),
        };
    }

    /**
     * Check exposure and fire alerts for any breaches.
     * Uses cooldowns to avoid notification spam.
     */
    static async checkAndAlert(): Promise<ExposureSnapshot> {
        const snapshot = await this.getExposureSnapshot();

        for (const breach of snapshot.breaches) {
            const key = breach.type === 'sector' ? `sector-${breach.sector}` : 'total';
            const lastAlert = alertCooldowns.get(key) ?? 0;

            if (Date.now() - lastAlert > COOLDOWN_MS) {
                alertCooldowns.set(key, Date.now());

                if (breach.type === 'total') {
                    BrowserNotificationService.notifyExposureBreach(breach.currentPct, breach.limitPct).catch(() => {});
                } else if (breach.type === 'sector' && breach.sector) {
                    BrowserNotificationService.notifySectorDrift(breach.sector, breach.currentPct, breach.limitPct).catch(() => {});
                }

                console.warn(`[ExposureMonitor] ${breach.type.toUpperCase()} breach: ${breach.sector || 'total'} at ${breach.currentPct}% (limit: ${breach.limitPct}%)`);
            }
        }

        return snapshot;
    }
}
