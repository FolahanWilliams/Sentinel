/**
 * RiskRewardChart — Visual SVG bar chart showing risk/reward zones for a trade.
 * Displays entry zone, stop loss, target price, current price marker, and R:R ratio.
 */

import { Shield, Target } from 'lucide-react';
import { formatPrice } from '@/utils/formatters';

interface RiskRewardChartProps {
    entryLow: number | null;
    entryHigh: number | null;
    stopLoss: number | null;
    targetPrice: number | null;
    currentPrice: number | null;
    ticker: string;
}

const SVG_WIDTH = 480;
const SVG_HEIGHT = 120;
const BAR_Y = 40;
const BAR_HEIGHT = 40;
const PADDING_X = 16;

export function RiskRewardChart({
    entryLow,
    entryHigh,
    stopLoss,
    targetPrice,
    currentPrice,
    ticker,
}: RiskRewardChartProps) {
    // Bail out if essential price levels are missing
    if (stopLoss == null || targetPrice == null) return null;

    // Derive entry midpoint for calculations when entry bounds are partial
    const effectiveEntryLow = entryLow ?? entryHigh ?? currentPrice ?? stopLoss;
    const effectiveEntryHigh = entryHigh ?? entryLow ?? currentPrice ?? targetPrice;
    const entryMid = (effectiveEntryLow + effectiveEntryHigh) / 2;

    // Calculate risk/reward metrics
    // Guard against zero entry midpoint (degenerate data)
    if (entryMid === 0) return null;

    const riskDistance = Math.abs(entryMid - stopLoss);
    const rewardDistance = Math.abs(targetPrice - entryMid);
    const riskPct = (riskDistance / entryMid) * 100;
    const rewardPct = (rewardDistance / entryMid) * 100;
    const rrRatio = riskDistance > 0 ? rewardDistance / riskDistance : 0;

    // Map price range to SVG x-coordinates
    const rangeMin = stopLoss;
    const rangeMax = targetPrice;
    const rangeSpan = rangeMax - rangeMin;

    if (rangeSpan <= 0) return null;

    const usableWidth = SVG_WIDTH - PADDING_X * 2;

    function priceToX(price: number): number {
        const pct = (price - rangeMin) / rangeSpan;
        return PADDING_X + pct * usableWidth;
    }

    // Compute x-positions for each zone
    const stopX = priceToX(stopLoss);
    const entryLowX = priceToX(effectiveEntryLow);
    const entryHighX = priceToX(effectiveEntryHigh);
    const targetX = priceToX(targetPrice);
    const currentX = currentPrice != null ? priceToX(Math.max(rangeMin, Math.min(rangeMax, currentPrice))) : null;

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-sentinel-500" />
                    Risk / Reward — {ticker}
                </h3>
                <div className="flex items-center gap-1.5 bg-sentinel-950/50 rounded-lg px-3 py-1.5 border border-sentinel-800/50">
                    <span className="text-xs text-sentinel-500">R:R</span>
                    <span className="text-sm font-bold text-sentinel-100 font-mono">
                        1:{rrRatio.toFixed(1)}
                    </span>
                </div>
            </div>

            {/* Risk & Reward stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="flex items-center gap-2 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
                    <Shield className="w-4 h-4 text-red-400" />
                    <div>
                        <p className="text-[10px] text-red-400/80 uppercase tracking-wide">Risk</p>
                        <p className="text-sm font-semibold text-red-300 font-mono">
                            -{riskPct.toFixed(1)}%
                        </p>
                    </div>
                    <span className="ml-auto text-xs text-sentinel-500 font-mono">
                        {formatPrice(stopLoss)}
                    </span>
                </div>
                <div className="flex items-center gap-2 bg-emerald-500/10 rounded-lg px-3 py-2 border border-emerald-500/20">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <div>
                        <p className="text-[10px] text-emerald-400/80 uppercase tracking-wide">Reward</p>
                        <p className="text-sm font-semibold text-emerald-300 font-mono">
                            +{rewardPct.toFixed(1)}%
                        </p>
                    </div>
                    <span className="ml-auto text-xs text-sentinel-500 font-mono">
                        {formatPrice(targetPrice)}
                    </span>
                </div>
            </div>

            {/* SVG Chart */}
            <svg
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                className="w-full h-auto"
                role="img"
                aria-label={`Risk reward chart for ${ticker}: risk ${riskPct.toFixed(1)}%, reward ${rewardPct.toFixed(1)}%, ratio 1:${rrRatio.toFixed(1)}`}
            >
                {/* Background track */}
                <rect
                    x={PADDING_X}
                    y={BAR_Y}
                    width={usableWidth}
                    height={BAR_HEIGHT}
                    rx={6}
                    fill="currentColor"
                    className="text-sentinel-950/80"
                />

                {/* Red zone: stop loss to entry low */}
                <rect
                    x={stopX}
                    y={BAR_Y}
                    width={Math.max(0, entryLowX - stopX)}
                    height={BAR_HEIGHT}
                    rx={6}
                    fill="#ef4444"
                    opacity={0.35}
                />

                {/* Green zone: entry high to target */}
                <rect
                    x={entryHighX}
                    y={BAR_Y}
                    width={Math.max(0, targetX - entryHighX)}
                    height={BAR_HEIGHT}
                    rx={6}
                    fill="#10b981"
                    opacity={0.35}
                />

                {/* Blue entry zone band */}
                <rect
                    x={entryLowX}
                    y={BAR_Y}
                    width={Math.max(2, entryHighX - entryLowX)}
                    height={BAR_HEIGHT}
                    rx={4}
                    fill="#3b82f6"
                    opacity={0.5}
                />

                {/* Stop loss tick */}
                <line
                    x1={stopX}
                    y1={BAR_Y - 4}
                    x2={stopX}
                    y2={BAR_Y + BAR_HEIGHT + 4}
                    stroke="#ef4444"
                    strokeWidth={2}
                />

                {/* Target tick */}
                <line
                    x1={targetX}
                    y1={BAR_Y - 4}
                    x2={targetX}
                    y2={BAR_Y + BAR_HEIGHT + 4}
                    stroke="#10b981"
                    strokeWidth={2}
                />

                {/* Current price marker — dashed white line */}
                {currentX != null && (
                    <>
                        <line
                            x1={currentX}
                            y1={BAR_Y - 8}
                            x2={currentX}
                            y2={BAR_Y + BAR_HEIGHT + 8}
                            stroke="white"
                            strokeWidth={1.5}
                            strokeDasharray="4 3"
                        />
                        <text
                            x={currentX}
                            y={BAR_Y - 12}
                            textAnchor="middle"
                            className="fill-white text-[9px] font-mono"
                        >
                            {currentPrice != null ? formatPrice(currentPrice) : ''}
                        </text>
                    </>
                )}

                {/* Stop loss label */}
                <text
                    x={stopX}
                    y={BAR_Y + BAR_HEIGHT + 16}
                    textAnchor="start"
                    className="fill-red-400 text-[9px] font-mono"
                >
                    Stop {formatPrice(stopLoss)}
                </text>

                {/* Entry zone label */}
                <text
                    x={(entryLowX + entryHighX) / 2}
                    y={BAR_Y + BAR_HEIGHT / 2 + 4}
                    textAnchor="middle"
                    className="fill-blue-200 text-[9px] font-semibold font-mono"
                >
                    Entry
                </text>

                {/* Target label */}
                <text
                    x={targetX}
                    y={BAR_Y + BAR_HEIGHT + 16}
                    textAnchor="end"
                    className="fill-emerald-400 text-[9px] font-mono"
                >
                    Target {formatPrice(targetPrice)}
                </text>

                {/* R:R label centered */}
                <text
                    x={SVG_WIDTH / 2}
                    y={18}
                    textAnchor="middle"
                    className="fill-sentinel-400 text-[10px] font-medium"
                >
                    Risk:Reward 1:{rrRatio.toFixed(1)}
                </text>
            </svg>
        </div>
    );
}
