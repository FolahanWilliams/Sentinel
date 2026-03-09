/**
 * MarketRegimeIndicator — Displays current market regime as a badge.
 *
 * Compact mode: small pill for header bar.
 * Shows regime type (bull/neutral/correction/crisis) with color coding.
 * Click to see expanded details in a popover.
 */

import { useState, useRef, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { useMarketRegime } from '@/hooks/useMarketRegime';

const REGIME_CONFIG = {
    bull: {
        label: 'Bull',
        icon: TrendingUp,
        bgClass: 'bg-emerald-500/15',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/30',
    },
    neutral: {
        label: 'Neutral',
        icon: Minus,
        bgClass: 'bg-sentinel-700/30',
        textClass: 'text-sentinel-400',
        borderClass: 'border-sentinel-600/30',
    },
    correction: {
        label: 'Correction',
        icon: TrendingDown,
        bgClass: 'bg-amber-500/15',
        textClass: 'text-amber-400',
        borderClass: 'border-amber-500/30',
    },
    crisis: {
        label: 'Crisis',
        icon: AlertTriangle,
        bgClass: 'bg-red-500/15',
        textClass: 'text-red-400',
        borderClass: 'border-red-500/30',
    },
} as const;

export function MarketRegimeIndicator() {
    const { regime, loading, lastChecked } = useMarketRegime();
    const [showPopover, setShowPopover] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Close popover on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setShowPopover(false);
            }
        }
        if (showPopover) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showPopover]);

    if (loading || !regime) {
        return (
            <div className="px-2.5 py-1 rounded-full bg-sentinel-800/50 border border-sentinel-700/30">
                <span className="text-[10px] font-mono text-sentinel-500 animate-pulse">Regime...</span>
            </div>
        );
    }

    const config = REGIME_CONFIG[regime.regime];
    const Icon = config.icon;

    const minutesAgo = lastChecked ? Math.round((Date.now() - lastChecked) / 60000) : null;

    return (
        <div className="relative" ref={popoverRef}>
            <button
                onClick={() => setShowPopover(!showPopover)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${config.bgClass} ${config.textClass} ${config.borderClass}`}
                title={`Market Regime: ${config.label}`}
            >
                <Icon className="w-3 h-3" />
                <span className="hidden md:inline">{config.label}</span>
            </button>

            {/* Popover */}
            {showPopover && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-sentinel-900/98 border border-sentinel-800/60 rounded-xl shadow-2xl z-[100] backdrop-blur-xl overflow-hidden">
                    <div className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <Icon className={`w-5 h-5 ${config.textClass}`} />
                            <h3 className={`text-sm font-bold ${config.textClass}`}>
                                Market Regime: {config.label}
                            </h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div className="bg-sentinel-800/40 rounded-lg p-2.5">
                                <div className="text-sentinel-500 mb-1">VIX Level</div>
                                <div className="font-mono font-bold text-sentinel-200">
                                    {regime.vixLevel !== null ? regime.vixLevel.toFixed(1) : 'N/A'}
                                </div>
                            </div>
                            <div className="bg-sentinel-800/40 rounded-lg p-2.5">
                                <div className="text-sentinel-500 mb-1">SPY vs 200-SMA</div>
                                <div className="font-mono font-bold text-sentinel-200">
                                    {regime.spyTrend === 'above_200sma' ? 'Above' :
                                     regime.spyTrend === 'below_200sma' ? 'Below' : 'Unknown'}
                                </div>
                            </div>
                            <div className="bg-sentinel-800/40 rounded-lg p-2.5">
                                <div className="text-sentinel-500 mb-1">SPY Weekly</div>
                                <div className={`font-mono font-bold ${regime.spyChangeWeek !== null && regime.spyChangeWeek >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {regime.spyChangeWeek !== null ? `${regime.spyChangeWeek > 0 ? '+' : ''}${regime.spyChangeWeek.toFixed(1)}%` : 'N/A'}
                                </div>
                            </div>
                            <div className="bg-sentinel-800/40 rounded-lg p-2.5">
                                <div className="text-sentinel-500 mb-1">Signal Penalty</div>
                                <div className={`font-mono font-bold ${regime.confidencePenalty < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {regime.confidencePenalty}%
                                </div>
                            </div>
                        </div>

                        <p className="text-[11px] text-sentinel-400 leading-relaxed">
                            {regime.reason}
                        </p>

                        {minutesAgo !== null && (
                            <div className="text-[10px] text-sentinel-600 font-mono">
                                Last checked: {minutesAgo < 1 ? 'Just now' : `${minutesAgo}m ago`}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
