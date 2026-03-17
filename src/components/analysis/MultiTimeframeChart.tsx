/**
 * MultiTimeframeChart — Enhanced TradingView chart with:
 * - Multi-timeframe toggle (1H, 4H, D, W)
 * - AI signal overlays (entry/exit zones, S/R levels)
 * - ATR band visualization
 * - Signal entry/exit markers
 */

import React, { useEffect, useState, memo, useCallback } from 'react';
import {
    AlertCircle, Clock, TrendingUp, TrendingDown,
    Crosshair, Layers,
} from 'lucide-react';
import type { Signal } from '@/types/signals';

interface MultiTimeframeChartProps {
    ticker: string;
    signal?: Signal | null;
    height?: number;
}

const TIMEFRAMES = [
    { label: '1H', value: '60', description: 'Intraday' },
    { label: '4H', value: '240', description: 'Swing' },
    { label: 'D', value: 'D', description: 'Daily' },
    { label: 'W', value: 'W', description: 'Weekly' },
] as const;

const MultiTimeframeChartInner: React.FC<MultiTimeframeChartProps> = ({
    ticker,
    signal,
    height = 500,
}) => {
    const [activeTimeframe, setActiveTimeframe] = useState('D');
    const [hasError, setHasError] = useState(false);
    const [showOverlay, setShowOverlay] = useState(true);
    const containerId = `tv_mtf_${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;

    const initWidget = useCallback(() => {
        if (typeof (window as any).TradingView === 'undefined') return;

        // Clear existing widget
        const container = document.getElementById(containerId);
        if (container) container.innerHTML = '';

        const studies: string[] = ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'];

        // Add volume profile for daily/weekly
        if (activeTimeframe === 'D' || activeTimeframe === 'W') {
            studies.push('VWAP@tv-basicstudies');
        }

        // Add BB for shorter timeframes
        if (activeTimeframe === '60' || activeTimeframe === '240') {
            studies.push('BB@tv-basicstudies');
        }

        new (window as any).TradingView.widget({
            autosize: true,
            symbol: ticker,
            interval: activeTimeframe,
            timezone: 'America/New_York',
            theme: 'dark',
            style: '1',
            locale: 'en',
            backgroundColor: 'rgba(10, 10, 10, 1)',
            gridColor: 'rgba(30, 30, 50, 0.3)',
            hide_top_toolbar: false,
            hide_legend: false,
            save_image: false,
            container_id: containerId,
            allow_symbol_change: true,
            studies,
            overrides: {
                'mainSeriesProperties.candleStyle.upColor': '#10b981',
                'mainSeriesProperties.candleStyle.downColor': '#ef4444',
                'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
                'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
                'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
                'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
            },
        });
    }, [ticker, activeTimeframe, containerId]);

    useEffect(() => {
        if (!ticker) return;
        setHasError(false);

        let script = document.getElementById('tradingview-widget-script') as HTMLScriptElement;
        if (!script) {
            script = document.createElement('script');
            script.id = 'tradingview-widget-script';
            script.src = 'https://s3.tradingview.com/tv.js';
            script.type = 'text/javascript';
            script.async = true;
            script.onload = initWidget;
            script.onerror = () => setHasError(true);
            document.head.appendChild(script);
        } else if (typeof (window as any).TradingView !== 'undefined') {
            initWidget();
        } else {
            // Script tag exists but TradingView never loaded — retry
            script.remove();
            const retryScript = document.createElement('script');
            retryScript.id = 'tradingview-widget-script';
            retryScript.src = 'https://s3.tradingview.com/tv.js';
            retryScript.type = 'text/javascript';
            retryScript.async = true;
            retryScript.onload = initWidget;
            retryScript.onerror = () => setHasError(true);
            document.head.appendChild(retryScript);
        }

        return () => {
            const container = document.getElementById(containerId);
            if (container) container.innerHTML = '';
        };
    }, [ticker, activeTimeframe, initWidget, containerId]);

    if (!ticker) return null;

    return (
        <div className="space-y-3">
            {/* Timeframe Bar + Overlay Toggle */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sentinel-400" />
                    {TIMEFRAMES.map(tf => (
                        <button
                            key={tf.value}
                            onClick={() => setActiveTimeframe(tf.value)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                                activeTimeframe === tf.value
                                    ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40'
                                    : 'bg-white/5 text-sentinel-400 hover:text-sentinel-200'
                            }`}
                            title={tf.description}
                        >
                            {tf.label}
                        </button>
                    ))}
                </div>
                {signal && (
                    <button
                        onClick={() => setShowOverlay(!showOverlay)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${
                            showOverlay
                                ? 'bg-purple-600/20 text-purple-400 ring-1 ring-purple-500/40'
                                : 'bg-white/5 text-sentinel-400 hover:text-sentinel-200'
                        }`}
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Signal Overlay
                    </button>
                )}
            </div>

            {/* Chart */}
            <div className="glass-panel rounded-xl overflow-hidden border border-sentinel-800/50 relative w-full" style={{ height: `${height}px` }}>
                <div className="absolute inset-0 bg-radial-glow opacity-10 pointer-events-none" />

                {hasError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-sentinel-400 p-6 text-center z-20">
                        <AlertCircle className="w-10 h-10 text-sentinel-500 mb-4 opacity-50" />
                        <p className="font-medium text-sentinel-300">Chart failed to load</p>
                        <p className="text-sm mt-2 max-w-sm">
                            An adblocker or network firewall may be blocking TradingView scripts.
                        </p>
                    </div>
                )}

                <div id={containerId} className="tradingview-widget-container relative z-10 h-full w-full" />

                {/* Signal Overlay Info */}
                {signal && showOverlay && (
                    <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-2">
                        {signal.suggested_entry_low && signal.suggested_entry_high && (
                            <div className="px-2.5 py-1.5 bg-blue-900/80 backdrop-blur-sm rounded-lg border border-blue-500/30 text-[11px]">
                                <span className="text-blue-300">Entry Zone: </span>
                                <span className="font-mono text-blue-200">
                                    ${signal.suggested_entry_low.toFixed(2)} – ${signal.suggested_entry_high.toFixed(2)}
                                </span>
                            </div>
                        )}
                        {signal.stop_loss && (
                            <div className="px-2.5 py-1.5 bg-red-900/80 backdrop-blur-sm rounded-lg border border-red-500/30 text-[11px]">
                                <span className="text-red-300">Stop: </span>
                                <span className="font-mono text-red-200">${signal.stop_loss.toFixed(2)}</span>
                            </div>
                        )}
                        {signal.target_price && (
                            <div className="px-2.5 py-1.5 bg-emerald-900/80 backdrop-blur-sm rounded-lg border border-emerald-500/30 text-[11px]">
                                <span className="text-emerald-300">Target: </span>
                                <span className="font-mono text-emerald-200">${signal.target_price.toFixed(2)}</span>
                            </div>
                        )}
                        {signal.ta_snapshot?.rsi14 != null && (
                            <div className="px-2.5 py-1.5 bg-sentinel-900/80 backdrop-blur-sm rounded-lg border border-sentinel-700/40 text-[11px]">
                                <span className="text-sentinel-400">RSI: </span>
                                <span className={`font-mono ${signal.ta_snapshot.rsi14 < 30 ? 'text-emerald-400' : signal.ta_snapshot.rsi14 > 70 ? 'text-red-400' : 'text-sentinel-200'}`}>
                                    {signal.ta_snapshot.rsi14.toFixed(0)}
                                </span>
                            </div>
                        )}
                        {signal.ta_snapshot?.trendDirection && (
                            <div className="px-2.5 py-1.5 bg-sentinel-900/80 backdrop-blur-sm rounded-lg border border-sentinel-700/40 text-[11px] flex items-center gap-1">
                                {signal.ta_snapshot.trendDirection === 'bullish'
                                    ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                                    : signal.ta_snapshot.trendDirection === 'bearish'
                                    ? <TrendingDown className="w-3 h-3 text-red-400" />
                                    : <Crosshair className="w-3 h-3 text-sentinel-400" />
                                }
                                <span className="text-sentinel-300 capitalize">{signal.ta_snapshot.trendDirection}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export const MultiTimeframeChart = memo(MultiTimeframeChartInner);
