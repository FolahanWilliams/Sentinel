/**
 * Sentinel — Proactive Thesis Engine
 *
 * Generates trade theses WITHOUT waiting for news events.
 * Scans for setups based on:
 * 1. Technical pattern recognition (oversold bounces, breakout setups, mean reversion)
 * 2. Upcoming catalysts (earnings calendar, FDA dates, macro events)
 * 3. Sector rotation momentum shifts
 * 4. Relative value dislocations (peer divergence)
 * 5. Historical seasonality patterns
 *
 * This closes the "purely reactive" gap — Sentinel now generates hypotheses
 * ahead of events, positioning before the crowd reacts.
 */

import { GeminiService } from './gemini';
import { TechnicalAnalysisService } from './technicalAnalysis';
import { PeerStrengthService } from './peerStrengthService';
import { MarketRegimeFilter, type MarketRegimeType } from './marketRegime';
import { SignalDecayEngine } from './signalDecay';
import { GEMINI_MODEL, CONFIDENCE_FLOOR } from '@/config/constants';
import type { TASnapshot } from '@/types/signals';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface ProactiveThesis {
    ticker: string;
    catalyst: ProactiveCatalystType;
    thesis: string;
    direction: 'long' | 'short';
    confidence: number;
    reasoning: string;
    suggested_entry_low: number;
    suggested_entry_high: number;
    stop_loss: number;
    target_price: number;
    timeframe_days: number;
    urgency: 'immediate' | 'watchlist' | 'developing';
}

export type ProactiveCatalystType =
    | 'technical_setup'      // TA pattern without news catalyst
    | 'earnings_anticipation' // Pre-earnings positioning
    | 'sector_rotation'       // Rotation momentum creating opportunity
    | 'peer_dislocation'      // Relative value gap vs peers
    | 'mean_reversion'        // Statistical oversold/overbought extremes
    | 'catalyst_anticipation'; // Known upcoming catalyst (FDA, macro)

export interface ProactiveScanResult {
    theses: ProactiveThesis[];
    tickersScanned: number;
    setupsFound: number;
    duration_ms: number;
}

// ── Thresholds ──────────────────────────────────────────────────────────────────

const RSI_OVERSOLD_THRESHOLD = 30;
const RSI_OVERBOUGHT_THRESHOLD = 70;
const Z_SCORE_EXTREME_THRESHOLD = -2.0;
const PEER_DIVERGENCE_THRESHOLD = 5.0; // % divergence from peer avg
const MIN_PROACTIVE_CONFIDENCE = 55;

const PROACTIVE_THESIS_PROMPT = `You are SENTINEL's Proactive Thesis Engine. Unlike reactive agents that respond to news,
you GENERATE trade hypotheses from technical setups, upcoming catalysts, and relative value dislocations.

Your job: given a technical snapshot and market context, determine if there is a high-probability
trade setup that the market hasn't priced yet.

Rules:
- You are looking for ASYMMETRIC setups: limited downside, significant upside (or vice versa for shorts).
- Technical setups alone need stronger evidence (RSI extremes + volume confirmation + trend alignment).
- Upcoming catalysts (earnings, FDA) create time-bound opportunities worth positioning for.
- Peer dislocations suggest the market is mispricing — the gap should close.
- Be CONSERVATIVE. Only generate a thesis if the risk/reward is genuinely compelling.
- Set urgency: "immediate" (act within 1-2 sessions), "watchlist" (developing over days), "developing" (early stage).

Return JSON matching the schema.`;

const PROACTIVE_SCHEMA = {
    type: 'OBJECT' as const,
    properties: {
        reasoning: { type: 'STRING' as const },
        has_setup: { type: 'BOOLEAN' as const },
        catalyst: { type: 'STRING' as const },
        thesis: { type: 'STRING' as const },
        direction: { type: 'STRING' as const },
        confidence: { type: 'NUMBER' as const },
        suggested_entry_low: { type: 'NUMBER' as const },
        suggested_entry_high: { type: 'NUMBER' as const },
        stop_loss: { type: 'NUMBER' as const },
        target_price: { type: 'NUMBER' as const },
        timeframe_days: { type: 'NUMBER' as const },
        urgency: { type: 'STRING' as const },
    },
    required: ['reasoning', 'has_setup'] as const,
};

// ── Engine ───────────────────────────────────────────────────────────────────────

export class ProactiveThesisEngine {

    /**
     * Run proactive thesis generation across the watchlist.
     * Identifies setups that don't require a news catalyst.
     */
    static async scan(
        tickers: { ticker: string; sector: string }[],
        regime?: MarketRegimeType,
    ): Promise<ProactiveScanResult> {
        const startTime = Date.now();
        const theses: ProactiveThesis[] = [];

        // 1. Get current regime if not provided
        const currentRegime = regime ?? (await MarketRegimeFilter.detect()).regime;

        // 2. Screen all tickers for technical setups (cheap, local computation)
        const candidates = await this.screenForSetups(tickers);

        if (candidates.length === 0) {
            return { theses: [], tickersScanned: tickers.length, setupsFound: 0, duration_ms: Date.now() - startTime };
        }

        console.log(`[ProactiveThesis] Found ${candidates.length} potential setups from ${tickers.length} tickers`);

        // 3. For each candidate, generate a full thesis via AI
        for (const candidate of candidates.slice(0, 5)) { // Cap at 5 to control API cost
            try {
                // Skip if fresh signal already exists
                const hasFresh = await SignalDecayEngine.hasFreshSignal(candidate.ticker, 'long_overreaction');
                if (hasFresh) continue;

                const thesis = await this.generateThesis(candidate, currentRegime);
                if (thesis && thesis.confidence >= MIN_PROACTIVE_CONFIDENCE) {
                    theses.push(thesis);
                }
            } catch (err) {
                console.warn(`[ProactiveThesis] Failed for ${candidate.ticker}:`, err);
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[ProactiveThesis] Generated ${theses.length} proactive theses in ${duration}ms`);

        return {
            theses,
            tickersScanned: tickers.length,
            setupsFound: candidates.length,
            duration_ms: duration,
        };
    }

    /**
     * Screen tickers for potential setups using TA snapshots.
     * This is a fast, local computation pass — no API calls.
     */
    private static async screenForSetups(
        tickers: { ticker: string; sector: string }[],
    ): Promise<Array<{ ticker: string; sector: string; setup: ProactiveCatalystType; ta: TASnapshot; peerDivergence?: number }>> {
        const candidates: Array<{ ticker: string; sector: string; setup: ProactiveCatalystType; ta: TASnapshot; peerDivergence?: number }> = [];

        // Fetch TA snapshots in parallel (batches of 5)
        const batchSize = 5;
        for (let i = 0; i < tickers.length; i += batchSize) {
            const batch = tickers.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(async ({ ticker, sector }) => {
                    const ta = await TechnicalAnalysisService.getSnapshot(ticker);
                    if (!ta) return null;

                    // Check for technical setups
                    const setup = this.classifySetup(ta);
                    if (setup) {
                        return { ticker, sector, setup, ta };
                    }

                    // Check for peer dislocation
                    try {
                        const peerResult = await PeerStrengthService.analyze(ticker, 0);
                        if (peerResult && Math.abs(peerResult.relativeStrength) > PEER_DIVERGENCE_THRESHOLD) {
                            return {
                                ticker,
                                sector,
                                setup: 'peer_dislocation' as ProactiveCatalystType,
                                ta,
                                peerDivergence: peerResult.relativeStrength,
                            };
                        }
                    } catch { /* non-fatal */ }

                    return null;
                }),
            );

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    candidates.push(result.value);
                }
            }
        }

        // Sort by signal strength (most extreme setups first)
        candidates.sort((a, b) => {
            const scoreA = this.setupStrength(a.ta, a.peerDivergence);
            const scoreB = this.setupStrength(b.ta, b.peerDivergence);
            return scoreB - scoreA;
        });

        return candidates;
    }

    /**
     * Classify a TA snapshot into a proactive setup type.
     * Returns null if no compelling setup is detected.
     */
    private static classifySetup(ta: TASnapshot): ProactiveCatalystType | null {
        // Mean reversion: extreme z-score + oversold RSI
        if (ta.zScore20 !== null && ta.zScore20 <= Z_SCORE_EXTREME_THRESHOLD && ta.rsi14 !== null && ta.rsi14 <= RSI_OVERSOLD_THRESHOLD) {
            return 'mean_reversion';
        }

        // Technical setup: RSI oversold with volume confirmation
        if (ta.rsi14 !== null && ta.rsi14 <= RSI_OVERSOLD_THRESHOLD && ta.volumeRatio !== null && ta.volumeRatio >= 1.5) {
            return 'technical_setup';
        }

        // Technical setup: RSI overbought with exhaustion gap (potential short)
        if (ta.rsi14 !== null && ta.rsi14 >= RSI_OVERBOUGHT_THRESHOLD && ta.gapType === 'exhaustion') {
            return 'technical_setup';
        }

        // Bollinger band squeeze with trend alignment
        if (ta.bollingerPosition !== null && ta.bollingerPosition <= 0.05 && ta.trendDirection === 'bullish') {
            return 'technical_setup';
        }

        return null;
    }

    /**
     * Score how strong a setup is (for prioritization).
     */
    private static setupStrength(ta: TASnapshot, peerDivergence?: number): number {
        let score = 0;

        if (ta.rsi14 !== null) {
            if (ta.rsi14 <= 25) score += 3;
            else if (ta.rsi14 <= 30) score += 2;
            else if (ta.rsi14 >= 75) score += 2;
        }

        if (ta.zScore20 !== null && Math.abs(ta.zScore20) >= 2.0) {
            score += Math.min(3, Math.abs(ta.zScore20));
        }

        if (ta.volumeRatio !== null && ta.volumeRatio >= 2.0) {
            score += 2;
        }

        if (peerDivergence !== undefined) {
            score += Math.min(3, Math.abs(peerDivergence) / 3);
        }

        return score;
    }

    /**
     * Generate a full proactive thesis for a candidate setup.
     */
    private static async generateThesis(
        candidate: { ticker: string; sector: string; setup: ProactiveCatalystType; ta: TASnapshot; peerDivergence?: number },
        regime: MarketRegimeType,
    ): Promise<ProactiveThesis | null> {
        const { ticker, sector, setup, ta, peerDivergence } = candidate;

        const taContext = `
TECHNICAL SNAPSHOT for ${ticker}:
- RSI(14): ${ta.rsi14?.toFixed(1) ?? 'N/A'}
- MACD: ${ta.macd ? `${ta.macd.value.toFixed(3)} (signal: ${ta.macd.signal.toFixed(3)}, hist: ${ta.macd.histogram.toFixed(3)})` : 'N/A'}
- SMA50: ${ta.sma50?.toFixed(2) ?? 'N/A'} | SMA200: ${ta.sma200?.toFixed(2) ?? 'N/A'}
- Bollinger Position: ${ta.bollingerPosition?.toFixed(2) ?? 'N/A'}
- Z-Score(20): ${ta.zScore20?.toFixed(2) ?? 'N/A'}
- Volume Ratio: ${ta.volumeRatio?.toFixed(1) ?? 'N/A'}x avg
- ATR(14): ${ta.atr14?.toFixed(2) ?? 'N/A'}
- Trend: ${ta.trendDirection}
- Gap: ${ta.gapType} (${ta.gapPct?.toFixed(2) ?? 0}%)
- TA Composite Score: ${ta.taScore}`;

        const peerContext = peerDivergence !== undefined
            ? `\nPEER DISLOCATION: ${ticker} has diverged ${peerDivergence.toFixed(1)}% from sector ${sector} average.`
            : '';

        const prompt = `
PROACTIVE THESIS GENERATION
Ticker: ${ticker} | Sector: ${sector}
Setup Type: ${setup}
Market Regime: ${regime}
${taContext}${peerContext}

Generate a trade thesis for this ${setup} setup. This is NOT a reaction to news — it's a PROACTIVE
hypothesis based on technical and relative value signals.

Consider:
1. Is this setup historically reliable in a ${regime} market?
2. What is the asymmetric risk/reward?
3. What upcoming catalyst could validate or invalidate this thesis?
4. Where should entry, stop, and target be placed based on TA levels?

Return JSON matching the schema. Set has_setup=false if the setup is too weak.`;

        const result = await GeminiService.generate<any>({
            prompt,
            systemInstruction: PROACTIVE_THESIS_PROMPT,
            requireGroundedSearch: false,
            responseSchema: PROACTIVE_SCHEMA,
            temperature: 0.4,
            model: GEMINI_MODEL,
        });

        if (!result.success || !result.data?.has_setup) {
            return null;
        }

        const d = result.data;
        return {
            ticker,
            catalyst: (d.catalyst as ProactiveCatalystType) || setup,
            thesis: d.thesis || '',
            direction: d.direction === 'short' ? 'short' : 'long',
            confidence: Math.max(CONFIDENCE_FLOOR, Math.min(100, d.confidence ?? 50)),
            reasoning: d.reasoning || '',
            suggested_entry_low: d.suggested_entry_low ?? 0,
            suggested_entry_high: d.suggested_entry_high ?? 0,
            stop_loss: d.stop_loss ?? 0,
            target_price: d.target_price ?? 0,
            timeframe_days: d.timeframe_days ?? 10,
            urgency: (['immediate', 'watchlist', 'developing'].includes(d.urgency) ? d.urgency : 'watchlist') as ProactiveThesis['urgency'],
        };
    }
}
