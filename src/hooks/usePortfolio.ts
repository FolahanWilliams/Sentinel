/**
 * usePortfolio — thin selector over the shared portfolioStore.
 *
 * The store holds ONE fetch + ONE realtime subscription for the whole app (see
 * src/stores/portfolioStore.ts); this hook just selects from it and derives the
 * open/closed splits. The return shape is unchanged, so all consumers are
 * untouched — they simply stop each opening their own channel + fetch.
 */
import { useEffect, useMemo } from 'react';
import { usePortfolioStore } from '@/stores/portfolioStore';
import type { PortfolioConfig, Position } from '@/stores/portfolioStore';

export type { PortfolioConfig, Position } from '@/stores/portfolioStore';

export interface PortfolioData {
    config: PortfolioConfig | null;
    positions: Position[];
    openPositions: Position[];
    closedPositions: Position[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

export function usePortfolio(): PortfolioData {
    const config = usePortfolioStore((s) => s.config);
    const positions = usePortfolioStore((s) => s.positions);
    const loading = usePortfolioStore((s) => s.loading);
    const error = usePortfolioStore((s) => s.error);
    const refetch = usePortfolioStore((s) => s.fetchAll);

    useEffect(() => {
        usePortfolioStore.getState().ensureInitialized();
    }, []);

    const openPositions = useMemo(() => positions.filter((p) => p.status === 'open'), [positions]);
    const closedPositions = useMemo(() => positions.filter((p) => p.status === 'closed'), [positions]);

    return { config, positions, openPositions, closedPositions, loading, error, refetch };
}
