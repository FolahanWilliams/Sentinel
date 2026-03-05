/**
 * SectorHeatMap — Phase 6
 *
 * Visual heat map of signal performance by sector.
 * Shows win rates, signal count, and average confidence per sector.
 * Color-coded: green = strong win rate, red = poor, neutral = mixed.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { Grid3X3, Loader2 } from 'lucide-react';

interface SectorStats {
    sector: string;
    signalCount: number;
    winCount: number;
    lossCount: number;
    winRate: number;
    avgConfidence: number;
    avgReturn5d: number | null;
}

export function SectorHeatMap() {
    const [sectors, setSectors] = useState<SectorStats[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchSectorData() {
            try {
                // Join signals with watchlist to get sector and with outcomes for performance
                const { data: signals } = await supabase
                    .from('signals')
                    .select(`
                        ticker,
                        confidence_score,
                        signal_outcomes (
                            outcome,
                            return_at_5d
                        )
                    `)
                    .order('created_at', { ascending: false })
                    .limit(200);

                const { data: watchlist } = await supabase
                    .from('watchlist')
                    .select('ticker, sector');

                if (!signals) { setLoading(false); return; }

                // Build sector lookup
                const sectorLookup: Record<string, string> = {};
                for (const w of watchlist || []) {
                    sectorLookup[w.ticker] = w.sector || 'Unknown';
                }

                // Aggregate by sector
                const sectorMap: Record<string, {
                    signals: number; wins: number; losses: number;
                    totalConf: number; totalReturn5d: number; returnCount: number;
                }> = {};

                for (const sig of signals as any[]) {
                    const sector = sectorLookup[sig.ticker] || 'Unknown';
                    if (!sectorMap[sector]) {
                        sectorMap[sector] = { signals: 0, wins: 0, losses: 0, totalConf: 0, totalReturn5d: 0, returnCount: 0 };
                    }
                    const s = sectorMap[sector];
                    s.signals++;
                    s.totalConf += sig.confidence_score || 0;

                    const outcome = sig.signal_outcomes?.[0];
                    if (outcome) {
                        if (outcome.outcome === 'win') s.wins++;
                        else if (outcome.outcome === 'loss') s.losses++;
                        if (outcome.return_at_5d != null) {
                            s.totalReturn5d += outcome.return_at_5d;
                            s.returnCount++;
                        }
                    }
                }

                const sectorStats: SectorStats[] = Object.entries(sectorMap)
                    .map(([sector, data]) => ({
                        sector,
                        signalCount: data.signals,
                        winCount: data.wins,
                        lossCount: data.losses,
                        winRate: (data.wins + data.losses) > 0 ? (data.wins / (data.wins + data.losses)) * 100 : 0,
                        avgConfidence: data.signals > 0 ? data.totalConf / data.signals : 0,
                        avgReturn5d: data.returnCount > 0 ? data.totalReturn5d / data.returnCount : null,
                    }))
                    .sort((a, b) => b.signalCount - a.signalCount);

                setSectors(sectorStats);
            } catch (err) {
                console.error('[SectorHeatMap] Failed to load:', err);
            }
            setLoading(false);
        }

        fetchSectorData();
    }, []);

    function getHeatColor(winRate: number, signalCount: number): string {
        if (signalCount < 2) return 'bg-sentinel-800/50 border-sentinel-700/30';
        if (winRate >= 65) return 'bg-emerald-500/15 border-emerald-500/30';
        if (winRate >= 50) return 'bg-emerald-500/8 border-emerald-500/20';
        if (winRate >= 35) return 'bg-amber-500/10 border-amber-500/20';
        return 'bg-red-500/10 border-red-500/20';
    }

    function getTextColor(winRate: number, signalCount: number): string {
        if (signalCount < 2) return 'text-sentinel-500';
        if (winRate >= 65) return 'text-emerald-400';
        if (winRate >= 50) return 'text-emerald-300';
        if (winRate >= 35) return 'text-amber-400';
        return 'text-red-400';
    }

    if (loading) {
        return (
            <div className="glass-panel p-5">
                <div className="flex items-center gap-2 text-sentinel-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Loading sector data...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-panel overflow-hidden">
            <div className="px-5 py-4 border-b border-sentinel-800/50 flex items-center gap-3">
                <Grid3X3 className="w-5 h-5 text-indigo-400" />
                <div>
                    <h2 className="text-sm font-semibold text-sentinel-200 uppercase tracking-wider">Sector Heat Map</h2>
                    <p className="text-xs text-sentinel-500 mt-0.5">Signal performance by sector</p>
                </div>
            </div>

            <div className="p-5">
                {sectors.length === 0 ? (
                    <p className="text-sm text-sentinel-500 text-center py-4">No sector data yet. Signals need outcomes to build the heat map.</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {sectors.map(sector => (
                            <div
                                key={sector.sector}
                                className={`p-3 rounded-lg border ${getHeatColor(sector.winRate, sector.signalCount)} transition-colors`}
                                title={`${sector.sector}: ${sector.winRate.toFixed(0)}% win rate (${sector.winCount}W/${sector.lossCount}L), ${sector.signalCount} signals`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-semibold text-sentinel-200 truncate">{sector.sector}</span>
                                    <span className="text-[10px] text-sentinel-500 font-mono">{sector.signalCount}s</span>
                                </div>
                                <div className={`text-lg font-bold font-mono ${getTextColor(sector.winRate, sector.signalCount)}`}>
                                    {(sector.winCount + sector.lossCount) > 0 ? `${sector.winRate.toFixed(0)}%` : '--'}
                                </div>
                                {sector.avgReturn5d !== null && (
                                    <p className={`text-[10px] font-mono mt-0.5 ${sector.avgReturn5d >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                        Avg 5d: {sector.avgReturn5d >= 0 ? '+' : ''}{sector.avgReturn5d.toFixed(1)}%
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
