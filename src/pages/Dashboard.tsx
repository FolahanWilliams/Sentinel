import { Activity, ArrowRight, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { formatPrice } from '@/utils/formatters';
import { MarketSnapshot } from '@/components/dashboard/MarketSnapshot';
import { MarketTrends, PotentialSignals } from '@/components/dashboard/MarketTrends';
import { UpcomingEvents } from '@/components/dashboard/UpcomingEvents';

export function Dashboard() {
    const [recentSignals, setRecentSignals] = useState<any[]>([]);
    const [loadingSignals, setLoadingSignals] = useState(true);

    useEffect(() => {
        async function fetchRecent() {
            const { data, error } = await supabase
                .from('signals')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);

            if (!error && data) {
                setRecentSignals(data);
            }
            setLoadingSignals(false);
        }

        fetchRecent();

        const channel = supabase.channel('recent_signals')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
                // Auto-prepend new signals hitting the DB from the scanner
                setRecentSignals(prev => [payload.new, ...prev].slice(0, 5));
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [])

    return (
        <div className="space-y-6 animate-in fade-in duration-500">

            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100">
                        Intelligence Overview
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        System active • Last scan: 2 mins ago
                    </p>
                </div>
                <button className="px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700 hover:ring-sentinel-600 flex items-center gap-2 w-fit">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Force Global Scan
                </button>
            </div>

            {/* MAIN CONTENT GRID */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* LEFT COLUMN: Market Snapshot & Signals */}
                <div className="xl:col-span-1 space-y-6">
                    <MarketSnapshot />
                </div>

                {/* MIDDLE COLUMN: Feed */}
                <div className="xl:col-span-1 border-x border-sentinel-800/50 px-0 xl:px-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-sentinel-200">Recent Signals</h2>
                        <a href="/analysis" className="text-sm text-sentinel-400 hover:text-sentinel-100 transition-colors flex items-center gap-1">
                            View all <ArrowRight className="w-4 h-4" />
                        </a>
                    </div>

                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 backdrop-blur-sm overflow-hidden h-[800px] overflow-y-auto">
                        {loadingSignals ? (
                            <div className="p-8 justify-center flex">
                                <div className="w-6 h-6 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div>
                            </div>
                        ) : recentSignals.length === 0 ? (
                            <div className="p-8 text-center text-sentinel-400">
                                No signals generated yet. The agents are watching.
                            </div>
                        ) : (
                            <div className="divide-y divide-sentinel-800/50">
                                {recentSignals.map(signal => (
                                    <div key={signal.id} className="p-4 hover:bg-sentinel-800/30 transition-colors group cursor-pointer">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-1 bg-sentinel-800 text-sentinel-100 text-xs font-bold rounded ring-1 ring-sentinel-700">
                                                    {signal.ticker}
                                                </span>
                                                <span className="text-sm font-medium text-sentinel-300 capitalize">
                                                    {signal.signal_type.replace('_', ' ')}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-sentinel-500 flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {new Date(signal.created_at).toLocaleDateString()}
                                                </span>
                                                <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-bold rounded ring-1 ring-emerald-500/20">
                                                    {signal.confidence_score}% CONF
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-sm text-sentinel-400 line-clamp-2">
                                            {signal.thesis}
                                        </p>
                                        <div className="mt-4 flex items-center gap-6 text-[10px] text-sentinel-500 font-mono">
                                            <div>ENT: <span className="text-sentinel-300">{formatPrice(signal.suggested_entry_low)} - {formatPrice(signal.suggested_entry_high)}</span></div>
                                            <div>TGT: <span className="text-emerald-400">{formatPrice(signal.target_price)}</span></div>
                                            <div>STP: <span className="text-red-400">{formatPrice(signal.stop_loss)}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT COLUMN: Trends & Events*/}
                <div className="xl:col-span-1 space-y-6">
                    <MarketTrends />
                    <PotentialSignals />
                    <UpcomingEvents />
                </div>
            </div>
        </div>
    );
}


