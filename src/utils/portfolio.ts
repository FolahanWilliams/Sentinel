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
