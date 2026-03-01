import { create } from 'zustand';

interface WatchlistItem {
    id: string; ticker: string; company_name: string; sector: string;
    is_active: boolean; notes: string | null;
}

interface WatchlistStore {
    tickers: WatchlistItem[];
    loading: boolean;
    setTickers: (tickers: WatchlistItem[]) => void;
    addTicker: (ticker: WatchlistItem) => void;
    removeTicker: (id: string) => void;
    setLoading: (loading: boolean) => void;
}

export const useWatchlistStore = create<WatchlistStore>((set) => ({
    tickers: [],
    loading: true,
    setTickers: (tickers) => set({ tickers }),
    addTicker: (ticker) => set((state) => ({ tickers: [...state.tickers, ticker] })),
    removeTicker: (id) => set((state) => ({ tickers: state.tickers.filter(t => t.id !== id) })),
    setLoading: (loading) => set({ loading }),
}));
