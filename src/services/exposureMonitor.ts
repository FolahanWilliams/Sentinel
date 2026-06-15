/**
 * ExposureMonitor — Continuously monitors sector exposure drift using live prices.
 *
 * Enhanced with:
 * - Configurable check intervals (stored in localStorage)
 * - Drawdown monitoring with severity levels
 * - Price alert checking (stop loss / target hit)
 * - Breach severity levels (approaching / breached / critical)
 */

import { supabase } from '@/config/supabase';
import { MarketDataService } from './marketData';
import { BrowserNotificationService } from './browserNotifications';
import { getForexRates } from './forexRates';
import { toUSD, inferCurrency } from '@/utils/portfolio';
import {
    DEFAULT_MAX_EXPOSURE_PCT,
    DEFAULT_MAX_SECTOR_PCT,
    DEFAULT_STARTING_CAPITAL,
} from '@/config/constants';

export interface ExposureSnapshot {
    totalExposurePct: number;
    sectorBreakdown: Record<string, { pct: number; usd: number; tickers: string[] }>;
    breaches: ExposureBreach[];
    totalPortfolioValue: number;
    drawdownPct: number | null;
    timestamp: number;
}

export interface ExposureBreach {
    type: 'sector' | 'total';
    sector?: string;
    currentPct: number;
    limitPct: number;
    overshootPct: number;
    severity: 'approaching' | 'breached' | 'critical';
}

const SETTINGS_KEY = 'sentinel_exposure_settings';
const PEAK_VALUE_KEY = 'sentinel_portfolio_peak';

export interface ExposureSettings {
    checkIntervalMs: number;
    drawdownWarningPct: number;
    drawdownCriticalPct: number;
    priceAlertsEnabled: boolean;
}

const DEFAULT_SETTINGS: ExposureSettings = {
    checkIntervalMs: 5 * 60 * 1000, // 5 minutes
    drawdownWarningPct: 5,
    drawdownCriticalPct: 10,
    priceAlertsEnabled: true,
};

// Cooldown to avoid spamming — one alert per breach type per 30 minutes
const alertCooldowns = new Map<string, number>();
const COOLDOWN_MS = 30 * 60 * 1000;

export class ExposureMonitor {

    static getSettings(): ExposureSettings {
        try {
            const stored = localStorage.getItem(SETTINGS_KEY);
            if (stored) return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        } catch { /* ignore */ }
        return { ...DEFAULT_SETTINGS };
    }

    static saveSettings(settings: ExposureSettings): void {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }

    static getCheckInterval(): number {
        return this.getSettings().checkIntervalMs;
    }

    /**
     * Compute a live exposure snapshot using current market prices.
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
                totalPortfolioValue: totalCapital,
                drawdownPct: null,
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

        // Fetch live quotes for all open positions (batched)
        const liveQuotes: Record<string, number> = {};
        try {
            const bulkQuotes = await MarketDataService.getQuotesBulk(tickers);
            for (const [ticker, q] of Object.entries(bulkQuotes)) {
                if (q?.price) liveQuotes[ticker] = q.price;
            }
        } catch {
            // Fallback: fetch individually
            await Promise.all(
                tickers.map(async (ticker) => {
                    try {
                        const q = await MarketDataService.getQuote(ticker);
                        if (q?.price) liveQuotes[ticker] = q.price;
                    } catch { /* use entry price as fallback */ }
                })
            );
        }

        // Calculate exposure using live prices (fallback to entry price),
        // normalized to USD so GBP (.L) and USD positions sum coherently.
        const forex = await getForexRates();
        const sectorBreakdown: Record<string, { pct: number; usd: number; tickers: string[] }> = {};
        let totalExposureUsd = 0;

        for (const pos of positions) {
            const price = liveQuotes[pos.ticker] || pos.entry_price || 0;
            const positionValue = toUSD((pos.shares || 0) * price, inferCurrency(pos.ticker), forex);
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

        // Detect breaches with severity
        const breaches: ExposureBreach[] = [];

        if (totalExposurePct > maxTotalPct) {
            const overshoot = totalExposurePct - maxTotalPct;
            breaches.push({
                type: 'total',
                currentPct: Math.round(totalExposurePct * 10) / 10,
                limitPct: maxTotalPct,
                overshootPct: Math.round(overshoot * 10) / 10,
                severity: overshoot > maxTotalPct * 0.1 ? 'critical' : 'breached',
            });
        } else if (totalExposurePct > maxTotalPct * 0.95) {
            // Approaching breach (within 5% of limit)
            breaches.push({
                type: 'total',
                currentPct: Math.round(totalExposurePct * 10) / 10,
                limitPct: maxTotalPct,
                overshootPct: 0,
                severity: 'approaching',
            });
        }

        for (const [sector, data] of Object.entries(sectorBreakdown)) {
            if (data.pct > maxSectorPct) {
                const overshoot = data.pct - maxSectorPct;
                breaches.push({
                    type: 'sector',
                    sector,
                    currentPct: Math.round(data.pct * 10) / 10,
                    limitPct: maxSectorPct,
                    overshootPct: Math.round(overshoot * 10) / 10,
                    severity: overshoot > maxSectorPct * 0.1 ? 'critical' : 'breached',
                });
            }
        }

        // Calculate drawdown
        const totalCostBasisUsd = positions.reduce((s, p) => s + toUSD((p.shares || 0) * (p.entry_price || 0), inferCurrency(p.ticker), forex), 0);
        const totalPortfolioValue = totalCapital + (totalExposureUsd - totalCostBasisUsd);
        const drawdownPct = this.computeDrawdown(totalPortfolioValue);

        return {
            totalExposurePct: Math.round(totalExposurePct * 10) / 10,
            sectorBreakdown,
            breaches,
            totalPortfolioValue,
            drawdownPct,
            timestamp: Date.now(),
        };
    }

    /**
     * Track drawdown from peak portfolio value.
     */
    private static computeDrawdown(currentValue: number): number | null {
        try {
            const storedPeak = localStorage.getItem(PEAK_VALUE_KEY);
            let peak = storedPeak ? parseFloat(storedPeak) : currentValue;

            if (currentValue > peak) {
                peak = currentValue;
                localStorage.setItem(PEAK_VALUE_KEY, String(peak));
            }

            if (peak <= 0) return null;
            const drawdown = ((peak - currentValue) / peak) * 100;
            return Math.round(drawdown * 10) / 10;
        } catch {
            return null;
        }
    }

    /**
     * Check exposure, drawdown, and fire alerts for any breaches.
     */
    static async checkAndAlert(): Promise<ExposureSnapshot> {
        const snapshot = await this.getExposureSnapshot();
        const settings = this.getSettings();

        // Exposure breach alerts
        for (const breach of snapshot.breaches) {
            if (breach.severity === 'approaching') continue; // Don't notify for approaching
            const key = breach.type === 'sector' ? `sector-${breach.sector}` : 'total';
            const lastAlert = alertCooldowns.get(key) ?? 0;

            if (Date.now() - lastAlert > COOLDOWN_MS) {
                alertCooldowns.set(key, Date.now());

                if (breach.type === 'total') {
                    BrowserNotificationService.notifyExposureBreach(breach.currentPct, breach.limitPct).catch(() => {});
                } else if (breach.type === 'sector' && breach.sector) {
                    BrowserNotificationService.notifySectorDrift(breach.sector, breach.currentPct, breach.limitPct).catch(() => {});
                }

                console.warn(`[ExposureMonitor] ${breach.severity.toUpperCase()} ${breach.type} breach: ${breach.sector || 'total'} at ${breach.currentPct}% (limit: ${breach.limitPct}%)`);
            }
        }

        // Drawdown alerts
        if (snapshot.drawdownPct !== null && snapshot.drawdownPct > 0) {
            const ddKey = `drawdown-${snapshot.drawdownPct >= settings.drawdownCriticalPct ? 'critical' : 'warning'}`;
            const lastAlert = alertCooldowns.get(ddKey) ?? 0;

            if (Date.now() - lastAlert > COOLDOWN_MS) {
                if (snapshot.drawdownPct >= settings.drawdownCriticalPct) {
                    alertCooldowns.set(ddKey, Date.now());
                    const scalingFactor = Math.max(0.25, 1 - (snapshot.drawdownPct / 100));
                    BrowserNotificationService.notifyDrawdown(snapshot.drawdownPct, scalingFactor).catch(() => {});
                } else if (snapshot.drawdownPct >= settings.drawdownWarningPct) {
                    alertCooldowns.set(ddKey, Date.now());
                    const scalingFactor = Math.max(0.5, 1 - (snapshot.drawdownPct / 100));
                    BrowserNotificationService.notifyDrawdown(snapshot.drawdownPct, scalingFactor).catch(() => {});
                }
            }
        }

        // Price alert checking (stop loss / target hit)
        if (settings.priceAlertsEnabled) {
            await this.checkPriceAlerts().catch(() => {});
        }

        return snapshot;
    }

    /**
     * Check open positions against their stop/target. Levels are read from the
     * position itself (side-aware), so manual positions and adjusted stops are
     * covered; for legacy positions without their own levels we fall back to the
     * linked signal's.
     */
    private static async checkPriceAlerts(): Promise<void> {
        const { data: positions } = await supabase
            .from('positions')
            .select('id, ticker, side, signal_id, stop_loss, target_price')
            .eq('status', 'open');

        if (!positions || positions.length === 0) return;

        // Back-compat: positions with no own levels but a linked signal inherit the signal's.
        const needSignal = positions.filter(
            p => p.stop_loss == null && p.target_price == null && p.signal_id,
        );
        const signalMap = new Map<string, { stop_loss: number | null; target_price: number | null }>();
        if (needSignal.length > 0) {
            const ids = needSignal.map(p => p.signal_id).filter((id): id is string => Boolean(id));
            const { data: signals } = await supabase
                .from('signals')
                .select('id, stop_loss, target_price')
                .in('id', ids);
            for (const s of signals ?? []) signalMap.set(s.id, s);
        }

        for (const pos of positions) {
            const ownLevels = pos.stop_loss != null || pos.target_price != null;
            const levels = ownLevels
                ? { stop_loss: pos.stop_loss, target_price: pos.target_price }
                : pos.signal_id ? signalMap.get(pos.signal_id) : null;
            const stop = typeof levels?.stop_loss === 'number' ? levels.stop_loss : null;
            const target = typeof levels?.target_price === 'number' ? levels.target_price : null;
            if (stop == null && target == null) continue;

            const isShort = pos.side === 'short';

            try {
                const quote = await MarketDataService.getQuote(pos.ticker);
                if (!quote?.price) continue;
                const price = quote.price;

                // Stop hit — side-aware (short stops are above entry, long stops below).
                if (stop != null && (isShort ? price >= stop : price <= stop)) {
                    const key = `stop-${pos.ticker}`;
                    if (Date.now() - (alertCooldowns.get(key) ?? 0) > COOLDOWN_MS) {
                        alertCooldowns.set(key, Date.now());
                        BrowserNotificationService.notifyStopHit(pos.ticker, price, stop).catch(() => {});
                    }
                }

                // Target hit — side-aware.
                if (target != null && (isShort ? price <= target : price >= target)) {
                    const key = `target-${pos.ticker}`;
                    if (Date.now() - (alertCooldowns.get(key) ?? 0) > COOLDOWN_MS) {
                        alertCooldowns.set(key, Date.now());
                        BrowserNotificationService.notifyTargetHit(pos.ticker, price, target).catch(() => {});
                    }
                }
            } catch { /* non-fatal */ }
        }
    }
}
