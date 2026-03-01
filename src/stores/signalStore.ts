import { create } from 'zustand';
import type { Signal } from '@/types/signals';

interface SignalStore {
    signals: Signal[];
    loading: boolean;
    setSignals: (signals: Signal[]) => void;
    addSignal: (signal: Signal) => void;
    setLoading: (loading: boolean) => void;
}

export const useSignalStore = create<SignalStore>((set) => ({
    signals: [],
    loading: true,
    setSignals: (signals) => set({ signals }),
    addSignal: (signal) => set((state) => ({ signals: [signal, ...state.signals] })),
    setLoading: (loading) => set({ loading }),
}));
