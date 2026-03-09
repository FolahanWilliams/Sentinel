/**
 * useRecentTickers — localStorage-backed recent ticker history.
 * Tracks the last 10 tickers the user visited for quick access in the command palette.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'sentinel_recent_tickers';
const MAX_RECENT = 10;

function loadRecent(): string[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return [];
}

function saveRecent(tickers: string[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
}

export function useRecentTickers() {
    const [recentTickers, setRecentTickers] = useState<string[]>(loadRecent);

    const addRecent = useCallback((ticker: string) => {
        setRecentTickers(prev => {
            const upper = ticker.toUpperCase();
            const filtered = prev.filter(t => t !== upper);
            const next = [upper, ...filtered].slice(0, MAX_RECENT);
            saveRecent(next);
            return next;
        });
    }, []);

    const clearRecent = useCallback(() => {
        setRecentTickers([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return { recentTickers, addRecent, clearRecent };
}
