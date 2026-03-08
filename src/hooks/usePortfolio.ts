/**
 * usePortfolio — fetches portfolio_config (singleton) + positions (open/closed)
 * with realtime subscriptions for live updates.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/config/supabase';

export interface PortfolioConfig {
    id: string;
    total_capital: number;
    max_position_pct: number;
    max_total_exposure_pct: number;
    max_sector_exposure_pct: number;
    max_concurrent_positions: number;
    risk_per_trade_pct: number;
    kelly_fraction: number;
}

export interface Position {
    id: string;
    signal_id: string | null;
    ticker: string;
    status: string;
    side: string;
    entry_price: number | null;
    exit_price: number | null;
    shares: number | null;
    position_size_usd: number | null;
    position_pct: number | null;
    realized_pnl: number | null;
    realized_pnl_pct: number | null;
    opened_at: string | null;
    closed_at: string | null;
    close_reason: string | null;
    notes: string | null;
    currency: string;
}

export interface PortfolioData {
    config: PortfolioConfig | null;
    positions: Position[];
    openPositions: Position[];
    closedPositions: Position[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

const DEFAULT_CONFIG: PortfolioConfig = {
    id: '',
    total_capital: 10000,
    max_position_pct: 10,
    max_total_exposure_pct: 50,
    max_sector_exposure_pct: 25,
    max_concurrent_positions: 5,
    risk_per_trade_pct: 2,
    kelly_fraction: 0.25,
};

export function usePortfolio(): PortfolioData {
    const [config, setConfig] = useState<PortfolioConfig | null>(null);
    const [positions, setPositions] = useState<Position[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchAll = useCallback(async () => {
        try {
            // Fetch config (singleton)
            const { data: cfgData } = await supabase
                .from('portfolio_config')
                .select('*')
                .limit(1)
                .maybeSingle();

            setConfig(cfgData ? {
                id: cfgData.id,
                total_capital: Number(cfgData.total_capital),
                max_position_pct: Number(cfgData.max_position_pct),
                max_total_exposure_pct: Number(cfgData.max_total_exposure_pct),
                max_sector_exposure_pct: Number(cfgData.max_sector_exposure_pct),
                max_concurrent_positions: cfgData.max_concurrent_positions,
                risk_per_trade_pct: Number(cfgData.risk_per_trade_pct),
                kelly_fraction: Number(cfgData.kelly_fraction),
            } : DEFAULT_CONFIG);

            // Fetch all positions
            const { data: posData, error: posErr } = await supabase
                .from('positions')
                .select('*')
                .order('opened_at', { ascending: false });

            if (posErr) throw posErr;
            setPositions((posData || []) as Position[]);

        } catch (err: any) {
            console.error('[usePortfolio]', err);
            setError(err.message);
            // Use defaults if config doesn't exist yet
            setConfig(prev => prev ?? DEFAULT_CONFIG);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAll();

        const ch = supabase.channel('portfolio_live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => fetchAll())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_config' }, () => fetchAll())
            .subscribe();

        return () => { supabase.removeChannel(ch); };
    }, [fetchAll]);

    const openPositions = useMemo(() => positions.filter(p => p.status === 'open'), [positions]);
    const closedPositions = useMemo(() => positions.filter(p => p.status === 'closed'), [positions]);

    return { config, positions, openPositions, closedPositions, loading, error, refetch: fetchAll };
}
