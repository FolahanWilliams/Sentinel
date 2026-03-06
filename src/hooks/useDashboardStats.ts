import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';

export interface DashboardStats {
    activeSignals: number;
    winRate: number;
    totalPnL: number;
    eventsScanned: number;
    loading: boolean;
}

export function useDashboardStats() {
    const [stats, setStats] = useState<DashboardStats>({
        activeSignals: 0,
        winRate: 0,
        totalPnL: 0,
        eventsScanned: 0,
        loading: true,
    });

    useEffect(() => {
        async function fetchStats() {
            try {
                // 1. Get active signals
                const { count: activeCount } = await supabase
                    .from('signals')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'active');

                // 2. Get win rate & PnL from outcomes
                const { data: outcomes } = await supabase
                    .from('signal_outcomes')
                    .select('outcome, max_gain, return_at_30d')
                    .neq('outcome', 'pending');

                let wins = 0;
                const totalClosed = outcomes?.length || 0;
                let estimatedPnl = 0;

                if (outcomes) {
                    outcomes.forEach(o => {
                        if (o.outcome === 'win') wins++;
                        // Rough PnL summation (assumes 1 unit size for simple metric display)
                        if (o.return_at_30d) estimatedPnl += o.return_at_30d;
                        else if (o.max_gain) estimatedPnl += o.max_gain;
                    });
                }

                const winRate = totalClosed > 0 ? (wins / totalClosed) * 100 : 0;

                // 3. Get total events scanned
                const { count: eventsCount } = await supabase
                    .from('market_events')
                    .select('*', { count: 'exact', head: true });

                setStats({
                    activeSignals: activeCount || 0,
                    winRate: Math.round(winRate),
                    totalPnL: Math.round(estimatedPnl * 100) / 100, // 2 decimal places
                    eventsScanned: eventsCount || 0,
                    loading: false,
                });

            } catch (err) {
                console.error("Error fetching dashboard stats:", err);
                setStats(s => ({ ...s, loading: false }));
            }
        }

        fetchStats();

        // Set up realtime listener for signals to keep Dashboard fresh
        const channel = supabase.channel('dashboard_metrics')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'signals' }, () => {
                fetchStats();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        }
    }, []);

    return stats;
}
