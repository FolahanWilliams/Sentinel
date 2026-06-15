/**
 * Sentinel — Shared Portfolio Calculation Utilities
 *
 * Single source of truth for P&L, exposure, and position value calculations.
 * Used by UnifiedPortfolioView, UnifiedDashboard, PortfolioSimulator, etc.
 */

import type { Quote } from '@/types/market';

export interface PositionLike {
    ticker: string;
    side: string;
    entry_price: number | null;
    shares: number | null;
    position_size_usd: number | null;
    realized_pnl?: number | null;
    currency?: string | null;
}

/** Calculate unrealized P&L for a single position, respecting long/short side. */
export function calcUnrealizedPnl(pos: PositionLike, currentPrice: number): number {
    const entryPrice = pos.entry_price ?? 0;
    const shares = pos.shares ?? 0;
    const multiplier = pos.side === 'short' ? -1 : 1;
    return (currentPrice - entryPrice) * shares * multiplier;
}

/** Calculate unrealized P&L percent for a single position. */
export function calcUnrealizedPnlPct(pos: PositionLike, currentPrice: number): number {
    const entryPrice = pos.entry_price ?? 0;
    if (entryPrice <= 0) return 0;
    const multiplier = pos.side === 'short' ? -1 : 1;
    return ((currentPrice - entryPrice) / entryPrice) * 100 * multiplier;
}

/** Get the effective current price for a position from quotes or fallback to entry. */
export function getPositionPrice(pos: PositionLike, quotes: Record<string, Quote>): number {
    return quotes[pos.ticker]?.price ?? pos.entry_price ?? 0;
}

/** Calculate position exposure (cost basis). */
export function getPositionExposure(pos: PositionLike): number {
    return pos.position_size_usd ?? ((pos.entry_price ?? 0) * (pos.shares ?? 0));
}

/** Detect currency from ticker suffix. */
export function inferCurrency(ticker: string): string {
    if (ticker.endsWith('.L')) return 'GBP';
    if (ticker.endsWith('.TO') || ticker.endsWith('.V')) return 'CAD';
    if (ticker.endsWith('.DE') || ticker.endsWith('.PA')) return 'EUR';
    if (ticker.endsWith('.AX')) return 'AUD';
    return 'USD';
}

// ── Currency normalization ──────────────────────────────────────────────────
// Portfolio totals must be summed in ONE currency. Position prices/P&L are
// stored in their native quote units, so a GBP (.L) position and a USD position
// can't be added directly. These helpers normalize everything to USD (the
// display base), via the proxy-forex feed (base USD; inverseRate = USD per unit).

/** Minimal shape of the useForex() payload needed for conversion. */
export interface ForexRatesLike {
    rates: { code: string; inverseRate: number }[];
}

// LSE (.L) equities are quoted in PENCE (GBX), not pounds — divide by 100 to get
// the major unit (GBP). If your data feed already returns pounds for .L, flip
// this to false. VERIFY against your real positions before trusting the totals.
export const LSE_QUOTES_IN_PENCE = true;

/** Divisor that turns a native quote price into its major currency unit (pence→£). */
export function majorUnitFactor(ticker: string): number {
    if (LSE_QUOTES_IN_PENCE && ticker.endsWith('.L')) return 100;
    return 1;
}

/** Convert a major-unit `amount` in `currency` to USD. Degrades to no-op when
 *  the currency is USD/unknown or forex is unavailable (never throws/NaNs). */
export function toUSD(amount: number, currency: string | null | undefined, forex: ForexRatesLike | null | undefined): number {
    const code = (currency || 'USD').toUpperCase();
    if (code === 'USD') return amount;
    const rate = forex?.rates.find(r => r.code === code)?.inverseRate;
    if (!rate || !isFinite(rate)) return amount; // no rate → leave native (better than fabricating)
    return amount * rate;
}

/** A position's native amount (price/P&L/exposure in quote units) → USD. */
export function nativeToUSD(pos: PositionLike, nativeAmount: number, forex: ForexRatesLike | null | undefined): number {
    const major = nativeAmount / majorUnitFactor(pos.ticker);
    return toUSD(major, pos.currency || inferCurrency(pos.ticker), forex);
}

/** Unrealized P&L for a position, normalized to USD. */
export function calcUnrealizedPnlUSD(pos: PositionLike, currentPrice: number, forex: ForexRatesLike | null | undefined): number {
    return nativeToUSD(pos, calcUnrealizedPnl(pos, currentPrice), forex);
}

/** Position cost-basis exposure, normalized to USD. */
export function getPositionExposureUSD(pos: PositionLike, forex: ForexRatesLike | null | undefined): number {
    return nativeToUSD(pos, getPositionExposure(pos), forex);
}

/** Stored realized P&L (native) for a closed position, normalized to USD. */
export function realizedPnlUSD(pos: PositionLike, forex: ForexRatesLike | null | undefined): number {
    return nativeToUSD(pos, pos.realized_pnl ?? 0, forex);
}
