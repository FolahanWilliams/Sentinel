import { useMemo } from 'react';
import type { TASnapshot, TAAlignment } from '@/types/signals';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

interface TABadgeProps {
    taAlignment: TAAlignment | null;
    taSnapshot: TASnapshot | null;
    compact?: boolean;
}

const alignmentConfig: Record<string, { color: string; bg: string; border: string; label: string; Icon: typeof TrendingUp }> = {
    confirmed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'TA Confirmed', Icon: TrendingUp },
    partial: { color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'TA Partial', Icon: Minus },
    conflicting: { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'TA Conflicts', Icon: TrendingDown },
    unavailable: { color: 'text-sentinel-500', bg: 'bg-sentinel-800/50', border: 'border-sentinel-700/30', label: 'No TA', Icon: AlertTriangle },
};

export function TABadge({ taAlignment, taSnapshot, compact = false }: TABadgeProps) {
    const config = alignmentConfig[taAlignment || 'unavailable'] || alignmentConfig.unavailable;
    const { color, bg, border, label, Icon } = config;

    const tooltipLines = useMemo(() => {
        if (!taSnapshot) return ['No technical data available'];
        const lines: string[] = [];
        if (taSnapshot.rsi14 !== null) {
            const rsiLabel = taSnapshot.rsi14 < 30 ? 'Oversold' : taSnapshot.rsi14 > 70 ? 'Overbought' : 'Neutral';
            lines.push(`RSI(14): ${taSnapshot.rsi14.toFixed(1)} (${rsiLabel})`);
        }
        if (taSnapshot.macd) {
            const macdDir = taSnapshot.macd.histogram > 0 ? 'Bullish' : 'Bearish';
            lines.push(`MACD: ${macdDir} (H: ${taSnapshot.macd.histogram.toFixed(3)})`);
        }
        lines.push(`Trend: ${taSnapshot.trendDirection}`);
        if (taSnapshot.sma50 !== null) lines.push(`SMA50: $${taSnapshot.sma50.toFixed(2)}`);
        if (taSnapshot.sma200 !== null) lines.push(`SMA200: $${taSnapshot.sma200.toFixed(2)}`);
        if (taSnapshot.atr14 !== null) lines.push(`ATR(14): $${taSnapshot.atr14.toFixed(2)}`);
        if (taSnapshot.volumeRatio !== null) lines.push(`Volume: ${taSnapshot.volumeRatio.toFixed(1)}x avg`);
        lines.push(`TA Score: ${taSnapshot.taScore}`);
        return lines;
    }, [taSnapshot]);

    if (compact) {
        return (
            <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${bg} ${border} ${color} cursor-help`}
                title={tooltipLines.join('\n')}
            >
                <Icon className="h-2.5 w-2.5 mr-0.5" />
                {taAlignment === 'confirmed' ? 'TA' : taAlignment === 'conflicting' ? '!TA' : taAlignment === 'partial' ? '~TA' : '?'}
            </span>
        );
    }

    return (
        <div
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border ${bg} ${border} ${color} cursor-help group relative`}
            title={tooltipLines.join('\n')}
        >
            <Icon className="h-3 w-3" />
            <span>{label}</span>
            {taSnapshot && (
                <span className="text-[10px] opacity-70">
                    ({taSnapshot.taScore > 0 ? '+' : ''}{taSnapshot.taScore})
                </span>
            )}
        </div>
    );
}
