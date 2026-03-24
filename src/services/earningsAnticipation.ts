/**
 * Sentinel — Earnings Anticipation Agent (P1)
 *
 * Generates proactive trade setups 2-5 business days before earnings.
 * Unlike EarningsGuard (which penalizes), this agent CREATES signals
 * by identifying pre-earnings positioning opportunities:
 *
 * 1. Implied volatility crush candidates (sell premium)
 * 2. Pre-earnings drift plays (historical tendency)
 * 3. Oversold into earnings (mean-reversion with catalyst)
 * 4. Momentum continuation into earnings (breakout confirmation)
 *
 * The agent runs as part of the proactive thesis pipeline in the scanner.
 */

import { GeminiService } from './gemini';
import { TechnicalAnalysisService } from './technicalAnalysis';
import { EarningsGuard, type EarningsGuardResult } from './earningsGuard';
import { GEMINI_MODEL, CONFIDENCE_FLOOR } from '@/config/constants';
import type { TASnapshot } from '@/types/signals';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface EarningsAnticipationResult {
    ticker: string;
    earningsDate: string | null;
    daysUntilEarnings: number;
    setupType: EarningsSetupType;
    thesis: string;
    direction: 'long' | 'short';
    confidence: number;
    reasoning: string;
    suggested_entry_low: number;
    suggested_entry_high: number;
    stop_loss: number;
    target_price: number;
    timeframe_days: number;
    exit_before_earnings: boolean;
}

export type EarningsSetupType =
    | 'pre_earnings_drift'        // Historical drift into earnings
    | 'oversold_into_earnings'    // RSI oversold with upcoming catalyst
    | 'momentum_into_earnings'    // Strong trend into earnings
    | 'mean_reversion_earnings';  // Extreme z-score with earnings as catalyst

export interface EarningsAnticipationScanResult {
    signals: EarningsAnticipationResult[];
    tickersScanned: number;
    candidatesFound: number;
    duration_ms: number;
}

// ── Thresholds ──────────────────────────────────────────────────────────────────

/** Only consider tickers with earnings 2-5 business days away */
const MIN_DAYS_BEFORE_EARNINGS = 2;
const MAX_DAYS_BEFORE_EARNINGS = 7;
/** RSI threshold for oversold-into-earnings setup */
const RSI_OVERSOLD_EARNINGS = 35;
/** Minimum confidence for generated signals */
const MIN_EARNINGS_ANTICIPATION_CONFIDENCE = 60;

// ── Prompt ──────────────────────────────────────────────────────────────────────

const EARNINGS_ANTICIPATION_PROMPT = `You are SENTINEL's Earnings Anticipation Agent. You generate PRE-EARNINGS trade setups for stocks reporting earnings in 2-7 days.

Your job: given a stock's technical snapshot and upcoming earnings timing, determine if there is a high-probability pre-earnings trade setup.

SETUP TYPES YOU CAN GENERATE:
1. pre_earnings_drift — Stock tends to drift in a direction before earnings (historical pattern). Position for the drift, exit before the report.
2. oversold_into_earnings — Stock is technically oversold (RSI < 35) with earnings as an upcoming catalyst. Mean-reversion + catalyst = strong setup.
3. momentum_into_earnings — Stock is in a strong uptrend approaching earnings. Momentum often accelerates into the event. Ride the wave, exit before report.
4. mean_reversion_earnings — Stock at statistical extreme (z-score < -2). Earnings as potential catalyst for snap-back.

RULES:
- ALWAYS set exit_before_earnings=true unless you have very high conviction the report will be favorable.
- Position for the MOVE INTO earnings, not the earnings reaction itself.
- Set timeframe_days to end 1 day before the earnings date.
- Be CONSERVATIVE. Pre-earnings trades carry binary event risk.
- If the technical picture doesn't support any setup, set has_setup=false.

Return JSON matching the schema.`;

const EARNINGS_ANTICIPATION_SCHEMA = {
    type: 'OBJECT' as const,
    properties: {
        reasoning: { type: 'STRING' as const },
        has_setup: { type: 'BOOLEAN' as const },
        setup_type: { type: 'STRING' as const },
        thesis: { type: 'STRING' as const },
        direction: { type: 'STRING' as const },
        confidence: { type: 'NUMBER' as const },
        suggested_entry_low: { type: 'NUMBER' as const },
        suggested_entry_high: { type: 'NUMBER' as const },
        stop_loss: { type: 'NUMBER' as const },
        target_price: { type: 'NUMBER' as const },
        timeframe_days: { type: 'NUMBER' as const },
        exit_before_earnings: { type: 'BOOLEAN' as const },
    },
    required: ['reasoning', 'has_setup'] as const,
};

// ── Engine ───────────────────────────────────────────────────────────────────────

export class EarningsAnticipationAgent {

    /**
     * Scan tickers for pre-earnings positioning opportunities.
     */
    static async scan(
        tickers: { ticker: string; sector: string }[],
    ): Promise<EarningsAnticipationScanResult> {
        const startTime = Date.now();
        const signals: EarningsAnticipationResult[] = [];
        let candidatesFound = 0;

        // 1. Check earnings calendar for all tickers
        const earningsChecks = await Promise.allSettled(
            tickers.map(async ({ ticker }) => {
                const result = await EarningsGuard.check(ticker);
                return { ticker, result };
            })
        );

        // 2. Filter to tickers with earnings in the sweet spot (2-7 days)
        const candidates: { ticker: string; sector: string; earnings: EarningsGuardResult }[] = [];
        for (const check of earningsChecks) {
            if (check.status !== 'fulfilled' || !check.value.result.hasUpcomingEarnings) continue;
            const { ticker, result } = check.value;
            const days = result.daysUntilEarnings;
            if (days !== null && days >= MIN_DAYS_BEFORE_EARNINGS && days <= MAX_DAYS_BEFORE_EARNINGS) {
                const sectorInfo = tickers.find(t => t.ticker === ticker);
                if (sectorInfo) {
                    candidates.push({ ticker, sector: sectorInfo.sector, earnings: result });
                }
            }
        }

        candidatesFound = candidates.length;
        if (candidates.length === 0) {
            return { signals: [], tickersScanned: tickers.length, candidatesFound: 0, duration_ms: Date.now() - startTime };
        }

        console.log(`[EarningsAnticipation] Found ${candidates.length} tickers with earnings in ${MIN_DAYS_BEFORE_EARNINGS}-${MAX_DAYS_BEFORE_EARNINGS} days`);

        // 3. For each candidate, get TA snapshot and generate thesis
        for (const candidate of candidates.slice(0, 5)) { // Cap at 5 to control API cost
            try {
                const ta = await TechnicalAnalysisService.getSnapshot(candidate.ticker);
                if (!ta) continue;

                // Quick pre-filter: is there a technical setup worth pursuing?
                const setupType = this.classifyEarningsSetup(ta);
                if (!setupType) continue;

                const signal = await this.generateSignal(candidate, ta, setupType);
                if (signal && signal.confidence >= MIN_EARNINGS_ANTICIPATION_CONFIDENCE) {
                    signals.push(signal);
                }
            } catch (err) {
                console.warn(`[EarningsAnticipation] Failed for ${candidate.ticker}:`, err);
            }
        }

        const duration = Date.now() - startTime;
        console.log(`[EarningsAnticipation] Generated ${signals.length} pre-earnings signals in ${duration}ms`);

        return { signals, tickersScanned: tickers.length, candidatesFound, duration_ms: duration };
    }

    /**
     * Classify what kind of pre-earnings setup the TA suggests.
     */
    private static classifyEarningsSetup(ta: TASnapshot): EarningsSetupType | null {
        // Oversold into earnings — strong candidate
        if (ta.rsi14 !== null && ta.rsi14 <= RSI_OVERSOLD_EARNINGS) {
            return 'oversold_into_earnings';
        }

        // Mean reversion at statistical extreme
        if (ta.zScore20 !== null && ta.zScore20 <= -2.0) {
            return 'mean_reversion_earnings';
        }

        // Momentum into earnings — strong uptrend
        if (ta.trendDirection === 'bullish' && ta.rsi14 !== null && ta.rsi14 >= 50 && ta.rsi14 <= 70) {
            return 'momentum_into_earnings';
        }

        // Pre-earnings drift — neutral TA but earnings approaching
        // Only if volume is picking up (institutional positioning)
        if (ta.volumeRatio !== null && ta.volumeRatio >= 1.3) {
            return 'pre_earnings_drift';
        }

        return null;
    }

    /**
     * Generate a full earnings anticipation signal via Gemini.
     */
    private static async generateSignal(
        candidate: { ticker: string; sector: string; earnings: EarningsGuardResult },
        ta: TASnapshot,
        setupType: EarningsSetupType,
    ): Promise<EarningsAnticipationResult | null> {
        const { ticker, sector, earnings } = candidate;

        const prompt = `
EARNINGS ANTICIPATION SIGNAL GENERATION
Ticker: ${ticker} | Sector: ${sector}
Setup Type: ${setupType}
Earnings Date: ${earnings.earningsDate ?? 'unknown'} (${earnings.daysUntilEarnings} days away)

TECHNICAL SNAPSHOT:
- RSI(14): ${ta.rsi14?.toFixed(1) ?? 'N/A'}
- MACD: ${ta.macd ? `${ta.macd.value.toFixed(3)} (signal: ${ta.macd.signal.toFixed(3)}, hist: ${ta.macd.histogram.toFixed(3)})` : 'N/A'}
- SMA50: ${ta.sma50?.toFixed(2) ?? 'N/A'} | SMA200: ${ta.sma200?.toFixed(2) ?? 'N/A'}
- Bollinger Position: ${ta.bollingerPosition?.toFixed(2) ?? 'N/A'}
- Z-Score(20): ${ta.zScore20?.toFixed(2) ?? 'N/A'}
- Volume Ratio: ${ta.volumeRatio?.toFixed(1) ?? 'N/A'}x avg
- ATR(14): ${ta.atr14?.toFixed(2) ?? 'N/A'}
- Trend: ${ta.trendDirection}

Generate a pre-earnings trade thesis. This is about positioning BEFORE the report, NOT predicting the report outcome.
Set timeframe_days to end 1 day before earnings.
Return JSON matching the schema. Set has_setup=false if the setup is too weak.`;

        const result = await GeminiService.generate<any>({
            prompt,
            systemInstruction: EARNINGS_ANTICIPATION_PROMPT,
            requireGroundedSearch: false,
            responseSchema: EARNINGS_ANTICIPATION_SCHEMA,
            temperature: 0.3,
            model: GEMINI_MODEL,
        });

        if (!result.success || !result.data?.has_setup) {
            return null;
        }

        const d = result.data;
        const validSetupTypes: EarningsSetupType[] = ['pre_earnings_drift', 'oversold_into_earnings', 'momentum_into_earnings', 'mean_reversion_earnings'];

        return {
            ticker,
            earningsDate: earnings.earningsDate,
            daysUntilEarnings: earnings.daysUntilEarnings ?? 0,
            setupType: validSetupTypes.includes(d.setup_type) ? d.setup_type : setupType,
            thesis: d.thesis || '',
            direction: d.direction === 'short' ? 'short' : 'long',
            confidence: Math.max(CONFIDENCE_FLOOR, Math.min(100, d.confidence ?? 50)),
            reasoning: d.reasoning || '',
            suggested_entry_low: d.suggested_entry_low ?? 0,
            suggested_entry_high: d.suggested_entry_high ?? 0,
            stop_loss: d.stop_loss ?? 0,
            target_price: d.target_price ?? 0,
            timeframe_days: Math.min(d.timeframe_days ?? (earnings.daysUntilEarnings ?? 5) - 1, (earnings.daysUntilEarnings ?? 5) - 1),
            exit_before_earnings: d.exit_before_earnings !== false,
        };
    }
}
