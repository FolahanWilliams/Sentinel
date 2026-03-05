/**
 * Sentinel — Technical Analysis Service
 *
 * Fetches historical OHLCV data via the proxy-market-data Edge Function
 * and computes key indicators client-side: RSI, MACD, SMA, ATR, Bollinger Bands, Volume Profile.
 *
 * Used by the scanner pipeline to confirm/reject signals based on TA alignment.
 */

import { supabase } from '@/config/supabase';
import type { TASnapshot, TAAlignment } from '@/types/signals';

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
        ema = closes[i] * k + ema * (1 - k);
    }
    return ema;
}

function computeRSI(closes: number[], period: number = 14): number | null {
    if (closes.length < period + 1) return null;

    let avgGain = 0;
    let avgLoss = 0;

    // Initial average
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;

    // Smooth with Wilder's method
    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
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

    for (let i = 26; i < closes.length; i++) {
        if (i >= 12) ema12Running = closes[i] * k12 + ema12Running * (1 - k12);
        ema26Running = closes[i] * k26 + ema26Running * (1 - k26);
        macdSeries.push(ema12Running - ema26Running);
    }

    if (macdSeries.length < 9) return { value: macdLine, signal: macdLine, histogram: 0 };

    // Signal line = 9-period EMA of MACD line
    const kSig = 2 / 10;
    let signalLine = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    for (let i = 9; i < macdSeries.length; i++) {
        signalLine = macdSeries[i] * kSig + signalLine * (1 - kSig);
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
        const high = bars[i].high;
        const low = bars[i].low;
        const prevClose = bars[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trueRanges.push(tr);
    }

    // Initial ATR = simple average of first `period` TRs
    let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trueRanges.length; i++) {
        atr = (atr * (period - 1) + trueRanges[i]) / period;
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
    const currentPrice = closes[closes.length - 1];

    if (upperBand === lowerBand) return 0.5;
    return (currentPrice - lowerBand) / (upperBand - lowerBand);
}

function computeVolumeRatio(volumes: number[], period: number = 20): number | null {
    if (volumes.length < period + 1) return null;
    const avgVol = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
    if (avgVol === 0) return null;
    return volumes[volumes.length - 1] / avgVol;
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
        const bollingerPosition = computeBollingerPosition(closes, 20, 2);

        // Determine trend direction
        const currentPrice = closes[closes.length - 1];
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
        if (volumeRatio !== null) {
            if (volumeRatio > 1.5) taScore += 15;  // High volume confirms
            else if (volumeRatio < 0.5) taScore -= 10;  // Low volume = weak
        }
        if (bollingerPosition !== null) {
            if (bollingerPosition < 0.1) taScore += 15;  // Near lower band = bullish
            else if (bollingerPosition > 0.9) taScore -= 15;  // Near upper band = bearish
        }
        // Clamp to -100..+100
        taScore = Math.max(-100, Math.min(100, taScore));

        return {
            ticker: ticker.toUpperCase(),
            timestamp: new Date().toISOString(),
            rsi14,
            macd,
            sma50,
            sma200,
            atr14,
            volumeRatio,
            bollingerPosition,
            trendDirection,
            taScore,
        };
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

        const { rsi14, macd, trendDirection, volumeRatio, taScore } = snapshot;
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
            if (volumeRatio !== null && volumeRatio > 0.8) confirmations++;
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
        const volLabel = snapshot.volumeRatio !== null
            ? `${snapshot.volumeRatio.toFixed(1)}x avg (${snapshot.volumeRatio > 1.2 ? 'confirming' : snapshot.volumeRatio < 0.5 ? 'weak' : 'normal'})`
            : 'N/A';

        return `
TECHNICAL ANALYSIS SNAPSHOT:
- RSI(14): ${snapshot.rsi14?.toFixed(1) ?? 'N/A'} (${rsiLabel})
- MACD: ${snapshot.macd?.value.toFixed(3) ?? 'N/A'} (Signal: ${snapshot.macd?.signal.toFixed(3) ?? 'N/A'}, Histogram: ${snapshot.macd?.histogram.toFixed(3) ?? 'N/A'} — ${macdLabel})
- Trend: Price ${snapshot.sma50 !== null && snapshot.sma200 !== null ? `${snapshot.trendDirection} (SMA50: $${snapshot.sma50.toFixed(2)}, SMA200: $${snapshot.sma200.toFixed(2)})` : 'N/A'}
- Volatility: ATR(14) = $${snapshot.atr14?.toFixed(2) ?? 'N/A'}
- Volume: ${volLabel}
- Bollinger Position: ${snapshot.bollingerPosition !== null ? (snapshot.bollingerPosition * 100).toFixed(0) + '% (0=lower, 100=upper)' : 'N/A'}
- Composite TA Score: ${snapshot.taScore} (-100 bearish to +100 bullish)

Use this technical context to validate or invalidate the thesis. A bullish news catalyst with bearish technicals (RSI >70, below 200 SMA, declining volume) should significantly lower your confidence.`;
    }
}
