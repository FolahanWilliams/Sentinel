/**
 * portfolioStore — the single shared source for portfolio config + positions.
 *
 * Previously `usePortfolio` fetched and opened a realtime channel PER mount, so
 * the 7 components that use it each ran their own fetch + subscription (3+ firing
 * at once on the dashboard). This store fetches once and holds ONE realtime
 * subscription for the whole app; `usePortfolio` is now a thin selector over it,
 * so every surface stays consistent by construction and we stop burning Supabase
 * channels on duplicate data.
 */
import { create } from 'zustand';
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

export const DEFAULT_CONFIG: PortfolioConfig = {
    id: '',
    total_capital: 10000,
    max_position_pct: 10,
    max_total_exposure_pct: 50,
    max_sector_exposure_pct: 25,
    max_concurrent_positions: 5,
    risk_per_trade_pct: 2,
    kelly_fraction: 0.25,
};

interface PortfolioStore {
    config: PortfolioConfig | null;
    positions: Position[];
    loading: boolean;
    error: string | null;
    _channel: ReturnType<typeof supabase.channel> | null;
    _initialized: boolean;
    fetchAll: () => Promise<void>;
    /** Idempotent: kicks off the one shared fetch + realtime subscription. */
    ensureInitialized: () => void;
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
    config: null,
    positions: [],
    loading: true,
    error: null,
    _channel: null,
    _initialized: false,

    fetchAll: async () => {
        try {
            const { data: cfgData } = await supabase
                .from('portfolio_config')
                .select('*')
                .limit(1)
                .maybeSingle();

            set({
                config: cfgData ? {
                    id: cfgData.id,
                    total_capital: Number(cfgData.total_capital),
                    max_position_pct: Number(cfgData.max_position_pct),
                    max_total_exposure_pct: Number(cfgData.max_total_exposure_pct),
                    max_sector_exposure_pct: Number(cfgData.max_sector_exposure_pct),
                    max_concurrent_positions: cfgData.max_concurrent_positions,
                    risk_per_trade_pct: Number(cfgData.risk_per_trade_pct),
                    kelly_fraction: Number(cfgData.kelly_fraction),
                } : DEFAULT_CONFIG,
            });

            const { data: posData, error: posErr } = await supabase
                .from('positions')
                .select('*')
                .order('opened_at', { ascending: false });

            if (posErr) throw posErr;
            set({ positions: (posData || []) as Position[], loading: false, error: null });
        } catch (err: any) {
            console.error('[portfolioStore]', err);
            set((s) => ({ error: err.message, loading: false, config: s.config ?? DEFAULT_CONFIG }));
        }
    },

    ensureInitialized: () => {
        if (get()._initialized) return;
        set({ _initialized: true });
        void get().fetchAll();

        const channel = supabase.channel('portfolio_live_shared')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => { void get().fetchAll(); })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_config' }, () => { void get().fetchAll(); })
            .subscribe();
        set({ _channel: channel });
    },
}));
