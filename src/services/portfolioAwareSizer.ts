/**
 * Sentinel — Portfolio-Aware Position Sizer
 *
 * Wraps PositionSizer.calculateSizeV2() with portfolio context:
 * 1. Checks current open exposure (sum of open position values)
 * 2. Checks remaining capital after open positions
 * 3. Checks correlation with existing positions (sector overlap)
 * 4. Reduces size if approaching max exposure or sector concentration limits
 */

import { supabase } from '@/config/supabase';
import { PositionSizer, type PositionSizeResult } from './positionSizer';
import type { TASnapshot } from '@/types/signals';
import {
    DEFAULT_MAX_EXPOSURE_PCT,
    DEFAULT_MAX_SECTOR_PCT,
    DEFAULT_MAX_CONCURRENT_POSITIONS,
} from '@/config/constants';

export interface PortfolioContext {
    totalCapital: number;
    openExposurePct: number;
    openPositionCount: number;
    sectorExposure: Record<string, number>;
    remainingCapacityPct: number;
}

export interface PortfolioAwareSizeResult extends PositionSizeResult {
    portfolioContext: PortfolioContext;
    wasReduced: boolean;
    reductionReason: string | null;
    originalRecommendedPct: number;
}

export class PortfolioAwareSizer {
    /**
     * Get current portfolio state from positions and watchlist tables.
     */
    static async getPortfolioContext(): Promise<PortfolioContext> {
        // Fetch portfolio config for total capital
        const { data: config } = await supabase
            .from('portfolio_config')
            .select('*')
            .limit(1)
            .single();

        const totalCapital = config?.total_capital || 10000;

        // Fetch open positions
        const { data: openPositions } = await supabase
            .from('positions')
            .select('ticker, shares, entry_price')
            .eq('status', 'open');

        const positions = openPositions || [];

        // Calculate total open exposure
        const openExposureUsd = positions.reduce(
            (sum, p) => sum + (p.shares || 0) * (p.entry_price || 0),
            0
        );
        const openExposurePct = totalCapital > 0
            ? (openExposureUsd / totalCapital) * 100
            : 0;

        // Get tickers to look up sectors from watchlist
        const tickers = positions.map(p => p.ticker).filter(Boolean);
        const sectorExposure: Record<string, number> = {};

        if (tickers.length > 0) {
            const { data: watchlistEntries } = await supabase
                .from('watchlist')
                .select('ticker, sector')
                .in('ticker', tickers);

            // Build a ticker -> sector map
            const tickerSectorMap: Record<string, string> = {};
            if (watchlistEntries) {
                for (const entry of watchlistEntries) {
                    if (entry.ticker && entry.sector) {
                        tickerSectorMap[entry.ticker] = entry.sector;
                    }
                }
            }

            // Accumulate sector exposure in USD, then convert to %
            const sectorUsd: Record<string, number> = {};
            for (const p of positions) {
                const sector = tickerSectorMap[p.ticker] || 'Unknown';
                const positionValue = (p.shares || 0) * (p.entry_price || 0);
                sectorUsd[sector] = (sectorUsd[sector] || 0) + positionValue;
            }

            for (const [sector, usd] of Object.entries(sectorUsd)) {
                sectorExposure[sector] = totalCapital > 0
                    ? (usd / totalCapital) * 100
                    : 0;
            }
        }

        const remainingCapacityPct = Math.max(0, DEFAULT_MAX_EXPOSURE_PCT - openExposurePct);

        return {
            totalCapital,
            openExposurePct: Math.round(openExposurePct * 100) / 100,
            openPositionCount: positions.length,
            sectorExposure,
            remainingCapacityPct: Math.round(remainingCapacityPct * 100) / 100,
        };
    }

    /**
     * Size a position with portfolio awareness.
     *
     * Calls PositionSizer.calculateSizeV2() for the base calculation,
     * then applies reductions based on current portfolio state.
     */
    static async calculateSize(
        aiConfidence: number,
        entryPrice: number,
        targetPrice: number | null,
        signalType: string,
        taSnapshot: TASnapshot | null,
        ticker: string,
        sector: string,
        confluenceScore?: number,
    ): Promise<PortfolioAwareSizeResult> {
        // 1. Get portfolio context
        const ctx = await this.getPortfolioContext();

        // 2. Get base size from V2 sizer
        const base = await PositionSizer.calculateSizeV2(
            aiConfidence,
            entryPrice,
            targetPrice,
            signalType,
            taSnapshot,
            ticker,
            confluenceScore,
        );

        const originalRecommendedPct = base.recommendedPct;
        let adjustedPct = base.recommendedPct;
        let wasReduced = false;
        let reductionReason: string | null = null;

        // 3. Check max concurrent positions
        if (ctx.openPositionCount >= DEFAULT_MAX_CONCURRENT_POSITIONS) {
            return {
                ...base,
                recommendedPct: 0,
                usdValue: 0,
                shares: 0,
                limitReason: `Max concurrent positions reached (${ctx.openPositionCount}/${DEFAULT_MAX_CONCURRENT_POSITIONS})`,
                portfolioContext: ctx,
                wasReduced: true,
                reductionReason: `Position blocked: already at max ${DEFAULT_MAX_CONCURRENT_POSITIONS} concurrent positions`,
                originalRecommendedPct,
            };
        }

        // 4. Check total portfolio exposure cap
        if (ctx.openExposurePct + adjustedPct > DEFAULT_MAX_EXPOSURE_PCT) {
            const remaining = Math.max(0, DEFAULT_MAX_EXPOSURE_PCT - ctx.openExposurePct);
            if (remaining < adjustedPct) {
                adjustedPct = remaining;
                wasReduced = true;
                reductionReason = `Reduced to fit portfolio exposure cap: ${ctx.openExposurePct.toFixed(1)}% used of ${DEFAULT_MAX_EXPOSURE_PCT}% max, ${remaining.toFixed(1)}% remaining`;
            }
        }

        // 5. Check sector concentration
        const currentSectorPct = ctx.sectorExposure[sector] || 0;
        if (currentSectorPct + adjustedPct > DEFAULT_MAX_SECTOR_PCT) {
            const sectorRoom = Math.max(0, DEFAULT_MAX_SECTOR_PCT - currentSectorPct);
            if (sectorRoom < adjustedPct) {
                adjustedPct = sectorRoom;
                wasReduced = true;
                const sectorMsg = `Sector "${sector}" concentration cap: ${currentSectorPct.toFixed(1)}% used of ${DEFAULT_MAX_SECTOR_PCT}% max, ${sectorRoom.toFixed(1)}% remaining`;
                reductionReason = reductionReason
                    ? `${reductionReason}; ${sectorMsg}`
                    : sectorMsg;
            }
        }

        // 6. If reduced to zero or negative, block the trade
        if (adjustedPct <= 0) {
            return {
                ...base,
                recommendedPct: 0,
                usdValue: 0,
                shares: 0,
                limitReason: reductionReason || 'No remaining portfolio capacity',
                portfolioContext: ctx,
                wasReduced: true,
                reductionReason,
                originalRecommendedPct,
            };
        }

        // 7. Recalculate USD value and shares with adjusted percentage
        const adjustedUsd = Math.round((adjustedPct / 100) * ctx.totalCapital * 100) / 100;
        const adjustedShares = entryPrice > 0 ? Math.floor(adjustedUsd / entryPrice) : 0;

        return {
            ...base,
            recommendedPct: Math.round(adjustedPct * 100) / 100,
            usdValue: adjustedUsd,
            shares: adjustedShares,
            limitReason: wasReduced ? (reductionReason || base.limitReason) : base.limitReason,
            portfolioContext: ctx,
            wasReduced,
            reductionReason,
            originalRecommendedPct,
        };
    }
}
