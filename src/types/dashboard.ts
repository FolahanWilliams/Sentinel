/**
 * Sentinel — Unified Dashboard Types
 *
 * Extended types for the unified trading dashboard combining
 * signals, portfolio, watchlist, and performance views.
 */

import type { Signal } from './signals';
import type { Quote } from './market';

/** Signal enriched with projected ROI, historical win rate, and ATR stop */
export interface UnifiedSignal extends Signal {
    /** Live quote data fetched from proxy-market-data */
    liveQuote?: Quote | null;
    /** ATR-based dynamic stop loss */
    atrStop?: number | null;
}

/** Summary metrics for the portfolio tab */
export interface PortfolioSummary {
    totalValue: number;
    totalCash: number;
    totalExposure: number;
    exposurePct: number;
    unrealizedPnl: number;
    unrealizedPnlPct: number;
    realizedPnl: number;
    realizedPnlPct: number;
    totalPnl: number;
    totalPnlPct: number;
    maxDrawdown: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    openPositionCount: number;
    closedPositionCount: number;
    riskPct: number;
}

/** Sector allocation for donut chart */
export interface SectorAllocation {
    sector: string;
    value: number;
    color: string;
}

/** Performance chart data point */
export interface PerformanceDataPoint {
    date: string;
    value: number;
}

/** Win rate breakdown by signal category */
export interface CategoryWinRate {
    category: string;
    wins: number;
    losses: number;
    total: number;
    winRate: number;
    avgReturn: number;
}

/** Tab names for the unified dashboard */
export type DashboardTab = 'signals' | 'portfolio' | 'watchlist' | 'performance' | 'intelligence';
