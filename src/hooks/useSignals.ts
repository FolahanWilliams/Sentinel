import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import type { Signal } from '@/types/signals';

export function useSignals(filter?: { status?: string; ticker?: string }) {
    const [signals, setSignals] = useState<Signal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSignals = useCallback(async () => {
        setLoading(true);
        let query = supabase
            .from('signals')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (filter?.status) {
            query = query.eq('status', filter.status);
        }
        if (filter?.ticker) {
            query = query.eq('ticker', filter.ticker);
        }

        const { data, error: err } = await query;

        if (err) {
            setError(err.message);
        } else {
            setSignals((data || []) as unknown as Signal[]);
            setError(null);
        }
        setLoading(false);
    }, [filter?.status, filter?.ticker]);

    useEffect(() => { fetchSignals(); }, [fetchSignals]);

    const updateSignalNotes = useCallback(async (signalId: string, notes: string) => {
        const { error: err } = await supabase
            .from('signals')
            .update({ user_notes: notes } as any)
            .eq('id', signalId);
        if (err) { setError(err.message); return false; }
        await fetchSignals();
        return true;
    }, [fetchSignals]);

    const closeSignal = useCallback(async (signalId: string) => {
        const { error: err } = await supabase
            .from('signals')
            .update({ status: 'manually_closed' } as any)
            .eq('id', signalId);
        if (err) { setError(err.message); return false; }
        await fetchSignals();
        return true;
    }, [fetchSignals]);

    return { signals, loading, error, refetch: fetchSignals, updateSignalNotes, closeSignal };
}
