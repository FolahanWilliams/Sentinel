/**
 * Sentinel — Position Sizing Engine
 *
 * v2: Now supports calibrated confidence via ConfidenceCalibrator,
 * ATR-based stops, trailing stop suggestions, and comparison of
 * three sizing methods (fixed %, risk-based, Kelly).
 */

import { supabase } from '@/config/supabase';
import type { TASnapshot } from '@/types/signals';
import { ConfidenceCalibrator } from './confidenceCalibrator';

export interface PositionSizeResult {
    recommendedPct: number;
    usdValue: number;
    shares?: number;
    limitReason: string | null;
    method: 'fixed_pct' | 'risk_based' | 'kelly';
    stopLoss: number | null;
    trailingStopRule: string | null;
    riskRewardRatio: number | null;
    comparisons: {
        fixedPct: { pct: number; usd: number };
        riskBased: { pct: number; usd: number };
        kelly: { pct: number; usd: number } | null;
    };
}

export class PositionSizer {

    /**
     * Original v1 method — kept for backward compatibility.
     */
    static async calculateSize(
        winRate: number,
        avgWinPct: number,
        avgLossPct: number,
        overrideFraction?: number
    ): Promise<{ recommendedPct: number; usdValue: number; limitReason: string | null }> {
        const { data: config, error } = await supabase
            .from('portfolio_config')
            .select('*')
            .limit(1)
            .single();

        if (error || !config) {
            console.warn('[PositionSizer] Failed to load config, using conservative defaults', error);
            return { recommendedPct: 1.0, usdValue: 0, limitReason: 'No portfolio config — using conservative 1%' };
        }

        if (avgLossPct === 0 || winRate === 0) {
            return { recommendedPct: 0, usdValue: 0, limitReason: 'Invalid edge stats' };
        }

        const winLossRatio = avgWinPct / avgLossPct;
        const kellyPct = winRate - ((1 - winRate) / winLossRatio);
        const kellyFraction = overrideFraction || config.kelly_fraction;
        let recommendedPct = (kellyPct * kellyFraction) * 100;

        if (recommendedPct <= 0) {
            return { recommendedPct: 0, usdValue: 0, limitReason: 'Negative edge' };
        }

        let limitReason = null;

        if (recommendedPct > config.max_position_pct) {
            recommendedPct = config.max_position_pct;
            limitReason = 'Hit max position limit';
        }

        const riskImpliedPct = (config.risk_per_trade_pct / (avgLossPct * 100)) * 100;
        if (recommendedPct > riskImpliedPct) {
            recommendedPct = riskImpliedPct;
            limitReason = 'Hit risk-per-trade limit';
        }

        const usdValue = (recommendedPct / 100) * config.total_capital;

        return {
            recommendedPct: Math.round(recommendedPct * 100) / 100,
            usdValue: Math.round(usdValue * 100) / 100,
            limitReason
        };
    }

    /**
     * V2: Dynamic position sizing using ACTUAL historical win-rate per category + ATR risk.
     * Uses DB lookup for real win rates instead of AI confidence as proxy.
     * Now supports dynamic stop sizing based on confluence strength.
     */
    static async calculateSizeV2(
        aiConfidence: number,
        entryPrice: number,
        targetPrice: number | null,
        signalType: string,
        taSnapshot: TASnapshot | null,
        _ticker?: string,
        confluenceScore?: number,
    ): Promise<PositionSizeResult> {
        // 1. Fetch config
        const { data: config, error } = await supabase
            .from('portfolio_config')
            .select('*')
            .limit(1)
            .single();

        if (error || !config) {
            return {
                recommendedPct: 1.0,
                usdValue: 0,
                shares: 0,
                limitReason: 'No portfolio config — conservative 1%',
                method: 'fixed_pct',
                stopLoss: null,
                trailingStopRule: null,
                riskRewardRatio: null,
                comparisons: {
                    fixedPct: { pct: 1.0, usd: 0 },
                    riskBased: { pct: 1.0, usd: 0 },
                    kelly: null,
                }
            };
        }

        const totalCapital = config.total_capital || 10000;

        // 2. Get ACTUAL win rate from DB — per signal_type, with optional ticker specificity
        let actualWinRate: number | null = null;
        try {
            const { data: typeOutcomes } = await supabase
                .from('signal_outcomes')
                .select('outcome, signals!inner(signal_type)')
                .neq('outcome', 'pending')
                .limit(100);

            if (typeOutcomes && typeOutcomes.length >= 5) {
                // Filter to matching signal type
                const matching = typeOutcomes.filter((o: any) => o.signals?.signal_type === signalType);
                if (matching.length >= 5) {
                    const wins = matching.filter((o: any) => o.outcome === 'win').length;
                    actualWinRate = wins / matching.length;
                    console.log(`[PositionSizer] Actual DB win rate for ${signalType}: ${(Number(actualWinRate) * 100).toFixed(1)}% (n=${matching.length})`);
                }
            }
        } catch { /* fall through to calibrator */ }

        // Use actual DB win rate if available, otherwise fall back to calibrated AI confidence
        let calibratedWinRate: number;
        if (actualWinRate !== null) {
            calibratedWinRate = actualWinRate;
        } else {
            const curve = await ConfidenceCalibrator.getCachedCurve();
            calibratedWinRate = ConfidenceCalibrator.getCalibratedWinRate(aiConfidence, curve) / 100;
        }

        // Cap portfolio exposure at 25% max per position
        const maxExposurePct = Math.min(config.max_position_pct || 10, 25);

        // 3. Get historical avg win/loss from signal outcomes
        const { data: outcomes } = await supabase
            .from('signal_outcomes')
            .select('outcome, return_at_5d, return_at_10d')
            .neq('outcome', 'pending')
            .limit(100);

        let avgWinPct = 0.10; // default 10%
        let avgLossPct = 0.05; // default 5%

        if (outcomes && outcomes.length >= 5) {
            const wins = outcomes.filter(o => o.outcome === 'win');
            const losses = outcomes.filter(o => o.outcome === 'loss');
            if (wins.length > 0) {
                avgWinPct = Math.abs(wins.reduce((s, o) => s + (o.return_at_5d || o.return_at_10d || 0), 0) / wins.length) / 100;
            }
            if (losses.length > 0) {
                avgLossPct = Math.abs(losses.reduce((s, o) => s + (o.return_at_5d || o.return_at_10d || 0), 0) / losses.length) / 100;
            }
        }

        // 4. ATR-based stop loss — dynamic multiplier based on confluence strength
        //    Strong confluence → tighter stops (1.0x ATR) — higher conviction
        //    Weak confluence → wider stops (2.0x ATR) — more room for uncertainty
        let stopLoss: number | null = null;
        let trailingStopRule: string | null = null;
        let stopDistancePct = avgLossPct; // fallback

        if (taSnapshot?.atr14 && entryPrice > 0) {
            let atrMultiplier = 1.5; // default
            if (confluenceScore !== undefined) {
                if (confluenceScore >= 75) atrMultiplier = 1.0;       // strong confluence = tight stop
                else if (confluenceScore >= 55) atrMultiplier = 1.25; // moderate
                else if (confluenceScore >= 35) atrMultiplier = 1.75; // weak
                else atrMultiplier = 2.0;                             // very weak = wide stop
            }

            stopLoss = Math.round((entryPrice - taSnapshot.atr14 * atrMultiplier) * 100) / 100;
            stopDistancePct = (taSnapshot.atr14 * atrMultiplier) / entryPrice;
            const breakevenTarget = entryPrice + taSnapshot.atr14;
            trailingStopRule = `ATR stop: ${atrMultiplier}x ATR ($${Number(taSnapshot.atr14 * atrMultiplier).toFixed(2)} risk). Move stop to breakeven ($${Number(entryPrice).toFixed(2)}) after +1x ATR ($${Number(breakevenTarget).toFixed(2)}). Trail by ${atrMultiplier}x ATR.`;
        }

        // 5. Method 1: Fixed percentage (simple)
        const fixedPct = config.risk_per_trade_pct || 2.0;
        const fixedUsd = (fixedPct / 100) * totalCapital;

        // 6. Method 2: Risk-based (risk per trade / stop distance)
        let riskBasedPct = fixedPct;
        if (stopDistancePct > 0) {
            riskBasedPct = (config.risk_per_trade_pct / (stopDistancePct * 100)) * 100;
            riskBasedPct = Math.min(riskBasedPct, maxExposurePct);
        }
        const riskBasedUsd = (riskBasedPct / 100) * totalCapital;

        // 7. Method 3: Kelly (calibrated)
        let kellyResult: { pct: number; usd: number } | null = null;
        if (calibratedWinRate > 0 && avgLossPct > 0) {
            const winLossRatio = avgWinPct / avgLossPct;
            const rawKelly = calibratedWinRate - ((1 - calibratedWinRate) / winLossRatio);
            const kellyFraction = config.kelly_fraction || 0.25;
            let kellyPct = rawKelly * kellyFraction * 100;

            if (kellyPct > 0) {
                kellyPct = Math.min(kellyPct, maxExposurePct);
                kellyResult = {
                    pct: Math.round(kellyPct * 100) / 100,
                    usd: Math.round((kellyPct / 100) * totalCapital * 100) / 100,
                };
            }
        }

        // 8. Choose the most conservative method
        let recommendedPct = fixedPct;
        let method: PositionSizeResult['method'] = 'fixed_pct';

        if (kellyResult && kellyResult.pct < recommendedPct && kellyResult.pct > 0) {
            recommendedPct = kellyResult.pct;
            method = 'kelly';
        }
        if (riskBasedPct < recommendedPct && riskBasedPct > 0) {
            recommendedPct = riskBasedPct;
            method = 'risk_based';
        }

        // Enforce caps
        let limitReason: string | null = null;
        if (recommendedPct > (maxExposurePct)) {
            recommendedPct = maxExposurePct;
            limitReason = 'Hit max position limit';
        }

        // 9. Risk:Reward ratio
        let riskRewardRatio: number | null = null;
        if (stopLoss && targetPrice && entryPrice > 0) {
            const risk = Math.abs(entryPrice - stopLoss);
            const reward = Math.abs(targetPrice - entryPrice);
            riskRewardRatio = risk > 0 ? Math.round((reward / risk) * 10) / 10 : null;
        }

        const finalUsdValue = Math.round((recommendedPct / 100) * totalCapital * 100) / 100;

        return {
            recommendedPct: Math.round(recommendedPct * 100) / 100,
            usdValue: finalUsdValue,
            shares: entryPrice > 0 ? Math.floor(finalUsdValue / entryPrice) : 0,
            limitReason,
            method,
            stopLoss,
            trailingStopRule,
            riskRewardRatio,
            comparisons: {
                fixedPct: { pct: Math.round(fixedPct * 100) / 100, usd: Math.round(fixedUsd * 100) / 100 },
                riskBased: { pct: Math.round(riskBasedPct * 100) / 100, usd: Math.round(riskBasedUsd * 100) / 100 },
                kelly: kellyResult,
            }
        };
    }
}
