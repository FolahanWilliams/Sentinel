/**
 * Sentinel — Adaptive Signal Thresholds
 *
 * Static thresholds (-5% drop, 50 min confidence) fail in different regimes:
 * - In high-vol (VIX>30), -5% is noise, not signal
 * - In low-vol (VIX<15), -3% might be significant
 *
 * This service adjusts thresholds based on current market regime.
 */

import { supabase } from '@/config/supabase';
import { MarketRegimeFilter, type MarketRegimeResult } from './marketRegime';
import { DEFAULT_MIN_CONFIDENCE, DEFAULT_MIN_PRICE_DROP_PCT } from '@/config/constants';

export interface AdaptiveThresholdResult {
    minPriceDropPct: number;       // Adjusted minimum price drop to trigger analysis
    minConfidence: number;          // Adjusted minimum confidence to save signal
    regime: string;
    vix: number | null;
    adjustmentReason: string;
}

export class AdaptiveThresholds {
    private static cached: AdaptiveThresholdResult | null = null;
    private static cacheTimestamp = 0;
    private static readonly CACHE_TTL = 2 * 60 * 60 * 1000; // Match regime cache

    /**
     * Get dynamically adjusted thresholds based on current market regime.
     *
     * - crisis  (VIX >= 35): minDrop = -8%, minConfidence = 65
     * - correction (VIX 25–35): minDrop = -7%, minConfidence = 60
     * - neutral: use defaults (-5%, 50)
     * - bull (VIX < 18): minDrop = -3%, minConfidence = 50
     */
    static async getThresholds(): Promise<AdaptiveThresholdResult> {
        // Return cached result if fresh
        if (this.cached && (Date.now() - this.cacheTimestamp) < this.CACHE_TTL) {
            return this.cached;
        }

        try {
            const regime = await MarketRegimeFilter.detect();
            const result = this.computeThresholds(regime);

            this.cached = result;
            this.cacheTimestamp = Date.now();

            console.log(
                `[AdaptiveThresholds] ${result.regime.toUpperCase()}: ` +
                `minDrop=${result.minPriceDropPct}%, minConfidence=${result.minConfidence} ` +
                `(VIX=${result.vix ?? 'N/A'})`
            );

            return result;

        } catch (err) {
            console.error('[AdaptiveThresholds] Error detecting regime, using defaults:', err);

            const fallback: AdaptiveThresholdResult = {
                minPriceDropPct: DEFAULT_MIN_PRICE_DROP_PCT,
                minConfidence: DEFAULT_MIN_CONFIDENCE,
                regime: 'neutral',
                vix: null,
                adjustmentReason: 'Unable to detect market regime — using default thresholds.',
            };

            this.cached = fallback;
            this.cacheTimestamp = Date.now();
            return fallback;
        }
    }

    /**
     * Map regime classification to concrete threshold values.
     */
    private static computeThresholds(regime: MarketRegimeResult): AdaptiveThresholdResult {
        switch (regime.regime) {
            case 'crisis':
                return {
                    minPriceDropPct: -8,
                    minConfidence: 65,
                    regime: regime.regime,
                    vix: regime.vixLevel,
                    adjustmentReason:
                        `Crisis regime (VIX ${regime.vixLevel ?? '>=35'}): ` +
                        `tightened to -8% drop / 65 confidence. ` +
                        `In extreme volatility, only large moves with high conviction are actionable.`,
                };

            case 'correction':
                return {
                    minPriceDropPct: -7,
                    minConfidence: 60,
                    regime: regime.regime,
                    vix: regime.vixLevel,
                    adjustmentReason:
                        `Correction regime (VIX ${regime.vixLevel ?? '25-35'}): ` +
                        `tightened to -7% drop / 60 confidence. ` +
                        `Elevated fear means many stocks are dropping — filter for stronger signals.`,
                };

            case 'bull':
                return {
                    minPriceDropPct: -3,
                    minConfidence: DEFAULT_MIN_CONFIDENCE,
                    regime: regime.regime,
                    vix: regime.vixLevel,
                    adjustmentReason:
                        `Bull regime (VIX ${regime.vixLevel ?? '<18'}): ` +
                        `relaxed to -3% drop / ${DEFAULT_MIN_CONFIDENCE} confidence. ` +
                        `In low-vol environments, even modest drops can represent overreactions.`,
                };

            case 'neutral':
            default:
                return {
                    minPriceDropPct: DEFAULT_MIN_PRICE_DROP_PCT,
                    minConfidence: DEFAULT_MIN_CONFIDENCE,
                    regime: regime.regime,
                    vix: regime.vixLevel,
                    adjustmentReason:
                        `Neutral regime (VIX ${regime.vixLevel ?? 'N/A'}): ` +
                        `using defaults (${DEFAULT_MIN_PRICE_DROP_PCT}% drop / ${DEFAULT_MIN_CONFIDENCE} confidence).`,
                };
        }
    }
}
