/**
 * signalsStore — the single shared source for active signals.
 *
 * Previously SignalsSection, the dashboard's active-count, and HighConvictionSetups
 * each ran their own `status='active'` fetch (and SignalsSection its own realtime
 * channel). This store fetches once and holds ONE realtime subscription with the
 * same add/update/remove reconciliation SignalsSection used; consumers select the
 * shared array and derive their own views (filtered list, count, conviction subset).
 * Optimistic helpers keep user actions (close / note / trigger) snappy.
 */
import { create } from 'zustand';
import { supabase } from '@/config/supabase';
import type { Signal } from '@/types/signals';

interface SignalsStore {
    signals: Signal[]; // status = 'active'
    loading: boolean;
    _channel: ReturnType<typeof supabase.channel> | null;
    _initialized: boolean;
    fetchActive: () => Promise<void>;
    ensureInitialized: () => void;
    /** Optimistic local removal (the realtime UPDATE will reconcile authoritatively). */
    removeLocal: (id: string) => void;
    /** Optimistic local patch. */
    patchLocal: (id: string, patch: Partial<Signal>) => void;
}

export const useSignalsStore = create<SignalsStore>((set, get) => ({
    signals: [],
    loading: true,
    _channel: null,
    _initialized: false,

    fetchActive: async () => {
        const { data, error } = await supabase
            .from('signals')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false });
        if (!error && data) set({ signals: data as unknown as Signal[] });
        set({ loading: false });
    },

    removeLocal: (id) => set((s) => ({ signals: s.signals.filter((x) => x.id !== id) })),
    patchLocal: (id, patch) => set((s) => ({ signals: s.signals.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),

    ensureInitialized: () => {
        if (get()._initialized) return;
        set({ _initialized: true });
        void get().fetchActive();

        const channel = supabase.channel('signals_active_shared')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'signals' }, (payload) => {
                const ns = payload.new as Signal;
                if (ns.status === 'active') set((s) => ({ signals: [ns, ...s.signals.filter((x) => x.id !== ns.id)] }));
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'signals' }, (payload) => {
                const u = payload.new as Signal;
                set((s) => {
                    if (u.status === 'active') {
                        const exists = s.signals.some((x) => x.id === u.id);
                        return { signals: exists ? s.signals.map((x) => (x.id === u.id ? u : x)) : [u, ...s.signals] };
                    }
                    // Closed / expired / triggered — drop from the active list.
                    return { signals: s.signals.filter((x) => x.id !== u.id) };
                });
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'signals' }, (payload) => {
                const old = payload.old as { id?: string };
                if (old?.id) set((s) => ({ signals: s.signals.filter((x) => x.id !== old.id) }));
            })
            .subscribe();
        set({ _channel: channel });
    },
}));
