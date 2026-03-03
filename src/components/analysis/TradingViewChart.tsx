/**
 * TradingView Advanced Chart — Sentinel Integration
 *
 * Embeds TradingView's free Advanced Chart widget, auto-synced to the active ticker.
 * Dark theme matches the Sentinel aesthetic.
 */

import React, { useEffect, memo } from 'react';

interface TradingViewChartProps {
    ticker: string;
    height?: number;
}

const TradingViewChartInner: React.FC<TradingViewChartProps> = ({ ticker, height = 500 }) => {
    const containerId = `tv_chart_${ticker.replace(/[^a-zA-Z0-9]/g, '')}`;

    useEffect(() => {
        if (!ticker) return;

        const initWidget = () => {
            if (typeof (window as any).TradingView !== 'undefined') {
                new (window as any).TradingView.widget({
                    autosize: true,
                    symbol: ticker,
                    interval: 'D',
                    timezone: 'America/New_York',
                    theme: 'dark',
                    style: '1', // Candlestick
                    locale: 'en',
                    backgroundColor: 'rgba(10, 10, 10, 1)',
                    gridColor: 'rgba(30, 30, 50, 0.3)',
                    hide_top_toolbar: false,
                    hide_legend: false,
                    save_image: false,
                    container_id: containerId,
                    allow_symbol_change: true,
                    studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'],
                });
            }
        };

        // Check if script already exists to avoid duplicate loads
        let script = document.getElementById('tradingview-widget-script') as HTMLScriptElement;

        if (!script) {
            script = document.createElement('script');
            script.id = 'tradingview-widget-script';
            script.src = 'https://s3.tradingview.com/tv.js';
            script.type = 'text/javascript';
            script.async = true;
            script.onload = initWidget;
            document.head.appendChild(script);
        } else {
            // If already loaded, just initialize our widget
            initWidget();
        }

        return () => {
            // Cleanup on unmount (TradingView container contents)
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = '';
            }
        };
    }, [ticker, containerId]);

    if (!ticker) return null;

    return (
        <div className="glass-panel rounded-xl overflow-hidden border border-sentinel-800/50 relative w-full" style={{ height: `${height}px` }}>
            {/* Dark overlay for aesthetic effect */}
            <div className="absolute inset-0 bg-radial-glow opacity-10 pointer-events-none" />

            <div
                id={containerId}
                className="tradingview-widget-container relative z-10 h-full w-full"
            />
        </div>
    );
};

export const TradingViewChart = memo(TradingViewChartInner);
