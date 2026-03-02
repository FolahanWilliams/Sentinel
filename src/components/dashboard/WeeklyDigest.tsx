/**
 * WeeklyDigest — Shows a weekly performance summary on the Dashboard.
 */

import { useState, useEffect } from 'react';
import { performanceStats, type WeeklyDigest as WeeklyDigestData } from '@/services/performanceStats';
import { TrendingUp, TrendingDown, Lightbulb, BarChart3 } from 'lucide-react';

export function WeeklyDigest() {
    const [digest, setDigest] = useState<WeeklyDigestData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetch() {
            try {
                const d = await performanceStats.getWeeklyDigest();
                setDigest(d);
            } catch (err) {
                console.error('[WeeklyDigest] Failed to load:', err);
            } finally {
                setLoading(false);
            }
        }
        fetch();
    }, []);

    if (loading) {
        return (
            <div className="glass-panel rounded-xl p-5">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-400" /> Weekly Digest
                </h3>
                <div className="flex justify-center py-4">
                    <div className="w-5 h-5 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin" />
                </div>
            </div>
        );
    }

    if (!digest) return null;

    return (
        <div className="glass-panel p-6 rounded-xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-radial-glow opacity-30 pointer-events-none" />

            <div className="relative z-10">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-5 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-purple-400" /> Weekly Digest
                </h3>

                {/* Summary stats */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="bg-sentinel-950/60 rounded-xl p-4 border border-sentinel-800/30">
                        <p className="text-xs text-sentinel-500 mb-1">Signals</p>
                        <p className="text-2xl font-bold font-mono text-sentinel-100">{digest.signalsGenerated}</p>
                    </div>
                    <div className="bg-sentinel-950/60 rounded-xl p-4 border border-sentinel-800/30">
                        <p className="text-xs text-sentinel-500 mb-1">Win Rate</p>
                        <p className={`text-2xl font-bold font-mono ${digest.winRate >= 50 ? 'text-emerald-400' : digest.winRate > 0 ? 'text-red-400' : 'text-sentinel-500'}`}>
                            {digest.winRate}%
                        </p>
                    </div>
                </div>

                {/* Best / Worst signals */}
                <div className="space-y-2 mb-4">
                    {digest.bestSignal && (
                        <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-sentinel-400">
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                                Best: <span className="font-mono font-bold text-sentinel-200">{digest.bestSignal.ticker}</span>
                            </span>
                            <span className="font-mono font-bold text-emerald-400">
                                +{digest.bestSignal.returnPct.toFixed(1)}%
                            </span>
                        </div>
                    )}
                    {digest.worstSignal && (
                        <div className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-sentinel-400">
                                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                                Worst: <span className="font-mono font-bold text-sentinel-200">{digest.worstSignal.ticker}</span>
                            </span>
                            <span className="font-mono font-bold text-red-400">
                                {digest.worstSignal.returnPct.toFixed(1)}%
                            </span>
                        </div>
                    )}
                </div>

                {/* Bias performance */}
                {(digest.topBias || digest.worstBias) && (
                    <div className="space-y-2 mb-4 pt-3 border-t border-sentinel-800/50">
                        {digest.topBias && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-sentinel-400">Top Bias</span>
                                <span className="text-emerald-400 capitalize">
                                    {digest.topBias.bias.replace('_', ' ')} ({digest.topBias.winRate}%)
                                </span>
                            </div>
                        )}
                        {digest.worstBias && (
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-sentinel-400">Weakest Bias</span>
                                <span className="text-red-400 capitalize">
                                    {digest.worstBias.bias.replace('_', ' ')} ({digest.worstBias.winRate}%)
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Suggestions */}
                {digest.suggestions.length > 0 && (
                    <div className="pt-4 border-t border-sentinel-800/30">
                        <p className="text-sm font-medium text-sentinel-300 flex items-center gap-2 mb-3">
                            <Lightbulb className="w-4 h-4 text-yellow-400/80" /> Insights
                        </p>
                        <ul className="space-y-2">
                            {digest.suggestions.map((s, i) => (
                                <li key={i} className="text-sm text-sentinel-400 leading-relaxed">{s}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
