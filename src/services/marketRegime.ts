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
    confidencePenalty: number;      // 0 to -20
    reason: string;
}

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

        const neutral: MarketRegimeResult = {
            regime: 'neutral',
            vixLevel: null,
            spyTrend: 'unknown',
            spyChangeWeek: null,
            confidencePenalty: 0,
            reason: 'Unable to determine market regime — proceeding with neutral assumption.',
        };

        try {
            const { data, error } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    prompt: `What is the current VIX level, and is SPY trading above or below its 200-day moving average? Also what is SPY's percentage change over the last 5 trading days? Respond with ONLY a JSON object: {"vix": number, "spy_above_200sma": true/false, "spy_weekly_change_pct": number, "market_sentiment": "bullish"/"neutral"/"bearish"/"fearful"}`,
                    systemInstruction: 'You are a market data assistant. Return ONLY valid JSON with no markdown formatting. Use current real-time data.',
                    requireGroundedSearch: true,
                    temperature: 0.1,
                },
            });

            if (error || !data?.text) {
                console.warn('[MarketRegime] Gemini call failed:', error);
                cachedRegime = neutral;
                cacheTimestamp = Date.now();
                return neutral;
            }

            let parsed: any;
            try {
                const jsonText = data.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText);
            } catch {
                console.warn('[MarketRegime] Failed to parse response:', data.text?.substring(0, 200));
                cachedRegime = neutral;
                cacheTimestamp = Date.now();
                return neutral;
            }

            const vix = parsed.vix ?? null;
            const spyAbove200 = parsed.spy_above_200sma;
            const spyWeekly = parsed.spy_weekly_change_pct ?? null;
            const spyTrend = spyAbove200 === true ? 'above_200sma' as const
                : spyAbove200 === false ? 'below_200sma' as const
                : 'unknown' as const;

            // Classify regime
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

            const result: MarketRegimeResult = {
                regime,
                vixLevel: vix,
                spyTrend,
                spyChangeWeek: spyWeekly,
                confidencePenalty: penalty,
                reason,
            };

            cachedRegime = result;
            cacheTimestamp = Date.now();
            console.log(`[MarketRegime] ${regime.toUpperCase()}: VIX=${vix}, SPY ${spyTrend}, penalty=${penalty}`);
            return result;

        } catch (err) {
            console.error('[MarketRegime] Error:', err);
            cachedRegime = neutral;
            cacheTimestamp = Date.now();
            return neutral;
        }
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
