/**
 * StrategyChart — Interactive candlestick chart with Sentinel buy/sell signal overlays.
 *
 * Uses TradingView's open-source lightweight-charts library for full programmatic
 * control over markers, price lines, and sub-chart indicators.
 *
 * Displays:
 * - Candlestick chart with volume histogram
 * - Buy/sell signal markers computed from the Sentinel TA engine
 * - Stop loss & target price lines for the most recent signal
 * - SMA 50/200 trend lines
 * - Info panel showing TA composite score and confluence
 */

import { useEffect, useRef, useState, useCallback, memo } from 'react';
import {
    createChart,
    type IChartApi,
    type ISeriesApi,
    type CandlestickData,
    type HistogramData,
    type LineData,
    ColorType,
    CrosshairMode,
    type SeriesMarker,
    type Time,
} from 'lightweight-charts';
import { Loader2, AlertCircle, BarChart3, Activity } from 'lucide-react';
import { TechnicalAnalysisService } from '@/services/technicalAnalysis';
import { useStrategySignals, type OHLCV, type StrategySignal } from '@/hooks/useStrategySignals';

interface StrategyChartProps {
    ticker: string;
    height?: number;
}

function toTime(dateStr: string): Time {
    return dateStr as Time;
}

const StrategyChartInner: React.FC<StrategyChartProps> = ({ ticker, height = 600 }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

    const [bars, setBars] = useState<OHLCV[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedSignal, setSelectedSignal] = useState<StrategySignal | null>(null);

    // Compute signals from bars
    const signals = useStrategySignals(bars);

    // Fetch historical data
    useEffect(() => {
        if (!ticker) return;
        let cancelled = false;

        async function fetchData() {
            setLoading(true);
            setError(null);
            setBars([]);
            setSelectedSignal(null);

            try {
                const data = await TechnicalAnalysisService.fetchHistoricalBars(ticker);
                if (cancelled) return;
                if (data.length < 50) {
                    setError(`Insufficient data for ${ticker} (${data.length} bars)`);
                    return;
                }
                setBars(data);
            } catch (err: any) {
                if (!cancelled) setError(err.message || 'Failed to fetch data');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        fetchData();
        return () => { cancelled = true; };
    }, [ticker]);

    // Build and update chart
    useEffect(() => {
        if (!containerRef.current || bars.length === 0) return;

        // Clean up previous chart
        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
        }

        const chart = createChart(containerRef.current, {
            width: containerRef.current.clientWidth,
            height,
            layout: {
                background: { type: ColorType.Solid, color: 'rgba(10, 10, 15, 1)' },
                textColor: 'rgba(150, 150, 180, 0.8)',
                fontSize: 11,
            },
            grid: {
                vertLines: { color: 'rgba(30, 30, 50, 0.3)' },
                horzLines: { color: 'rgba(30, 30, 50, 0.3)' },
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: { color: 'rgba(100, 100, 240, 0.3)', width: 1 },
                horzLine: { color: 'rgba(100, 100, 240, 0.3)', width: 1 },
            },
            rightPriceScale: {
                borderColor: 'rgba(30, 30, 50, 0.5)',
            },
            timeScale: {
                borderColor: 'rgba(30, 30, 50, 0.5)',
                timeVisible: false,
            },
        });

        chartRef.current = chart;

        // ── Candlestick series ──
        const candleSeries = chart.addCandlestickSeries({
            upColor: '#10b981',
            downColor: '#ef4444',
            borderUpColor: '#10b981',
            borderDownColor: '#ef4444',
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });
        candleSeriesRef.current = candleSeries;

        const candleData: CandlestickData[] = bars.map(b => ({
            time: toTime(b.date),
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
        }));
        candleSeries.setData(candleData);

        // ── Volume histogram ──
        const volumeSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'volume',
        });
        chart.priceScale('volume').applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
        });

        const volumeData: HistogramData[] = bars.map(b => ({
            time: toTime(b.date),
            value: b.volume,
            color: b.close >= b.open ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
        }));
        volumeSeries.setData(volumeData);

        // ── SMA 50 line ──
        const sma50Series = chart.addLineSeries({
            color: 'rgba(74, 158, 255, 0.5)',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        const sma50Data: LineData[] = [];
        for (let i = 49; i < bars.length; i++) {
            let sum = 0;
            for (let j = i - 49; j <= i; j++) sum += bars[j]!.close;
            sma50Data.push({ time: toTime(bars[i]!.date), value: sum / 50 });
        }
        sma50Series.setData(sma50Data);

        // ── SMA 200 line ──
        const sma200Series = chart.addLineSeries({
            color: 'rgba(245, 158, 11, 0.4)',
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
        });
        const sma200Data: LineData[] = [];
        for (let i = 199; i < bars.length; i++) {
            let sum = 0;
            for (let j = i - 199; j <= i; j++) sum += bars[j]!.close;
            sma200Data.push({ time: toTime(bars[i]!.date), value: sum / 200 });
        }
        sma200Series.setData(sma200Data);

        // ── Signal markers ──
        if (signals.length > 0) {
            const markers: SeriesMarker<Time>[] = signals.map(sig => ({
                time: toTime(sig.date),
                position: sig.direction === 'long' ? 'belowBar' as const : 'aboveBar' as const,
                color: sig.direction === 'long' ? '#10b981' : '#ef4444',
                shape: sig.direction === 'long' ? 'arrowUp' as const : 'arrowDown' as const,
                text: `${sig.direction === 'long' ? 'BUY' : 'SELL'} ${sig.confluence}%`,
            }));
            candleSeries.setMarkers(markers);

            // Show the most recent signal's stop/target as price lines
            const lastSignal = signals[signals.length - 1]!;
            setSelectedSignal(lastSignal);

            candleSeries.createPriceLine({
                price: lastSignal.stopLoss,
                color: 'rgba(239, 68, 68, 0.6)',
                lineWidth: 1,
                lineStyle: 2, // Dashed
                axisLabelVisible: true,
                title: 'Stop Loss',
            });
            candleSeries.createPriceLine({
                price: lastSignal.target,
                color: 'rgba(16, 185, 129, 0.6)',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Target',
            });
            candleSeries.createPriceLine({
                price: lastSignal.price,
                color: 'rgba(74, 158, 255, 0.5)',
                lineWidth: 1,
                lineStyle: 1, // Dotted
                axisLabelVisible: true,
                title: 'Entry',
            });
        }

        // Fit content
        chart.timeScale().fitContent();

        // ── Resize observer ──
        const resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                const { width } = entry.contentRect;
                chart.applyOptions({ width });
            }
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
            chart.remove();
            chartRef.current = null;
        };
    }, [bars, signals, height]);

    const handleSignalClick = useCallback((sig: StrategySignal) => {
        setSelectedSignal(sig);
        // Scroll chart to signal bar
        if (chartRef.current) {
            chartRef.current.timeScale().scrollToPosition(sig.barIndex - bars.length + 10, false);
        }
    }, [bars.length]);

    if (!ticker) return null;

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-semibold text-sentinel-200">Sentinel Strategy View</span>
                    <span className="text-xs text-sentinel-500">— TA-based buy/sell signals</span>
                </div>
                {signals.length > 0 && (
                    <div className="flex items-center gap-3 text-xs">
                        <span className="text-sentinel-500">
                            {signals.filter(s => s.direction === 'long').length} buys
                        </span>
                        <span className="text-sentinel-500">
                            {signals.filter(s => s.direction === 'short').length} sells
                        </span>
                        <span className="text-sentinel-600">|</span>
                        <span className="text-sentinel-500">{bars.length} bars</span>
                    </div>
                )}
            </div>

            {/* Chart container */}
            <div className="glass-panel rounded-xl overflow-hidden border border-sentinel-800/50 relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center z-20 bg-black/40 backdrop-blur-sm">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                        <span className="ml-2 text-sm text-sentinel-300">Loading {ticker} data...</span>
                    </div>
                )}

                {error && (
                    <div className="flex flex-col items-center justify-center text-sentinel-400 p-10 text-center" style={{ height }}>
                        <AlertCircle className="w-8 h-8 text-sentinel-500 mb-3 opacity-50" />
                        <p className="font-medium text-sentinel-300">{error}</p>
                    </div>
                )}

                {!error && <div ref={containerRef} style={{ height }} />}

                {/* Selected signal overlay */}
                {selectedSignal && !loading && (
                    <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-2">
                        <div className={`px-2.5 py-1.5 backdrop-blur-sm rounded-lg border text-[11px] ${
                            selectedSignal.direction === 'long'
                                ? 'bg-emerald-900/80 border-emerald-500/30'
                                : 'bg-red-900/80 border-red-500/30'
                        }`}>
                            <span className={selectedSignal.direction === 'long' ? 'text-emerald-300' : 'text-red-300'}>
                                {selectedSignal.direction === 'long' ? 'LONG' : 'SHORT'}
                            </span>
                            <span className="text-sentinel-300 ml-1.5">
                                @ ${selectedSignal.price.toFixed(2)}
                            </span>
                        </div>
                        <div className="px-2.5 py-1.5 bg-red-900/80 backdrop-blur-sm rounded-lg border border-red-500/30 text-[11px]">
                            <span className="text-red-300">Stop: </span>
                            <span className="font-mono text-red-200">${selectedSignal.stopLoss.toFixed(2)}</span>
                        </div>
                        <div className="px-2.5 py-1.5 bg-emerald-900/80 backdrop-blur-sm rounded-lg border border-emerald-500/30 text-[11px]">
                            <span className="text-emerald-300">Target: </span>
                            <span className="font-mono text-emerald-200">${selectedSignal.target.toFixed(2)}</span>
                        </div>
                        <div className="px-2.5 py-1.5 bg-sentinel-900/80 backdrop-blur-sm rounded-lg border border-sentinel-700/40 text-[11px]">
                            <span className="text-sentinel-400">TA: </span>
                            <span className={`font-mono ${selectedSignal.taScore > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {selectedSignal.taScore > 0 ? '+' : ''}{selectedSignal.taScore}
                            </span>
                        </div>
                        <div className={`px-2.5 py-1.5 backdrop-blur-sm rounded-lg border text-[11px] ${
                            selectedSignal.confluenceLevel === 'strong'
                                ? 'bg-emerald-900/80 border-emerald-500/30'
                                : selectedSignal.confluenceLevel === 'moderate'
                                ? 'bg-blue-900/80 border-blue-500/30'
                                : 'bg-sentinel-900/80 border-sentinel-700/40'
                        }`}>
                            <span className="text-sentinel-400">Confluence: </span>
                            <span className="font-mono text-sentinel-200">
                                {selectedSignal.confluence}% ({selectedSignal.confluenceLevel})
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Signal list */}
            {signals.length > 0 && (
                <div className="glass-panel rounded-xl p-4 border border-sentinel-800/50">
                    <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="w-3.5 h-3.5 text-sentinel-400" />
                        <span className="text-xs font-semibold text-sentinel-300 uppercase tracking-wider">Signal History</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-sentinel-800">
                        <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] gap-x-4 gap-y-1.5 text-[11px]">
                            {signals.slice().reverse().map((sig, idx) => (
                                <button
                                    key={`${sig.date}-${sig.direction}`}
                                    onClick={() => handleSignalClick(sig)}
                                    className={`contents cursor-pointer ${
                                        selectedSignal?.barIndex === sig.barIndex ? 'font-bold' : ''
                                    }`}
                                >
                                    <span className="text-sentinel-500 font-mono">{sig.date}</span>
                                    <span className={`font-semibold ${sig.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {sig.direction === 'long' ? 'BUY' : 'SELL'}
                                    </span>
                                    <span className="font-mono text-sentinel-300">${sig.price.toFixed(2)}</span>
                                    <span className="text-sentinel-500">TA {sig.taScore > 0 ? '+' : ''}{sig.taScore}</span>
                                    <span className={`${
                                        sig.confluenceLevel === 'strong' ? 'text-emerald-400' :
                                        sig.confluenceLevel === 'moderate' ? 'text-blue-400' : 'text-sentinel-500'
                                    }`}>
                                        {sig.confluence}%
                                    </span>
                                    <span className="text-sentinel-600 uppercase">{sig.confluenceLevel}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const StrategyChart = memo(StrategyChartInner);
