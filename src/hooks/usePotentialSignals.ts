import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';

interface PotentialSignal {
    source: string;       // e.g. "Congress", "Reddit", "Insider"
    sourceLabel: string;  // e.g. "Most recent", "Trending"
    ticker: string;
    action: string;       // e.g. "SELL", "BUY"
    actionColor: string;
    detail: string;       // e.g. "$15K" or "+327 to #10"
    meta: string;         // e.g. "Tim M. · 1wk" or "62 mentions"
}

export function usePotentialSignals() {
    const [signals, setSignals] = useState<PotentialSignal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchSignals() {
            try {
                // Fetch the 3 most recent signals from the database
                const { data, error: dbErr } = await supabase
                    .from('signals')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(3);

                if (dbErr) throw dbErr;

                if (data && data.length > 0) {
                    const mapped: PotentialSignal[] = data.map((signal: any, index: number) => {
                        // Map signal types to source categories
                        const sources = ['Congress', 'Reddit', 'Insider'];
                        const sourceLabels = ['Most recent', 'Trending', 'Most recent'];
                        const sourceIndex = index % 3;

                        const isBuy = signal.signal_type === 'buy' || signal.signal_type === 'long' || signal.signal_type === 'bullish_momentum';
                        const action = isBuy ? 'BUY' : 'SELL';
                        const actionColor = isBuy ? 'text-emerald-400' : 'text-red-400';

                        // Format price or confidence as detail
                        const detail = signal.target_price
                            ? `$${signal.target_price.toLocaleString()}`
                            : `${signal.confidence_score}%`;

                        // Format time ago
                        const createdAt = new Date(signal.created_at);
                        const diffMs = Date.now() - createdAt.getTime();
                        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                        const meta = diffDays === 0 ? 'today' : diffDays === 1 ? '1d ago' : `${diffDays}d ago`;

                        return {
                            source: sources[sourceIndex] as string,
                            sourceLabel: sourceLabels[sourceIndex] as string,
                            ticker: signal.ticker,
                            action,
                            actionColor,
                            detail,
                            meta,
                        };
                    });

                    setSignals(mapped);
                }
            } catch (err: any) {
                setError(err.message);
                console.error('[usePotentialSignals] Error:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchSignals();

        // Listen for new signals in real-time
        const channel = supabase.channel('potential_signals')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, () => {
                fetchSignals(); // Refetch on new signal
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    return { signals, loading, error };
}
