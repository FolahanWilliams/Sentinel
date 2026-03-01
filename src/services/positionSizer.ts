/**
 * Sentinel — Position Sizing Engine
 *
 * Implements Half-Kelly Criterion sizing based on historical win rates
 * and user-defined risk parameters in the portfolio_config table.
 */

import { supabase } from '@/config/supabase';

export class PositionSizer {

    /**
     * Calculates the optimal position size allocation percentage using the Kelly Criterion.
     * Modifies it by a fraction (e.g., 0.5 for Half-Kelly, 0.25 for Quarter-Kelly) for safety.
     */
    static async calculateSize(
        winRate: number,       // decimal, e.g., 0.65 for 65%
        avgWinPct: number,     // decimal, e.g., 0.15 for +15%
        avgLossPct: number,    // positive decimal, e.g., 0.05 for -5%
        overrideFraction?: number // optional override of the config defaults
    ): Promise<{ recommendedPct: number; usdValue: number; limitReason: string | null }> {

        // 1. Fetch live portfolio configuration
        const { data: config, error } = await supabase
            .from('portfolio_config')
            .select('*')
            .limit(1)
            .single();

        if (error || !config) {
            console.warn('[PositionSizer] Failed to load config, falling back to defaults', error);
            return { recommendedPct: 2.0, usdValue: 200, limitReason: 'Fallback defaults' };
        }

        // Protect against division by zero or invalid stats
        if (avgLossPct === 0 || winRate === 0) {
            return { recommendedPct: 0, usdValue: 0, limitReason: 'Invalid edge stats' };
        }

        // 2. Core Kelly Math
        // W = Win probability
        // R = Win/Loss Ratio = (avgWin / avgLoss)
        // Kelly % = W - ((1 - W) / R)

        const winLossRatio = avgWinPct / avgLossPct;
        let kellyPct = winRate - ((1 - winRate) / winLossRatio);

        // 3. Apply the dampener fraction (Half-Kelly, Quarter-Kelly)
        const kellyFraction = overrideFraction || config.kelly_fraction;
        let recommendedPct = (kellyPct * kellyFraction) * 100; // Convert to whole %

        // If edge is negative, no trade
        if (recommendedPct <= 0) {
            return { recommendedPct: 0, usdValue: 0, limitReason: 'Negative edge' };
        }

        let limitReason = null;

        // 4. Run Risk Checks
        // Check against absolute max size
        if (recommendedPct > config.max_position_pct) {
            recommendedPct = config.max_position_pct;
            limitReason = 'Hit max position limit';
        }

        // Check against max risk per trade (if we get stopped out, does it violate risk tolerance?)
        // E.g. If stop is 5% away, and risk tolerance is 2% of portfolio, max max size is 40% of portfolio.
        const riskImpliedPct = (config.risk_per_trade_pct / (avgLossPct * 100)) * 100;
        if (recommendedPct > riskImpliedPct) {
            recommendedPct = riskImpliedPct;
            limitReason = 'Hit risk-per-trade limit';
        }

        // 5. Calculate USD Value
        const usdValue = (recommendedPct / 100) * config.total_capital;

        return {
            recommendedPct: Math.round(recommendedPct * 100) / 100, // Round to 2 decimals
            usdValue: Math.round(usdValue * 100) / 100,
            limitReason
        };
    }
}
