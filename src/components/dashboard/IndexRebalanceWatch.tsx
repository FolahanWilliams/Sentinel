/**
 * IndexRebalanceWatch — surfaces upcoming index additions/removals (the "index
 * effect" swing edge) with Sentinel's entry plan + recommendation. Example:
 * Nebius added to the Nasdaq-100, effective the 22nd → "enter now / wait for
 * pullback to $X" with a one-click Open Position.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { IndexRebalanceService, type IndexRebalanceEvent } from '@/services/indexRebalance';
import type { RebalanceRecommendation } from '@/services/indexRebalanceAnalysis';
import { Repeat, RefreshCw, ExternalLink, Calculator } from 'lucide-react';
import { formatPrice } from '@/utils/formatters';

const REC: Record<RebalanceRecommendation, { label: string; cls: string }> = {
    enter_now: { label: 'Enter now', cls: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' },
    wait_pullback: { label: 'Wait for pullback', cls: 'bg-amber-500/15 text-amber-400 ring-amber-500/30' },
    avoid_extended: { label: 'Extended — skip', cls: 'bg-sentinel-700/30 text-sentinel-400 ring-sentinel-600/30' },
};

function daysPill(effective: string | null): string {
    if (!effective) return '';
    const d = Math.round((new Date(`${effective}T00:00:00Z`).getTime() - Date.now()) / 86_400_000);
    if (d === 0) return 'today';
    return d > 0 ? `in ${d}d` : `${-d}d ago`;
}

export function IndexRebalanceWatch() {
    const navigate = useNavigate();
    const [events, setEvents] = useState<IndexRebalanceEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = useCallback(async (force = false) => {
        const evs = await IndexRebalanceService.getUpcoming();
        const analyzed = await Promise.all(evs.map(async (e) => {
            if (e.action === 'remove') return e;
            if (e.analysis && !force) return e;
            const analysis = await IndexRebalanceService.analyzeAndPersist(e);
            return analysis ? { ...e, analysis } : e;
        }));
        setEvents(analyzed);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const discover = useCallback(async () => {
        setRefreshing(true);
        await IndexRebalanceService.refresh();
        await load(true);
        setRefreshing(false);
    }, [load]);

    const openPosition = (e: IndexRebalanceEvent) => {
        const a = e.analysis;
        const params = new URLSearchParams({ ticker: e.ticker, side: 'long' });
        if (a?.entryZoneHigh) params.set('entry', String(a.entryZoneHigh));
        if (a?.stop) params.set('stop', String(a.stop));
        if (a?.target) params.set('target', String(a.target));
        navigate(`/positions?${params.toString()}`);
    };

    if (loading) {
        return (
            <div className="bg-sentinel-950/50 border border-sentinel-800/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Repeat className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-sentinel-200">Index Rebalance Watch</h3>
                </div>
                <div className="flex items-center justify-center h-20">
                    <RefreshCw className="w-4 h-4 text-sentinel-600 animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <div className="bg-sentinel-950/50 border border-sentinel-800/50 rounded-xl p-6">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <Repeat className="w-5 h-5 text-blue-400" />
                    <h3 className="text-lg font-semibold text-sentinel-200">Index Rebalance Watch</h3>
                    {events.length > 0 && <span className="text-xs text-sentinel-500 font-mono">{events.length}</span>}
                </div>
                <button
                    onClick={discover}
                    disabled={refreshing}
                    className="text-sentinel-500 hover:text-sentinel-300 transition-colors bg-transparent border-none cursor-pointer disabled:opacity-50"
                    title="Discover latest index changes"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>
            <p className="text-[11px] text-sentinel-500 mb-4">Forced index-fund flow around the effective date — anticipate, don't chase.</p>

            {events.length === 0 ? (
                <p className="text-sm text-sentinel-500 py-4 text-center">
                    No upcoming index changes detected. Hit refresh to scan.
                </p>
            ) : (
                <div className="space-y-3">
                    {events.map((e) => {
                        const a = e.analysis;
                        const rec = a ? REC[a.recommendation] : null;
                        const isAdd = e.action === 'add';
                        return (
                            <div key={e.id} className="p-3 rounded-lg bg-sentinel-900/40 border border-sentinel-800/30">
                                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-semibold text-sentinel-100">{e.ticker}</span>
                                        <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ring-1 ${isAdd ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30' : 'bg-red-500/15 text-red-400 ring-red-500/30'}`}>
                                            {isAdd ? 'ADD' : 'REMOVE'}
                                        </span>
                                        <span className="text-xs text-sentinel-400">{e.index_name}</span>
                                        <span className="text-[10px] text-sentinel-500 font-mono">· {daysPill(e.effective_date)}</span>
                                    </div>
                                    {rec && (
                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ring-1 ${rec.cls}`}>{rec.label}</span>
                                    )}
                                </div>

                                {a?.thesis && <p className="text-xs text-sentinel-300 leading-relaxed mb-2">{a.thesis}</p>}

                                {isAdd && a && a.entryZoneLow != null && (
                                    <div className="flex items-center gap-4 text-[11px] font-mono mb-2 flex-wrap">
                                        <span className="text-sentinel-400">Entry <span className="text-sentinel-200">{formatPrice(a.entryZoneLow)}–{formatPrice(a.entryZoneHigh ?? 0)}</span></span>
                                        {a.stop != null && <span className="text-red-400/80">Stop {formatPrice(a.stop)}</span>}
                                        {a.target != null && <span className="text-emerald-400/80">Target {formatPrice(a.target)}</span>}
                                        <span className="text-sentinel-500">Conviction {a.conviction}</span>
                                    </div>
                                )}

                                <div className="flex items-center gap-3">
                                    {isAdd && a && a.recommendation !== 'avoid_extended' && (
                                        <button
                                            onClick={() => openPosition(e)}
                                            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 bg-transparent border-none cursor-pointer p-0"
                                        >
                                            <Calculator className="w-3 h-3" /> Open Position
                                        </button>
                                    )}
                                    {e.source_url && (
                                        <a href={e.source_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-sentinel-500 hover:text-sentinel-300">
                                            <ExternalLink className="w-3 h-3" /> Source
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
