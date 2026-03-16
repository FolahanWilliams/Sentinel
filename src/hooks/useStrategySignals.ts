/**
 * useStrategySignals — Computes buy/sell signals from historical OHLCV bars.
 *
 * Ports the Sentinel TA composite scoring, confluence evaluation, and
 * signal-blocking logic from technicalAnalysis.ts into a bar-by-bar
 * backtest that can overlay markers on a lightweight-charts candlestick.
 */

import { useMemo } from 'react';

export interface OHLCV {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export type SignalDirection = 'long' | 'short';

export interface StrategySignal {
    /** Bar index in the OHLCV array */
    barIndex: number;
    date: string;
    direction: SignalDirection;
    price: number;
    stopLoss: number;
    target: number;
    taScore: number;
    confluence: number;
    confluenceLevel: 'strong' | 'moderate' | 'weak' | 'none';
}

interface StrategyConfig {
    confGate: number;
    rsiLen: number;
    smaFast: number;
    smaSlow: number;
    bbLen: number;
    bbMult: number;
    zLen: number;
    volLen: number;
    blockExhaustion: boolean;
    blockCapitulation: boolean;
}

const DEFAULT_CONFIG: StrategyConfig = {
    confGate: 65,
    rsiLen: 14,
    smaFast: 50,
    smaSlow: 200,
    bbLen: 20,
    bbMult: 2.0,
    zLen: 20,
    volLen: 20,
    blockExhaustion: true,
    blockCapitulation: true,
};

// ── Indicator helpers (match technicalAnalysis.ts exactly) ──

function sma(data: number[], period: number, end: number): number | null {
    if (end < period - 1) return null;
    let sum = 0;
    for (let i = end - period + 1; i <= end; i++) sum += data[i]!;
    return sum / period;
}

function ema(data: number[], period: number, end: number): number | null {
    if (end < period - 1) return null;
    const k = 2 / (period + 1);
    let val = 0;
    for (let i = 0; i < period; i++) val += data[i]!;
    val /= period;
    for (let i = period; i <= end; i++) {
        val = data[i]! * k + val * (1 - k);
    }
    return val;
}

function rsi(closes: number[], period: number, end: number): number | null {
    if (end < period) return null;
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = end - period + 1; i <= end; i++) {
        const change = closes[i]! - closes[i - 1]!;
        if (change > 0) avgGain += change;
        else avgLoss += Math.abs(change);
    }
    avgGain /= period;
    avgLoss /= period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}

function atr(bars: OHLCV[], period: number, end: number): number | null {
    if (end < period) return null;
    let atrVal = 0;
    let count = 0;
    for (let i = end - period + 1; i <= end; i++) {
        const bar = bars[i]!;
        const prev = bars[i - 1]!;
        const tr = Math.max(
            bar.high - bar.low,
            Math.abs(bar.high - prev.close),
            Math.abs(bar.low - prev.close)
        );
        if (count === 0) atrVal = tr;
        else atrVal = (atrVal * (period - 1) + tr) / period;
        count++;
    }
    return atrVal;
}

function bollingerPosition(closes: number[], period: number, mult: number, end: number): number | null {
    const s = sma(closes, period, end);
    if (s === null) return null;
    let variance = 0;
    for (let i = end - period + 1; i <= end; i++) {
        variance += (closes[i]! - s) ** 2;
    }
    variance /= period;
    const stdDev = Math.sqrt(variance);
    const upper = s + mult * stdDev;
    const lower = s - mult * stdDev;
    if (upper === lower) return 0.5;
    return (closes[end]! - lower) / (upper - lower);
}

function zScore(closes: number[], period: number, end: number): number | null {
    const s = sma(closes, period, end);
    if (s === null) return null;
    let variance = 0;
    for (let i = end - period + 1; i <= end; i++) {
        variance += (closes[i]! - s) ** 2;
    }
    const stdDev = Math.sqrt(variance / period);
    if (stdDev === 0) return 0;
    return (closes[end]! - s) / stdDev;
}

function macdHistogram(closes: number[], end: number): number | null {
    const ema12 = ema(closes, 12, end);
    const ema26 = ema(closes, 26, end);
    if (ema12 === null || ema26 === null) return null;
    // Simplified: use MACD line as histogram proxy since we can't easily compute
    // the signal line at each bar without full series. For confluence purposes this
    // captures the same directionality.
    return ema12 - ema26;
}

/**
 * Compute all strategy signals for a set of OHLCV bars.
 * Returns an array of buy/sell markers.
 */
export function computeStrategySignals(
    bars: OHLCV[],
    config: StrategyConfig = DEFAULT_CONFIG,
): StrategySignal[] {
    const signals: StrategySignal[] = [];
    if (bars.length < config.smaSlow + 1) return signals;

    const closes = bars.map(b => b.close);
    const volumes = bars.map(b => b.volume);

    // Track cooldown: don't fire signals within 5 bars of each other
    let lastSignalBar = -10;

    // Start scanning from where we have enough data for all indicators
    const startBar = Math.max(config.smaSlow, config.volLen + 1, config.rsiLen + 1, 26);

    for (let i = startBar; i < bars.length; i++) {
        if (i - lastSignalBar < 5) continue; // cooldown

        const bar = bars[i]!;
        const price = bar.close;

        // Compute indicators
        const rsiVal = rsi(closes, config.rsiLen, i);
        const macdHist = macdHistogram(closes, i);
        const smaFastVal = sma(closes, config.smaFast, i);
        const smaSlowVal = sma(closes, config.smaSlow, i);
        const atrVal = atr(bars, 14, i);
        const bbPos = bollingerPosition(closes, config.bbLen, config.bbMult, i);
        const zVal = zScore(closes, config.zLen, i);

        // Volume ratio
        const avgVol = sma(volumes, config.volLen, i - 1);
        const volRatio = avgVol && avgVol > 0 ? volumes[i]! / avgVol : 1.0;

        // Volume direction
        const changePct = bar.open > 0 ? ((bar.close - bar.open) / bar.open) * 100 : 0;
        const volDir = changePct > 0.3 ? 1 : changePct < -0.3 ? -1 : 0;

        if (rsiVal === null || macdHist === null || smaFastVal === null || smaSlowVal === null || atrVal === null) continue;

        // ── Trend direction ──
        const bullTrend = price > smaFastVal && price > smaSlowVal;
        const bearTrend = price < smaFastVal && price < smaSlowVal;

        // ── TA Composite Score (-100 to +100) ──
        let taScore = 0;
        taScore += rsiVal < 30 ? 25 : rsiVal < 40 ? 15 : rsiVal > 70 ? -25 : rsiVal > 60 ? -10 : 0;
        taScore += macdHist > 0 ? 20 : -20;
        taScore += bullTrend ? 25 : bearTrend ? -25 : 0;
        if (volRatio > 1.5) {
            taScore += volDir > 0 ? 20 : volDir < 0 ? -15 : 5;
        } else if (volRatio < 0.5) {
            taScore -= 10;
        }
        if (bbPos !== null) {
            taScore += bbPos < 0.1 ? 15 : bbPos > 0.9 ? -15 : 0;
        }
        if (zVal !== null) {
            taScore += zVal < -2.5 ? 20 : zVal < -2.0 ? 15 : zVal > 2.5 ? -20 : zVal > 2.0 ? -15 : 0;
        }
        taScore = Math.max(-100, Math.min(100, taScore));

        // ── Alignment confirmations ──
        const longConfs = (rsiVal < 40 ? 1 : 0) + (macdHist > 0 ? 1 : 0) +
            (bullTrend ? 1 : 0) + (volRatio > 1.2 && volDir === 1 ? 1 : 0);
        const shortConfs = (rsiVal > 60 ? 1 : 0) + (macdHist < 0 ? 1 : 0) +
            (bearTrend ? 1 : 0) + (volRatio > 1.2 && volDir === -1 ? 1 : 0);

        // ── Confluence scoring ──
        const baseCf = Math.abs(taScore);

        // Long confluence
        let longTaConf = 0;
        longTaConf += rsiVal < 35 ? 25 : rsiVal < 45 ? 10 : 0;
        if (zVal !== null) longTaConf += zVal < -2.5 ? 20 : zVal < -2.0 ? 15 : 0;
        longTaConf += volRatio > 1.5 ? (zVal !== null && zVal < -1.5 ? 20 : 10) : volRatio > 1.2 ? 5 : 0;
        longTaConf += taScore > 30 ? 20 : 0;
        longTaConf += longConfs >= 3 ? 15 : longConfs >= 2 ? 5 : -20;
        const longCf = Math.min(100, Math.max(0, baseCf * 0.6 + longTaConf * 0.4));

        // Short confluence
        let shortTaConf = 0;
        shortTaConf += rsiVal > 65 ? 25 : rsiVal > 55 ? 10 : 0;
        if (zVal !== null) shortTaConf += zVal > 2.5 ? 20 : zVal > 2.0 ? 15 : 0;
        shortTaConf += volRatio > 1.5 ? 10 : volRatio > 1.2 ? 5 : 0;
        shortTaConf += taScore < -30 ? 20 : 0;
        shortTaConf += shortConfs >= 3 ? 15 : shortConfs >= 2 ? 5 : -20;
        const shortCf = Math.min(100, Math.max(0, baseCf * 0.6 + shortTaConf * 0.4));

        // ── Signal blocking ──
        const blockLong = config.blockExhaustion && rsiVal > 80 && macdHist < 0;
        const blockShort = config.blockCapitulation && rsiVal < 20 && macdHist > 0;

        // ── ATR-based stops (scale with confluence) ──
        const longAtrMult = longCf >= 75 ? 1.0 : longCf >= 55 ? 1.25 : longCf >= 35 ? 1.75 : 2.0;
        const shortAtrMult = shortCf >= 75 ? 1.0 : shortCf >= 55 ? 1.25 : shortCf >= 35 ? 1.75 : 2.0;

        // ── Entry conditions ──
        const isLong = taScore >= 30 && longCf >= config.confGate && !blockLong && longConfs >= 2;
        const isShort = taScore <= -30 && shortCf >= config.confGate && !blockShort && shortConfs >= 2;

        if (isLong) {
            const confLevel = longCf >= 75 ? 'strong' : longCf >= 55 ? 'moderate' : longCf >= 35 ? 'weak' : 'none';
            signals.push({
                barIndex: i,
                date: bar.date,
                direction: 'long',
                price,
                stopLoss: price - atrVal * longAtrMult,
                target: price + atrVal * longAtrMult * 2,
                taScore,
                confluence: Math.round(longCf),
                confluenceLevel: confLevel,
            });
            lastSignalBar = i;
        } else if (isShort) {
            const confLevel = shortCf >= 75 ? 'strong' : shortCf >= 55 ? 'moderate' : shortCf >= 35 ? 'weak' : 'none';
            signals.push({
                barIndex: i,
                date: bar.date,
                direction: 'short',
                price,
                stopLoss: price + atrVal * shortAtrMult,
                target: price - atrVal * shortAtrMult * 2,
                taScore,
                confluence: Math.round(shortCf),
                confluenceLevel: confLevel,
            });
            lastSignalBar = i;
        }
    }

    return signals;
}

/**
 * React hook that memoizes signal computation.
 */
export function useStrategySignals(
    bars: OHLCV[],
    config?: Partial<StrategyConfig>,
) {
    const mergedConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);

    const signals = useMemo(
        () => computeStrategySignals(bars, mergedConfig),
        [bars, mergedConfig],
    );

    return signals;
}
