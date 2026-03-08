/**
 * SignalComparison — Side-by-side comparison table for trading signals.
 * Renders a horizontal table where columns = signals and rows = metrics.
 * Highlights the "best" value in each row with a subtle green background.
 */

import { X } from 'lucide-react';
import type { Signal } from '@/types/signals';
import { formatPercent, timeAgo } from '@/utils/formatters';

interface SignalComparisonProps {
    signals: Signal[];
    onClose: () => void;
}

type RowDef = {
    label: string;
    render: (signal: Signal) => React.ReactNode;
    bestIndex?: (signals: Signal[]) => number | null;
};

const SIGNAL_TYPE_COLORS: Record<string, string> = {
    long_overreaction: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    short_overreaction: 'bg-red-500/20 text-red-400 border-red-500/30',
    sector_contagion: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    earnings_overreaction: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    bullish_catalyst: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    information: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

const TA_COLORS: Record<string, string> = {
    confirmed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    partial: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    conflicting: 'bg-red-500/20 text-red-400 border-red-500/30',
    unavailable: 'bg-sentinel-700/50 text-sentinel-400 border-sentinel-600/30',
};

const RISK_COLORS: Record<string, string> = {
    low: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    extreme: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const CONFLUENCE_COLORS: Record<string, string> = {
    strong: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    moderate: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    weak: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    none: 'bg-sentinel-700/50 text-sentinel-400 border-sentinel-600/30',
};

function Badge({ text, colorClass }: { text: string; colorClass: string }) {
    return (
        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${colorClass}`}>
            {text}
        </span>
    );
}

function ConfidenceBar({ value }: { value: number }) {
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-sentinel-800 rounded-full overflow-hidden min-w-[60px]">
                <div
                    className="h-full rounded-full bg-teal-500 transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                />
            </div>
            <span className="text-sm font-mono text-sentinel-200 whitespace-nowrap">
                {value.toFixed(1)}%
            </span>
        </div>
    );
}

function highestNumericIndex(signals: Signal[], getter: (s: Signal) => number | null | undefined): number | null {
    let best = -Infinity;
    let idx: number | null = null;
    signals.forEach((s, i) => {
        const v = getter(s);
        if (v != null && v > best) {
            best = v;
            idx = i;
        }
    });
    return idx;
}

function lowestRiskIndex(signals: Signal[]): number | null {
    const order: Record<string, number> = { low: 0, medium: 1, high: 2, extreme: 3 };
    let best = Infinity;
    let idx: number | null = null;
    signals.forEach((s, i) => {
        const rank = order[s.risk_level] ?? 3;
        if (rank < best) {
            best = rank;
            idx = i;
        }
    });
    return idx;
}

function formatSignalType(type: string): string {
    return type
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

const rows: RowDef[] = [
    {
        label: 'Ticker',
        render: (s) => <span className="font-bold text-sentinel-100 text-sm">{s.ticker}</span>,
    },
    {
        label: 'Signal Type',
        render: (s) => (
            <Badge
                text={formatSignalType(s.signal_type)}
                colorClass={SIGNAL_TYPE_COLORS[s.signal_type] ?? 'bg-sentinel-700/50 text-sentinel-400 border-sentinel-600/30'}
            />
        ),
    },
    {
        label: 'Confidence',
        render: (s) => <ConfidenceBar value={s.confidence_score} />,
        bestIndex: (sigs) => highestNumericIndex(sigs, (s) => s.confidence_score),
    },
    {
        label: 'Calibrated Win Rate',
        render: (s) => (
            <span className="text-sm font-mono text-sentinel-200">
                {s.calibrated_confidence != null ? `${s.calibrated_confidence.toFixed(1)}%` : '--'}
            </span>
        ),
        bestIndex: (sigs) => highestNumericIndex(sigs, (s) => s.calibrated_confidence),
    },
    {
        label: 'TA Alignment',
        render: (s) => {
            const alignment = s.ta_alignment ?? 'unavailable';
            return (
                <Badge
                    text={alignment.charAt(0).toUpperCase() + alignment.slice(1)}
                    colorClass={TA_COLORS[alignment] ?? TA_COLORS.unavailable ?? ''}
                />
            );
        },
    },
    {
        label: 'Confluence',
        render: (s) => {
            const level = s.confluence_level ?? 'none';
            return (
                <div className="flex items-center gap-2">
                    {s.confluence_score != null && (
                        <span className="text-sm font-mono text-sentinel-200">{s.confluence_score.toFixed(1)}</span>
                    )}
                    <Badge
                        text={level.charAt(0).toUpperCase() + level.slice(1)}
                        colorClass={CONFLUENCE_COLORS[level] ?? CONFLUENCE_COLORS.none ?? ''}
                    />
                </div>
            );
        },
        bestIndex: (sigs) => highestNumericIndex(sigs, (s) => s.confluence_score),
    },
    {
        label: 'R:R Ratio',
        render: (s) => {
            const rr = s.agent_outputs?.position_sizing?.risk_reward_ratio;
            return (
                <span className="text-sm font-mono text-sentinel-200">
                    {rr != null ? `${rr.toFixed(1)}:1` : '--'}
                </span>
            );
        },
        bestIndex: (sigs) => highestNumericIndex(sigs, (s) => s.agent_outputs?.position_sizing?.risk_reward_ratio),
    },
    {
        label: 'Projected ROI',
        render: (s) => (
            <span className="text-sm font-mono text-sentinel-200">
                {s.projected_roi != null ? formatPercent(s.projected_roi) : '--'}
            </span>
        ),
        bestIndex: (sigs) => highestNumericIndex(sigs, (s) => s.projected_roi),
    },
    {
        label: 'Risk Level',
        render: (s) => (
            <Badge
                text={s.risk_level.charAt(0).toUpperCase() + s.risk_level.slice(1)}
                colorClass={RISK_COLORS[s.risk_level] ?? RISK_COLORS.extreme ?? ''}
            />
        ),
        bestIndex: (sigs) => lowestRiskIndex(sigs),
    },
    {
        label: 'Market Regime',
        render: (s) => {
            const regime = s.agent_outputs?.market_regime?.regime;
            return (
                <span className="text-sm text-sentinel-300">
                    {regime ? regime.charAt(0).toUpperCase() + regime.slice(1) : '--'}
                </span>
            );
        },
    },
    {
        label: 'Created',
        render: (s) => (
            <span className="text-sm text-sentinel-400">{timeAgo(s.created_at)}</span>
        ),
    },
];

export function SignalComparison({ signals, onClose }: SignalComparisonProps) {
    return (
        <div className="bg-sentinel-900/80 rounded-xl border border-sentinel-800/50 backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-sentinel-800/50">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider">
                    Signal Comparison
                </h3>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-sentinel-800 text-sentinel-400 hover:text-sentinel-200 transition-colors"
                    aria-label="Close comparison"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Table with horizontal scroll on mobile */}
            <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                    <thead>
                        <tr className="border-b border-sentinel-800/50">
                            <th className="text-left text-xs font-medium text-sentinel-500 uppercase tracking-wider px-5 py-3 sticky left-0 bg-sentinel-900/95 backdrop-blur-sm z-10 min-w-[140px]">
                                Metric
                            </th>
                            {signals.map((s) => (
                                <th
                                    key={s.id}
                                    className="text-left text-xs font-medium text-sentinel-400 uppercase tracking-wider px-4 py-3 min-w-[150px]"
                                >
                                    {s.ticker}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const bestIdx = row.bestIndex ? row.bestIndex(signals) : null;
                            return (
                                <tr
                                    key={row.label}
                                    className="border-b border-sentinel-800/30 last:border-b-0"
                                >
                                    <td className="text-xs font-medium text-sentinel-400 px-5 py-3 sticky left-0 bg-sentinel-900/95 backdrop-blur-sm z-10 whitespace-nowrap">
                                        {row.label}
                                    </td>
                                    {signals.map((s, i) => (
                                        <td
                                            key={s.id}
                                            className={`px-4 py-3 ${
                                                bestIdx === i
                                                    ? 'bg-emerald-500/10'
                                                    : ''
                                            }`}
                                        >
                                            {row.render(s)}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
