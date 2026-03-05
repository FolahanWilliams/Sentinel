import { useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { useSignalStore } from '@/stores/signalStore';
import type { Signal } from '@/types/signals';

/**
 * Consolidated signal hook — uses Zustand store as single source of truth.
 * Hydrates from Supabase on mount and provides mutation helpers.
 */
export function useSignals(filter?: { status?: string; ticker?: string }) {
    const { signals: allSignals, loading, setSignals, setLoading } = useSignalStore();

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

        if (!err && data) {
            setSignals((data || []) as unknown as Signal[]);
        }
        setLoading(false);
    }, [filter?.status, filter?.ticker, setSignals, setLoading]);

    useEffect(() => { fetchSignals(); }, [fetchSignals]);

    // Apply local filters on the store data
    const signals = allSignals.filter(s => {
        if (filter?.status && s.status !== filter.status) return false;
        if (filter?.ticker && s.ticker !== filter.ticker) return false;
        return true;
    });

    const updateSignalNotes = useCallback(async (signalId: string, notes: string) => {
        const { error: err } = await supabase
            .from('signals')
            .update({ user_notes: notes } as any)
            .eq('id', signalId);
        if (err) return false;
        await fetchSignals();
        return true;
    }, [fetchSignals]);

    const closeSignal = useCallback(async (signalId: string) => {
        const { error: err } = await supabase
            .from('signals')
            .update({ status: 'manually_closed' } as any)
            .eq('id', signalId);
        if (err) return false;
        await fetchSignals();
        return true;
    }, [fetchSignals]);

    return { signals, loading, error: null, refetch: fetchSignals, updateSignalNotes, closeSignal };
}
