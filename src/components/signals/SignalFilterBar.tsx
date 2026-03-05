/**
 * SignalFilterBar — Reusable filter bar for AI trading signals.
 *
 * Provides sector, confidence, signal type, and bias filters.
 * Renders as a compact bar with dropdowns, a range slider, and
 * active filter pills that can be dismissed.
 */

import { useState } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface SignalFilters {
    sector: string;
    minConfidence: number;
    signalType: 'all' | 'overreaction' | 'contagion';
    bias: 'all' | 'bullish' | 'bearish';
    confluenceOnly: boolean;
}

const SECTORS = [
    'All Sectors',
    'Technology',
    'Healthcare',
    'Finance',
    'Energy',
    'Consumer',
    'Industrial',
    'Real Estate',
    'Communications',
    'Utilities',
    'Materials',
];

interface SignalFilterBarProps {
    filters: SignalFilters;
    onChange: (filters: SignalFilters) => void;
    totalCount: number;
    filteredCount: number;
}

export function SignalFilterBar({ filters, onChange, totalCount, filteredCount }: SignalFilterBarProps) {
    const [expanded, setExpanded] = useState(false);

    const update = (patch: Partial<SignalFilters>) => {
        onChange({ ...filters, ...patch });
    };

    const activeFilters: { label: string; onClear: () => void }[] = [];

    if (filters.sector !== 'All Sectors') {
        activeFilters.push({ label: `Sector: ${filters.sector}`, onClear: () => update({ sector: 'All Sectors' }) });
    }
    if (filters.minConfidence > 0) {
        activeFilters.push({ label: `Conf ≥ ${filters.minConfidence}%`, onClear: () => update({ minConfidence: 0 }) });
    }
    if (filters.signalType !== 'all') {
        activeFilters.push({ label: `Type: ${filters.signalType}`, onClear: () => update({ signalType: 'all' }) });
    }
    if (filters.bias !== 'all') {
        activeFilters.push({ label: `Bias: ${filters.bias}`, onClear: () => update({ bias: 'all' }) });
    }
    if (filters.confluenceOnly) {
        activeFilters.push({ label: 'Confluence Only', onClear: () => update({ confluenceOnly: false }) });
    }

    const hasFilters = activeFilters.length > 0;

    return (
        <div className="space-y-2">
            {/* Toggle Row */}
            <div className="flex items-center justify-between">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border-none ${expanded || hasFilters
                        ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30'
                        : 'bg-sentinel-800/50 text-sentinel-400 hover:text-sentinel-200'
                        }`}
                >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Filters
                    {hasFilters && (
                        <span className="w-4 h-4 rounded-full bg-purple-500 text-white text-[10px] font-bold flex items-center justify-center">
                            {activeFilters.length}
                        </span>
                    )}
                </button>
                {hasFilters && (
                    <span className="text-[11px] text-sentinel-500 font-mono">
                        {filteredCount} / {totalCount} signals
                    </span>
                )}
            </div>

            {/* Active Filter Pills */}
            <AnimatePresence>
                {hasFilters && !expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex flex-wrap gap-1.5"
                    >
                        {activeFilters.map(f => (
                            <span key={f.label} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sentinel-800/60 text-sentinel-300 text-[10px] font-medium ring-1 ring-sentinel-700/40">
                                {f.label}
                                <button onClick={f.onClear} className="hover:text-red-400 transition-colors cursor-pointer bg-transparent border-none p-0 text-sentinel-500">
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            </span>
                        ))}
                        <button
                            onClick={() => onChange({ sector: 'All Sectors', minConfidence: 0, signalType: 'all', bias: 'all', confluenceOnly: false })}
                            className="text-[10px] text-sentinel-500 hover:text-red-400 transition-colors cursor-pointer bg-transparent border-none"
                        >
                            Clear all
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Expanded Filter Panel */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-4 backdrop-blur-sm space-y-4"
                    >
                        <div className="grid grid-cols-2 gap-3">
                            {/* Sector */}
                            <div>
                                <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Sector</label>
                                <select
                                    value={filters.sector}
                                    onChange={e => update({ sector: e.target.value })}
                                    className="w-full px-2.5 py-2 bg-sentinel-950 border border-sentinel-800 rounded-lg text-xs text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                >
                                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            {/* Signal Type */}
                            <div>
                                <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Signal Type</label>
                                <select
                                    value={filters.signalType}
                                    onChange={e => update({ signalType: e.target.value as any })}
                                    className="w-full px-2.5 py-2 bg-sentinel-950 border border-sentinel-800 rounded-lg text-xs text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                >
                                    <option value="all">All Types</option>
                                    <option value="overreaction">Overreaction</option>
                                    <option value="contagion">Contagion</option>
                                </select>
                            </div>

                            {/* Bias */}
                            <div>
                                <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Bias</label>
                                <select
                                    value={filters.bias}
                                    onChange={e => update({ bias: e.target.value as any })}
                                    className="w-full px-2.5 py-2 bg-sentinel-950 border border-sentinel-800 rounded-lg text-xs text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                >
                                    <option value="all">All</option>
                                    <option value="bullish">Bullish</option>
                                    <option value="bearish">Bearish</option>
                                </select>
                            </div>

                            {/* Confidence */}
                            <div>
                                <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">
                                    Min Confidence: {filters.minConfidence}%
                                </label>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={filters.minConfidence}
                                    onChange={e => update({ minConfidence: Number(e.target.value) })}
                                    className="w-full accent-purple-500 mt-1"
                                />
                            </div>
                        </div>

                        {/* Confluence Toggle */}
                        <div className="flex items-center gap-3 pt-1">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={filters.confluenceOnly}
                                    onChange={e => update({ confluenceOnly: e.target.checked })}
                                    className="accent-emerald-500 w-3.5 h-3.5"
                                />
                                <span className="text-xs text-sentinel-300">High-ROI Only (Confluence Confirmed)</span>
                            </label>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-sentinel-800/30">
                            <button
                                onClick={() => onChange({ sector: 'All Sectors', minConfidence: 0, signalType: 'all', bias: 'all', confluenceOnly: false })}
                                className="text-[10px] text-sentinel-500 hover:text-red-400 transition-colors cursor-pointer bg-transparent border-none"
                            >
                                Reset all filters
                            </button>
                            <button
                                onClick={() => setExpanded(false)}
                                className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors cursor-pointer bg-transparent border-none font-medium"
                            >
                                Done
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/**
 * Utility: Apply filters to a signal array.
 * Expects signals from the `signals` table shape.
 */
export function applySignalFilters(signals: any[], filters: SignalFilters): any[] {
    const filtered = signals.filter(s => {
        if (filters.sector !== 'All Sectors') {
            const sector = (s.sector || '').toLowerCase();
            if (!sector.includes(filters.sector.toLowerCase())) return false;
        }
        if (filters.minConfidence > 0) {
            if ((s.confidence_score || 0) < filters.minConfidence) return false;
        }
        if (filters.signalType !== 'all') {
            const type = (s.signal_type || '').toLowerCase();
            if (!type.includes(filters.signalType)) return false;
        }
        if (filters.bias !== 'all') {
            const bias = (s.bias_type || '').toLowerCase();
            if (!bias.includes(filters.bias)) return false;
        }
        if (filters.confluenceOnly) {
            if (!s.confluence_level || s.confluence_level === 'none' || s.confluence_level === 'weak') return false;
        }
        return true;
    });

    // Sort by projected ROI (desc) when confluence filter is on
    if (filters.confluenceOnly) {
        filtered.sort((a, b) => (b.projected_roi || 0) - (a.projected_roi || 0));
    }

    return filtered;
}
