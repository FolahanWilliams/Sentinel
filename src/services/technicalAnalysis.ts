/**
 * Sentinel — Technical Analysis Service
 *
 * Fetches historical OHLCV data via the proxy-market-data Edge Function
 * and computes key indicators client-side: RSI, MACD, SMA, ATR, Bollinger Bands, Volume Profile.
 *
 * Used by the scanner pipeline to confirm/reject signals based on TA alignment.
 */

import { supabase } from '@/config/supabase';
import type { TASnapshot, TAAlignment, ConfluenceLevel, GapType } from '@/types/signals';

interface OHLCV {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

// ─── Indicator Calculations ───

function computeSMA(closes: number[], period: number): number | null {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
}

function computeEMA(closes: number[], period: number): number | null {
    if (closes.length < period) return null;
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = (closes[i] ?? 0) * k + ema * (1 - k);
    }
    return ema;
}

function computeRSI(closes: number[], period: number = 14): number | null {
    if (closes.length < period + 1) return null;

    let avgGain = 0;
    let avgLoss = 0;

    // Initial average
    for (let i = 1; i <= period; i++) {
        const change = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;

    // Smooth with Wilder's method
    for (let i = period + 1; i < closes.length; i++) {
        const change = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
        if (change > 0) {
            avgGain = (avgGain * (period - 1) + change) / period;
            avgLoss = (avgLoss * (period - 1)) / period;
        } else {
            avgGain = (avgGain * (period - 1)) / period;
            avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
        }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

function computeMACD(closes: number[]): { value: number; signal: number; histogram: number } | null {
    const ema12 = computeEMA(closes, 12);
    const ema26 = computeEMA(closes, 26);
    if (ema12 === null || ema26 === null) return null;

    const macdLine = ema12 - ema26;

    // Compute MACD line series for signal line
    const macdSeries: number[] = [];
    const k12 = 2 / 13;
    const k26 = 2 / 27;
    let ema12Running = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
    let ema26Running = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;

    // Update EMA12 for bars 12-25 (these were skipped before, causing initial inaccuracy)
    for (let i = 12; i < 26 && i < closes.length; i++) {
        ema12Running = (closes[i] ?? 0) * k12 + ema12Running * (1 - k12);
    }

    for (let i = 26; i < closes.length; i++) {
        const c = closes[i] ?? 0;
        ema12Running = c * k12 + ema12Running * (1 - k12);
        ema26Running = c * k26 + ema26Running * (1 - k26);
        macdSeries.push(ema12Running - ema26Running);
    }

    if (macdSeries.length < 9) return { value: macdLine, signal: macdLine, histogram: 0 };

    // Signal line = 9-period EMA of MACD line
    const kSig = 2 / 10;
    let signalLine = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    for (let i = 9; i < macdSeries.length; i++) {
        signalLine = (macdSeries[i] ?? 0) * kSig + signalLine * (1 - kSig);
    }

    return {
        value: macdLine,
        signal: signalLine,
        histogram: macdLine - signalLine,
    };
}

function computeATR(bars: OHLCV[], period: number = 14): number | null {
    if (bars.length < period + 1) return null;

    const trueRanges: number[] = [];
    for (let i = 1; i < bars.length; i++) {
        const bar = bars[i]!;
        const prevBar = bars[i - 1]!;
        const tr = Math.max(bar.high - bar.low, Math.abs(bar.high - prevBar.close), Math.abs(bar.low - prevBar.close));
        trueRanges.push(tr);
    }

    // Initial ATR = simple average of first `period` TRs
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
        atr = (atr * (period - 1) + (trueRanges[i] ?? 0)) / period;
    }
    return atr;
}

function computeBollingerPosition(closes: number[], period: number = 20, stdDevMultiplier: number = 2): number | null {
    if (closes.length < period) return null;

    const slice = closes.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    const upperBand = sma + stdDevMultiplier * stdDev;
    const lowerBand = sma - stdDevMultiplier * stdDev;
    const currentPrice = closes[closes.length - 1] ?? 0;

    if (upperBand === lowerBand) return 0.5;
    return (currentPrice - lowerBand) / (upperBand - lowerBand);
}

function computeVolumeRatio(volumes: number[], period: number = 20): number | null {
    if (volumes.length < period + 1) return null;
    const avgVol = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
    if (avgVol === 0) return null;
    return (volumes[volumes.length - 1] ?? 0) / avgVol;
}

/**
 * Determine if high volume is buying or selling pressure.
 * Compares today's close vs open: close > open = buying day, close < open = selling day.
 * Returns +1 for buying, -1 for selling, 0 for neutral.
 */
function computeVolumeDirection(bars: { open: number; close: number; volume: number }[]): number {
    if (bars.length < 1) return 0;
    const today = bars[bars.length - 1]!;
    const changePct = today.open > 0 ? ((today.close - today.open) / today.open) * 100 : 0;
    // >0.3% change threshold to avoid noise
    if (changePct > 0.3) return 1;  // buying day
    if (changePct < -0.3) return -1; // selling day
    return 0;
}

/**
 * Z-Score: how many standard deviations the current price is from its SMA.
 * Z < -2.0 = extremely oversold, Z > +2.0 = extremely overbought.
 */
function computeZScore(closes: number[], period: number = 20): number | null {
    if (closes.length < period) return null;
    const slice = closes.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    if (stdDev === 0) return 0;
    const currentPrice = closes[closes.length - 1] ?? 0;
    return (currentPrice - sma) / stdDev;
}

/**
 * Gap detection: % difference between today's open and yesterday's close.
 * Also classifies the gap type based on volume.
 */
function computeGap(bars: OHLCV[]): { gapPct: number; gapType: GapType } {
    if (bars.length < 2) return { gapPct: 0, gapType: 'none' };
    const today = bars[bars.length - 1]!;
    const yesterday = bars[bars.length - 2]!;
    if (yesterday.close === 0) return { gapPct: 0, gapType: 'none' };
    const gapPct = ((today.open - yesterday.close) / yesterday.close) * 100;

    if (Math.abs(gapPct) < 1.0) return { gapPct, gapType: 'none' };

    // Classify gap using volume context
    const volumes = bars.map(b => b.volume);
    const volRatio = computeVolumeRatio(volumes, 20);

    if (volRatio !== null && volRatio > 2.0) {
        // Extremely high volume — could be breakaway (new trend) or exhaustion (end of trend)
        // Heuristic: if price was already trending in the gap direction, it's exhaustion
        const recentCloses = bars.slice(-10).map(b => b.close);
        const sma10 = recentCloses.reduce((a, b) => a + b, 0) / recentCloses.length;
        const wasTrending = gapPct > 0
            ? yesterday.close > sma10 * 1.02  // was already above 10-SMA — exhaustion gap up
            : yesterday.close < sma10 * 0.98; // was already below 10-SMA — exhaustion gap down
        return { gapPct, gapType: wasTrending ? 'exhaustion' : 'breakaway' };
    }

    // Low-to-moderate volume gap = common gap (high fill probability)
    return { gapPct, gapType: 'common' };
}

/**
 * Aggregate daily bars into weekly bars for multi-timeframe analysis.
 * Groups by ISO week (Monday–Friday). Partial current week is included.
 */
function aggregateToWeekly(dailyBars: OHLCV[]): OHLCV[] {
    if (dailyBars.length < 5) return [];
    const weeks: Map<string, OHLCV> = new Map();
    for (const bar of dailyBars) {
        const d = new Date(bar.date);
        // ISO week key: year + week number
        const jan1 = new Date(d.getFullYear(), 0, 1);
        const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
        const key = `${d.getFullYear()}-W${weekNum}`;
        const existing = weeks.get(key);
        if (!existing) {
            weeks.set(key, { ...bar });
        } else {
            existing.high = Math.max(existing.high, bar.high);
            existing.low = Math.min(existing.low, bar.low);
            existing.close = bar.close; // last day's close
            existing.volume += bar.volume;
        }
    }
    return Array.from(weeks.values());
}

export interface MultiTimeframeResult {
    weeklyTrend: 'bullish' | 'bearish' | 'neutral';
    weeklyRsi: number | null;
    weeklyMacdHistogram: number | null;
    alignment: 'confirmed' | 'conflicting' | 'neutral';
    confidenceAdjustment: number; // -15 to +10
    summary: string;
}

// ─── Main Service ───

export class TechnicalAnalysisService {

    /**
     * Fetch historical OHLCV bars from the proxy-market-data Edge Function.
     */
    static async fetchHistoricalBars(ticker: string): Promise<OHLCV[]> {
        const { data, error } = await supabase.functions.invoke('proxy-market-data', {
            body: {
                endpoint: 'historical',
                ticker: ticker.toUpperCase(),
            }
        });

        if (error || !data?.success || !data?.data) {
            console.warn(`[TA] Failed to fetch historical data for ${ticker}:`, error || data?.error);
            return [];
        }

        return data.data as OHLCV[];
    }

    /**
     * Compute a full TA snapshot for a ticker.
     * Returns null if insufficient data.
     */
    static async getSnapshot(ticker: string): Promise<TASnapshot | null> {
        const bars = await this.fetchHistoricalBars(ticker);
        if (bars.length < 50) {
            console.warn(`[TA] Insufficient historical data for ${ticker}: ${bars.length} bars`);
            return null;
        }

        const closes = bars.map(b => b.close);
        const volumes = bars.map(b => b.volume);

        const rsi14 = computeRSI(closes, 14);
        const macd = computeMACD(closes);
        const sma50 = computeSMA(closes, 50);
        const sma200 = computeSMA(closes, 200);
        const atr14 = computeATR(bars, 14);
        const volumeRatio = computeVolumeRatio(volumes, 20);
        const volumeDirection = computeVolumeDirection(bars);
        const bollingerPosition = computeBollingerPosition(closes, 20, 2);
        const zScore20 = computeZScore(closes, 20);
        const { gapPct, gapType } = computeGap(bars);

        // Determine trend direction
        const currentPrice = closes[closes.length - 1] ?? 0;
        let trendDirection: TASnapshot['trendDirection'] = 'neutral';
        if (sma50 !== null && sma200 !== null) {
            if (currentPrice > sma50 && currentPrice > sma200) trendDirection = 'bullish';
            else if (currentPrice < sma50 && currentPrice < sma200) trendDirection = 'bearish';
        }

        // Composite TA score (-100 to +100)
        let taScore = 0;
        if (rsi14 !== null) {
            if (rsi14 < 30) taScore += 25;       // Oversold = bullish
            else if (rsi14 < 40) taScore += 15;
            else if (rsi14 > 70) taScore -= 25;   // Overbought = bearish
            else if (rsi14 > 60) taScore -= 10;
        }
        if (macd !== null) {
            if (macd.histogram > 0) taScore += 20;
            else taScore -= 20;
        }
        if (trendDirection === 'bullish') taScore += 25;
        else if (trendDirection === 'bearish') taScore -= 25;
        // Volume scoring — direction-aware: high volume on up day = bullish, on down day = bearish
        if (volumeRatio !== null) {
            if (volumeRatio > 1.5) {
                if (volumeDirection > 0) taScore += 20;       // High volume buying = strong bullish
                else if (volumeDirection < 0) taScore -= 15;  // High volume selling = bearish pressure
                else taScore += 5;                             // High volume neutral = ambiguous
            } else if (volumeRatio < 0.5) {
                taScore -= 10;  // Low volume = weak conviction
            }
        }
        if (bollingerPosition !== null) {
            if (bollingerPosition < 0.1) taScore += 15;  // Near lower band = bullish
            else if (bollingerPosition > 0.9) taScore -= 15;  // Near upper band = bearish
        }
        // Z-Score extreme: statistically significant deviation from mean
        if (zScore20 !== null) {
            if (zScore20 < -2.5) taScore += 20;          // Extreme oversold
            else if (zScore20 < -2.0) taScore += 15;
            else if (zScore20 > 2.5) taScore -= 20;       // Extreme overbought
            else if (zScore20 > 2.0) taScore -= 15;
        }
        // Gap exhaustion = reversal signal
        if (gapType === 'exhaustion') {
            if (gapPct > 0) taScore -= 10;  // Exhaustion gap up = bearish signal
            else taScore += 10;              // Exhaustion gap down = bullish signal
        }
        // Clamp to -100..+100
        taScore = Math.max(-100, Math.min(100, taScore));

        const snapshot: TASnapshot & { volumeDirection?: number } = {
            ticker: ticker.toUpperCase(),
            timestamp: new Date().toISOString(),
            rsi14,
            macd,
            sma50,
            sma200,
            atr14,
            volumeRatio,
            bollingerPosition,
            zScore20: zScore20 !== null ? Math.round(zScore20 * 100) / 100 : null,
            gapPct: Math.round(gapPct * 100) / 100,
            gapType,
            trendDirection,
            taScore,
        };
        // Attach volume direction as extra field (not in TASnapshot type to avoid migration)
        snapshot.volumeDirection = volumeDirection;
        return snapshot;
    }

    /**
     * Determine TA alignment for a signal direction.
     * Returns 'confirmed' if TA agrees with the signal direction,
     * 'conflicting' if TA disagrees, 'partial' if mixed, 'unavailable' if no data.
     */
    static evaluateAlignment(
        snapshot: TASnapshot | null,
        signalDirection: 'long' | 'short'
    ): TAAlignment {
        if (!snapshot) return 'unavailable';

        const { rsi14, macd, trendDirection, volumeRatio } = snapshot;
        let confirmations = 0;
        let conflicts = 0;

        if (signalDirection === 'long') {
            // For long signals, bullish TA confirms
            if (rsi14 !== null) {
                if (rsi14 < 40) confirmations++;
                else if (rsi14 > 70) conflicts++;
            }
            if (macd !== null) {
                if (macd.histogram > 0 || (macd.histogram < 0 && macd.histogram > macd.signal)) confirmations++;
                else conflicts++;
            }
            if (trendDirection === 'bullish') confirmations++;
            else if (trendDirection === 'bearish') conflicts++;
            // Volume: for longs, high volume on up day confirms; high volume on down day conflicts
            if (volumeRatio !== null && volumeRatio > 1.2) {
                // Check if the snapshot has volumeDirection (added in improvement 3)
                const volDir = (snapshot as any).volumeDirection;
                if (volDir === 1) confirmations++;        // buying volume
                else if (volDir === -1) conflicts++;      // selling volume
                else if (volumeRatio > 0.8) confirmations++; // decent volume, neutral direction
            }
        } else {
            // For short signals, bearish TA confirms
            if (rsi14 !== null) {
                if (rsi14 > 60) confirmations++;
                else if (rsi14 < 30) conflicts++;
            }
            if (macd !== null) {
                if (macd.histogram < 0) confirmations++;
                else conflicts++;
            }
            if (trendDirection === 'bearish') confirmations++;
            else if (trendDirection === 'bullish') conflicts++;
            // Volume: for shorts, high volume on down day confirms
            if (volumeRatio !== null && volumeRatio > 1.2) {
                const volDir = (snapshot as any).volumeDirection;
                if (volDir === -1) confirmations++;       // selling volume confirms short
                else if (volDir === 1) conflicts++;       // buying volume conflicts with short
            }
        }

        if (conflicts >= 3) return 'conflicting';
        if (confirmations >= 3) return 'confirmed';
        return 'partial';
    }

    /**
     * Check if a long signal should be blocked based on TA (buying into exhaustion).
     */
    static shouldBlockLong(snapshot: TASnapshot | null): { blocked: boolean; reason: string } {
        if (!snapshot) return { blocked: false, reason: '' };
        const { rsi14, macd } = snapshot;
        if (rsi14 !== null && rsi14 > 80 && macd !== null && macd.histogram < 0) {
            return { blocked: true, reason: 'RSI >80 with bearish MACD crossover — buying into exhaustion' };
        }
        return { blocked: false, reason: '' };
    }

    /**
     * Check if a short signal should be blocked (shorting at capitulation).
     */
    static shouldBlockShort(snapshot: TASnapshot | null): { blocked: boolean; reason: string } {
        if (!snapshot) return { blocked: false, reason: '' };
        const { rsi14, macd } = snapshot;
        if (rsi14 !== null && rsi14 < 20 && macd !== null && macd.histogram > 0) {
            return { blocked: true, reason: 'RSI <20 with bullish MACD crossover — shorting at capitulation' };
        }
        return { blocked: false, reason: '' };
    }

    /**
     * Compute a confluence score (0-100) combining news sentiment + TA alignment.
     * High confluence = news catalyst CONFIRMED by technicals = highest win rate.
     */
    static computeConfluence(
        snapshot: TASnapshot | null,
        signalDirection: 'long' | 'short',
        newsConfidence: number,
    ): { score: number; level: ConfluenceLevel } {
        if (!snapshot) return { score: newsConfidence * 0.5, level: 'weak' };

        const alignment = this.evaluateAlignment(snapshot, signalDirection);
        const { rsi14, volumeRatio, zScore20, taScore } = snapshot;

        let taConfirmations = 0;

        // RSI confirmation
        if (signalDirection === 'long') {
            if (rsi14 !== null && rsi14 < 35) taConfirmations += 25;
            else if (rsi14 !== null && rsi14 < 45) taConfirmations += 10;
        } else {
            if (rsi14 !== null && rsi14 > 65) taConfirmations += 25;
            else if (rsi14 !== null && rsi14 > 55) taConfirmations += 10;
        }

        // Z-Score confirmation (statistical extreme)
        if (signalDirection === 'long') {
            if (zScore20 !== null && zScore20 < -2.5) taConfirmations += 20;
            else if (zScore20 !== null && zScore20 < -2.0) taConfirmations += 15;
        } else {
            if (zScore20 !== null && zScore20 > 2.5) taConfirmations += 20;
            else if (zScore20 !== null && zScore20 > 2.0) taConfirmations += 15;
        }

        // Volume surge confirmation — only counts if volume direction aligns with signal
        // For longs: high volume on down day may be capitulation (still bullish) or distribution (bearish)
        // Use TA snapshot's volume direction if available, otherwise treat as neutral
        if (volumeRatio !== null && volumeRatio > 1.5) {
            // High volume: direction matters
            if (signalDirection === 'long') {
                // For long signals: buying volume confirms, selling volume on oversold = capitulation (still ok)
                if (zScore20 !== null && zScore20 < -1.5) {
                    // Oversold + high volume = capitulation exhaustion — confirms long
                    taConfirmations += 20;
                } else {
                    taConfirmations += 10; // High volume but unclear direction
                }
            } else {
                // For short signals: selling volume confirms
                taConfirmations += 10;
            }
        } else if (volumeRatio !== null && volumeRatio > 1.2) {
            taConfirmations += 5;
        }

        // TA score alignment
        if (signalDirection === 'long' && taScore > 30) taConfirmations += 20;
        else if (signalDirection === 'short' && taScore < -30) taConfirmations += 20;

        // Alignment bonus
        if (alignment === 'confirmed') taConfirmations += 15;
        else if (alignment === 'partial') taConfirmations += 5;
        else if (alignment === 'conflicting') taConfirmations -= 20;

        // Combine: 60% news, 40% TA
        const score = Math.min(100, Math.max(0, Math.round(newsConfidence * 0.6 + taConfirmations * 0.4)));

        let level: ConfluenceLevel = 'none';
        if (score >= 75) level = 'strong';
        else if (score >= 55) level = 'moderate';
        else if (score >= 35) level = 'weak';

        return { score, level };
    }

    /**
     * Detect gap-fill opportunities.
     * Returns a gap-fill target price if the gap is likely to fill, or null if no opportunity.
     */
    static evaluateGapFill(
        snapshot: TASnapshot | null,
        previousClose: number
    ): { isCandidate: boolean; gapFillTarget: number | null; gapType: GapType; gapPct: number } {
        if (!snapshot || snapshot.gapType === 'none' || snapshot.gapPct === null) {
            return { isCandidate: false, gapFillTarget: null, gapType: 'none', gapPct: 0 };
        }

        const { gapType, gapPct } = snapshot;

        // Common gaps have high fill probability (paper: "usually filled in 1-3 days")
        // Exhaustion gaps also fill as they mark trend ends
        // Breakaway gaps should NOT be faded — they indicate new trends
        if (gapType === 'breakaway') {
            return { isCandidate: false, gapFillTarget: null, gapType, gapPct };
        }

        // Only consider gaps > 2% magnitude
        if (Math.abs(gapPct) < 2.0) {
            return { isCandidate: false, gapFillTarget: null, gapType, gapPct };
        }

        return {
            isCandidate: true,
            gapFillTarget: previousClose,  // Target = fill the gap back to yesterday's close
            gapType,
            gapPct,
        };
    }

    /**
     * Multi-Timeframe Confirmation: aggregates daily bars to weekly
     * and checks if the weekly trend aligns with the daily signal direction.
     * Returns confidence adjustment: +10 if weekly confirms, -15 if conflicting.
     */
    static async getMultiTimeframeConfirmation(
        ticker: string,
        signalDirection: 'long' | 'short',
        dailyBars?: OHLCV[],
    ): Promise<MultiTimeframeResult> {
        const neutral: MultiTimeframeResult = {
            weeklyTrend: 'neutral',
            weeklyRsi: null,
            weeklyMacdHistogram: null,
            alignment: 'neutral',
            confidenceAdjustment: 0,
            summary: 'Insufficient data for weekly timeframe analysis.',
        };

        try {
            const bars = dailyBars ?? await this.fetchHistoricalBars(ticker);
            const weeklyBars = aggregateToWeekly(bars);
            if (weeklyBars.length < 26) return neutral; // need enough for MACD

            const weeklCloses = weeklyBars.map(b => b.close);
            const weeklyRsi = computeRSI(weeklCloses, 14);
            const weeklyMacd = computeMACD(weeklCloses);
            const weeklySma50 = computeSMA(weeklCloses, 10); // ~10 weeks ≈ 50 days
            const weeklySma200 = computeSMA(weeklCloses, 40); // ~40 weeks ≈ 200 days
            const currentPrice = weeklCloses[weeklCloses.length - 1] ?? 0;

            // Determine weekly trend
            let weeklyTrend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
            if (weeklySma50 !== null && weeklySma200 !== null) {
                if (currentPrice > weeklySma50 && currentPrice > weeklySma200) weeklyTrend = 'bullish';
                else if (currentPrice < weeklySma50 && currentPrice < weeklySma200) weeklyTrend = 'bearish';
            }

            // Check alignment
            let alignment: 'confirmed' | 'conflicting' | 'neutral' = 'neutral';
            let confidenceAdjustment = 0;

            if (signalDirection === 'long') {
                if (weeklyTrend === 'bullish' || (weeklyRsi !== null && weeklyRsi < 40)) {
                    alignment = 'confirmed';
                    confidenceAdjustment = 10;
                } else if (weeklyTrend === 'bearish' && weeklyRsi !== null && weeklyRsi > 60) {
                    alignment = 'conflicting';
                    confidenceAdjustment = -15;
                }
            } else {
                if (weeklyTrend === 'bearish' || (weeklyRsi !== null && weeklyRsi > 60)) {
                    alignment = 'confirmed';
                    confidenceAdjustment = 10;
                } else if (weeklyTrend === 'bullish' && weeklyRsi !== null && weeklyRsi < 40) {
                    alignment = 'conflicting';
                    confidenceAdjustment = -15;
                }
            }

            // MACD histogram as additional confirmation
            if (weeklyMacd) {
                const histAligned = (signalDirection === 'long' && weeklyMacd.histogram > 0)
                    || (signalDirection === 'short' && weeklyMacd.histogram < 0);
                if (histAligned && alignment === 'confirmed') confidenceAdjustment = Math.min(confidenceAdjustment + 5, 10);
                if (!histAligned && alignment !== 'conflicting') confidenceAdjustment -= 5;
            }

            const summary = `Weekly: trend=${weeklyTrend}, RSI=${weeklyRsi?.toFixed(1) ?? 'N/A'}, MACD hist=${weeklyMacd?.histogram.toFixed(3) ?? 'N/A'} → ${alignment} with ${signalDirection} signal (adj: ${confidenceAdjustment > 0 ? '+' : ''}${confidenceAdjustment}).`;

            return {
                weeklyTrend,
                weeklyRsi: weeklyRsi !== null ? Math.round(weeklyRsi * 10) / 10 : null,
                weeklyMacdHistogram: weeklyMacd ? Math.round(weeklyMacd.histogram * 1000) / 1000 : null,
                alignment,
                confidenceAdjustment,
                summary,
            };
        } catch (err) {
            console.error(`[TA] Multi-timeframe error for ${ticker}:`, err);
            return neutral;
        }
    }

    /**
     * Format a TA snapshot as a text block for injection into Gemini prompts.
     */
    static formatForPrompt(snapshot: TASnapshot | null): string {
        if (!snapshot) return '';
        const rsiLabel = snapshot.rsi14 !== null
            ? (snapshot.rsi14 < 30 ? 'oversold' : snapshot.rsi14 > 70 ? 'overbought' : 'neutral')
            : 'N/A';
        const macdLabel = snapshot.macd
            ? (snapshot.macd.histogram > 0 ? 'bullish momentum' : 'bearish momentum')
            : 'N/A';
        const volDir = (snapshot as any).volumeDirection;
        const volDirLabel = volDir === 1 ? 'BUYING pressure' : volDir === -1 ? 'SELLING pressure' : 'neutral';
        const volLabel = snapshot.volumeRatio !== null
            ? `${Number(snapshot.volumeRatio).toFixed(1)}x avg — ${volDirLabel} (${Number(snapshot.volumeRatio) > 1.5 ? 'surge' : Number(snapshot.volumeRatio) > 1.2 ? 'elevated' : Number(snapshot.volumeRatio) < 0.5 ? 'weak' : 'normal'})`
            : 'N/A';

        const zLabel = snapshot.zScore20 !== null
            ? (snapshot.zScore20 < -2.5 ? 'EXTREME oversold' : snapshot.zScore20 < -2.0 ? 'oversold' : snapshot.zScore20 > 2.5 ? 'EXTREME overbought' : snapshot.zScore20 > 2.0 ? 'overbought' : 'normal')
            : 'N/A';

        const gapLabel = snapshot.gapType !== 'none' && snapshot.gapPct !== null
            ? `${snapshot.gapPct > 0 ? '+' : ''}${Number(snapshot.gapPct).toFixed(1)}% (${snapshot.gapType} gap — ${snapshot.gapType === 'common' ? 'high fill probability' : snapshot.gapType === 'exhaustion' ? 'reversal likely' : 'new trend signal'})`
            : 'No significant gap';

        return `
TECHNICAL ANALYSIS SNAPSHOT:
- RSI(14): ${Number(snapshot.rsi14).toFixed(1) || 'N/A'} (${rsiLabel})
- MACD: ${Number(snapshot.macd?.value).toFixed(3) || 'N/A'} (Signal: ${Number(snapshot.macd?.signal).toFixed(3) || 'N/A'}, Histogram: ${Number(snapshot.macd?.histogram).toFixed(3) || 'N/A'} — ${macdLabel})
- Trend: Price ${snapshot.sma50 !== null && snapshot.sma200 !== null ? `${snapshot.trendDirection} (SMA50: $${Number(snapshot.sma50).toFixed(2)}, SMA200: $${Number(snapshot.sma200).toFixed(2)})` : 'N/A'}
- Volatility: ATR(14) = $${Number(snapshot.atr14).toFixed(2) || 'N/A'}
- Volume: ${volLabel}
- Bollinger Position: ${snapshot.bollingerPosition !== null ? (Number(snapshot.bollingerPosition) * 100).toFixed(0) + '% (0=lower, 100=upper)' : 'N/A'}
- Z-Score(20): ${snapshot.zScore20 !== null ? Number(snapshot.zScore20).toFixed(2) : 'N/A'} (${zLabel}) — measures standard deviations from 20-day mean. Below -2.0 = statistically oversold. Above +2.0 = overbought.
- Gap: ${gapLabel}
- Composite TA Score: ${snapshot.taScore} (-100 bearish to +100 bullish)

Use this technical context to validate or invalidate the thesis. A bullish news catalyst with bearish technicals (RSI >70, Z-Score >+2, below 200 SMA, declining volume) should significantly lower your confidence. Conversely, Z-Score < -2.0 with high volume confirms a selling climax — ideal for mean-reversion longs.`;
    }
}
