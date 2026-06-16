/**
 * useActiveSignals — thin selector over the shared signalsStore (one fetch + one
 * realtime subscription for all active-signal consumers). See src/stores/signalsStore.ts.
 */
import { useEffect } from 'react';
import { useSignalsStore } from '@/stores/signalsStore';

export function useActiveSignals() {
    const signals = useSignalsStore((s) => s.signals);
    const loading = useSignalsStore((s) => s.loading);
    const refetch = useSignalsStore((s) => s.fetchActive);

    useEffect(() => {
        useSignalsStore.getState().ensureInitialized();
    }, []);

    return { signals, loading, refetch };
}
