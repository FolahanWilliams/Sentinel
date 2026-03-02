/**
 * TradingView Advanced Chart — Sentinel Integration
 *
 * Embeds TradingView's free Advanced Chart widget, auto-synced to the active ticker.
 * Dark theme matches the Sentinel aesthetic.
 */

import React, { useEffect, useRef, memo } from 'react';

interface TradingViewChartProps {
    ticker: string;
    height?: number;
}

const TradingViewChartInner: React.FC<TradingViewChartProps> = ({ ticker, height = 500 }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || !ticker) return;

        // Clear previous widget
        containerRef.current.innerHTML = '';

        const script = document.createElement('script');
        script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
        script.type = 'text/javascript';
        script.async = true;
        script.innerHTML = JSON.stringify({
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
            calendar: false,
            hide_volume: false,
            support_host: 'https://www.tradingview.com',
            allow_symbol_change: true,
            studies: ['RSI@tv-basicstudies', 'MASimple@tv-basicstudies'],
            withdateranges: true,
        });

        containerRef.current.appendChild(script);

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [ticker]);

    if (!ticker) return null;

    return (
        <div className="glass-panel rounded-xl overflow-hidden border border-sentinel-800/50 relative">
            <div className="absolute inset-0 bg-radial-glow opacity-10 pointer-events-none" />
            <div
                ref={containerRef}
                className="tradingview-widget-container relative z-10"
                style={{ height: `${height}px`, width: '100%' }}
            />
        </div>
    );
};

export const TradingViewChart = memo(TradingViewChartInner);
