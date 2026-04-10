/**
 * Sentinel — Market Regime Filter
 *
 * Detects the current market environment (bull, bear, crisis) using
 * VIX-equivalent volatility, broad market trend (SPY), and sector momentum.
 *
 * Individual stock signals generated during a market crisis or high-vol regime
 * receive confidence penalties, since win rates drop significantly in those environments.
 *
 * Uses Gemini grounded search for VIX/SPY data — no external API key required.
 * Results cached for 2 hours since regime changes are slow-moving.
 */

import { supabase } from '@/config/supabase';

export type MarketRegimeType = 'bull' | 'neutral' | 'correction' | 'crisis';

export interface MarketRegimeResult {
    regime: MarketRegimeType;
    vixLevel: number | null;       // VIX or equivalent volatility index
    spyTrend: 'above_200sma' | 'below_200sma' | 'unknown';
    spyChangeWeek: number | null;  // SPY weekly change %
    confidencePenalty: number;      // Base penalty 0 to -20
    reason: string;
}

/**
 * Sector-specific risk multipliers during negative regimes (Correction/Crisis).
 * High beta sectors get hit harder; defensive sectors are shielded.
 */
export const SECTOR_RISK_FACTORS: Record<string, number> = {
    'Technology': 1.5,      // Hit 50% harder
    'Communication Services': 1.3,
    'Consumer Cyclical': 1.4,
    'Financial Services': 1.2,
    'Health Care': 0.5,     // Penalty reduced by 50% (Defensive)
    'Utilities': 0.3,       // Penalty reduced by 70% (Safe Haven)
    'Consumer Defensive': 0.4,
    'Energy': 1.1,
    'Real Estate': 1.3,
    'Industrials': 1.0,
    'Basic Materials': 1.0
};

// Cache: regime check is slow, only refresh every 2 hours
let cachedRegime: MarketRegimeResult | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

export class MarketRegimeFilter {

    /**
     * Detect the current market regime using Gemini grounded search.
     * Returns confidence penalty for individual stock signals.
     */
    static async detect(): Promise<MarketRegimeResult> {
        // Return cached result if fresh
        if (cachedRegime && (Date.now() - cacheTimestamp) < CACHE_TTL) {
            return cachedRegime;
        }

        const result = await this.detectAtDate('currently');
        if (result.vixLevel !== null) {
            cachedRegime = result;
            cacheTimestamp = Date.now();
        }
        return result;
    }

    /**
     * Detect market regime for a specific historical date.
     */
    static async detectHistorical(date: string): Promise<MarketRegimeResult> {
        console.log(`[MarketRegime] Fetching historical regime for ${date}...`);
        return this.detectAtDate(`on ${date}`);
    }

    /**
     * Internal implementation for regime detection at a given time point.
     */
    private static async detectAtDate(timePoint: string): Promise<MarketRegimeResult> {
        const neutral: MarketRegimeResult = {
            regime: 'neutral',
            vixLevel: null,
            spyTrend: 'unknown',
            spyChangeWeek: null,
            confidencePenalty: 0,
            reason: `Unable to determine market regime for ${timePoint} — proceeding with neutral assumption.`,
        };

        try {
            const { data, error } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    prompt: `What was the VIX level ${timePoint}, and was SPY trading above or below its 200-day moving average? Also what was SPY's percentage change over the preceding 5 trading days? Respond with ONLY a JSON object: {"vix": number, "spy_above_200sma": true/false, "spy_weekly_change_pct": number, "market_sentiment": "bullish"/"neutral"/"bearish"/"fearful"}`,
                    systemInstruction: `You are a market data assistant. Return ONLY valid JSON with no markdown formatting. Use historical data if a date is provided, otherwise use current real-time data. Date context: ${timePoint}`,
                    requireGroundedSearch: true,
                    temperature: 0.1,
                },
            });

            if (error || !data?.text) {
                console.warn(`[MarketRegime] Gemini call failed for ${timePoint}:`, error);
                return neutral;
            }

            let parsed: any;
            try {
                const jsonText = data.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText);
            } catch {
                console.warn(`[MarketRegime] Failed to parse response for ${timePoint}:`, data.text?.substring(0, 200));
                return neutral;
            }

            const vix = parsed.vix ?? null;
            const spyAbove200 = parsed.spy_above_200sma;
            const spyWeekly = parsed.spy_weekly_change_pct ?? null;
            
            return this.classifyRegime(vix, spyAbove200, spyWeekly);

        } catch (err) {
            console.error(`[MarketRegime] Error detecting regime for ${timePoint}:`, err);
            return neutral;
        }
    }

    /**
     * Logic for classifying a market regime based on VIX and SPY metrics.
     */
    private static classifyRegime(vix: number | null, spyAbove200: boolean | null, spyWeekly: number | null): MarketRegimeResult {
        const spyTrend = spyAbove200 === true ? 'above_200sma' as const
            : spyAbove200 === false ? 'below_200sma' as const
            : 'unknown' as const;

        let regime: MarketRegimeType = 'neutral';
        let penalty = 0;
        let reason = '';

        if (vix !== null && vix >= 35) {
            regime = 'crisis';
            penalty = -20;
            reason = `CRISIS: VIX at ${vix} (extreme fear). Individual stock signals have significantly lower win rates in high-volatility environments.`;
        } else if (vix !== null && vix >= 25) {
            regime = 'correction';
            penalty = -10;
            reason = `CORRECTION: VIX at ${vix} (elevated fear). Market-wide selling pressure reduces signal reliability.`;
        } else if (spyTrend === 'below_200sma' && spyWeekly !== null && spyWeekly < -3) {
            regime = 'correction';
            penalty = -10;
            reason = `CORRECTION: SPY below 200-SMA and down ${Math.abs(spyWeekly).toFixed(1)}% this week. Bear market conditions.`;
        } else if (spyTrend === 'above_200sma' && (vix === null || vix < 18)) {
            regime = 'bull';
            penalty = 0;
            reason = `BULL: SPY above 200-SMA, VIX at ${vix ?? 'N/A'} (low fear). Favorable environment for long signals.`;
        } else {
            reason = `NEUTRAL: VIX at ${vix ?? 'N/A'}, SPY ${spyTrend.replace('_', ' ')}. Normal market conditions.`;
        }

        // Additional penalty for severe weekly drops
        if (spyWeekly !== null && spyWeekly < -5 && regime !== 'crisis') {
            penalty = Math.min(penalty - 5, -15);
            reason += ` SPY down ${Math.abs(spyWeekly).toFixed(1)}% this week — broad selling pressure.`;
        }

        return {
            regime,
            vixLevel: vix,
            spyTrend,
            spyChangeWeek: spyWeekly,
            confidencePenalty: penalty,
            reason,
    }

    /**
     * Format regime result for injection into agent prompts.
     */
    static formatForPrompt(result: MarketRegimeResult): string {
        if (result.regime === 'neutral' && result.vixLevel === null) return '';
        return `
MARKET REGIME: ${result.regime.toUpperCase()}
- VIX: ${result.vixLevel ?? 'N/A'}
- SPY Trend: ${result.spyTrend.replace('_', ' ')}
- SPY Weekly Change: ${result.spyChangeWeek !== null ? `${result.spyChangeWeek > 0 ? '+' : ''}${result.spyChangeWeek.toFixed(1)}%` : 'N/A'}
- ${result.reason}
${result.regime === 'crisis' ? 'CRITICAL: Consider reducing position sizes and tightening stops in crisis conditions.' : ''}`;
    }
}
