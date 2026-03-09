/**
 * PositionSizeCard — Shows suggested position size via three methods.
 * Fixed %, risk-based, and Kelly Criterion (most conservative wins).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator, Shield, ArrowRight } from 'lucide-react';
import { PositionSizer } from '@/services/positionSizer';
import { formatPrice } from '@/utils/formatters';

interface PositionSizeCardProps {
    ticker: string;
    currentPrice: number;
    stopLoss: number | null;
    targetPrice: number | null;
    confidenceScore: number;
}

interface SizeResult {
    recommendedPct: number;
    usdValue: number;
    limitReason: string | null;
}

export function PositionSizeCard({
    ticker,
    currentPrice,
    stopLoss,
    targetPrice,
    confidenceScore,
}: PositionSizeCardProps) {
    const navigate = useNavigate();
    const [result, setResult] = useState<SizeResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [calculated, setCalculated] = useState(false);

    async function calculate() {
        setLoading(true);
        try {
            // Derive stats from signal data
            const winRate = confidenceScore / 100;
            const avgWinPct = targetPrice && currentPrice
                ? Math.abs(targetPrice - currentPrice) / currentPrice
                : 0.10;
            const avgLossPct = stopLoss && currentPrice
                ? Math.abs(currentPrice - stopLoss) / currentPrice
                : 0.05;

            const res = await PositionSizer.calculateSize(winRate, avgWinPct, avgLossPct);
            setResult(res);
            setCalculated(true);
        } catch (err) {
            console.error('[PositionSizeCard] Calculation failed:', err);
        } finally {
            setLoading(false);
        }
    }

    const riskRewardRatio = stopLoss && targetPrice && currentPrice
        ? ((Number(targetPrice) - Number(currentPrice)) / (Number(currentPrice) - Number(stopLoss))).toFixed(1)
        : null;

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Calculator className="w-4 h-4 text-teal-400" /> Position Sizing
            </h3>

            {/* Signal metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50">
                    <p className="text-xs text-sentinel-500 mb-1">Price</p>
                    <p className="text-sm font-mono font-bold text-sentinel-200">{formatPrice(currentPrice)}</p>
                </div>
                <div className="bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50">
                    <p className="text-xs text-sentinel-500 mb-1">Stop Loss</p>
                    <p className="text-sm font-mono font-bold text-red-400">{stopLoss ? formatPrice(stopLoss) : '--'}</p>
                </div>
                <div className="bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50">
                    <p className="text-xs text-sentinel-500 mb-1">Target</p>
                    <p className="text-sm font-mono font-bold text-emerald-400">{targetPrice ? formatPrice(targetPrice) : '--'}</p>
                </div>
                <div className="bg-sentinel-950/50 rounded-lg p-3 border border-sentinel-800/50">
                    <p className="text-xs text-sentinel-500 mb-1">R:R Ratio</p>
                    <p className="text-sm font-mono font-bold text-sentinel-200">{riskRewardRatio ? `${riskRewardRatio}:1` : '--'}</p>
                </div>
            </div>

            {/* Calculated result */}
            {calculated && result ? (
                <div className="space-y-3">
                    <div className="bg-sentinel-950/80 rounded-lg p-4 border border-teal-500/20">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-sentinel-500 flex items-center gap-1">
                                <Shield className="w-3 h-3" /> Recommended Size
                            </span>
                            {result.limitReason && (
                                <span className="text-xs text-amber-400">{result.limitReason}</span>
                            )}
                        </div>
                        <div className="flex items-baseline gap-3">
                            <span className="text-2xl font-bold text-sentinel-100 font-mono">
                                {result.recommendedPct}%
                            </span>
                            <span className="text-sm text-sentinel-400">
                                (${result.usdValue.toLocaleString()})
                            </span>
                        </div>
                        {currentPrice > 0 && (
                            <p className="text-xs text-sentinel-500 mt-1">
                                ~{Math.floor(result.usdValue / currentPrice)} shares of {ticker}
                            </p>
                        )}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={calculate}
                            className="flex-1 px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-300 rounded-lg text-sm transition-colors ring-1 ring-sentinel-700"
                        >
                            Recalculate
                        </button>
                        <button
                            onClick={() => {
                                const shares = currentPrice > 0 ? Math.floor(result.usdValue / currentPrice) : 0;
                                const params = new URLSearchParams({
                                    ticker,
                                    side: 'long',
                                    entry: String(currentPrice),
                                    ...(shares > 0 ? { shares: String(shares) } : {}),
                                    ...(stopLoss ? { stop: String(stopLoss) } : {}),
                                    ...(targetPrice ? { target: String(targetPrice) } : {}),
                                    prefill: 'true',
                                });
                                navigate(`/positions?${params.toString()}`);
                            }}
                            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                        >
                            Create Position <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={calculate}
                    disabled={loading}
                    className="w-full px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                    {loading ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <Calculator className="w-4 h-4" />
                    )}
                    Calculate Position Size
                </button>
            )}
        </div>
    );
}
