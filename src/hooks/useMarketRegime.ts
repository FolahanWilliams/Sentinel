/**
 * useMarketRegime — Hook wrapper around MarketRegimeFilter.detect().
 * Caches result in state, refreshes every 2 hours.
 */

import { useState, useEffect } from 'react';
import { MarketRegimeFilter, type MarketRegimeResult } from '@/services/marketRegime';

interface MarketRegimeState {
    regime: MarketRegimeResult | null;
    loading: boolean;
    error: string | null;
    lastChecked: number | null;
}

export function useMarketRegime() {
    const [state, setState] = useState<MarketRegimeState>({
        regime: null,
        loading: true,
        error: null,
        lastChecked: null,
    });

    useEffect(() => {
        let cancelled = false;

        async function fetchRegime() {
            try {
                const result = await MarketRegimeFilter.detect();
                if (!cancelled) {
                    setState({
                        regime: result,
                        loading: false,
                        error: null,
                        lastChecked: Date.now(),
                    });
                }
            } catch (err: any) {
                if (!cancelled) {
                    setState(prev => ({
                        ...prev,
                        loading: false,
                        error: err.message || 'Failed to detect market regime',
                    }));
                }
            }
        }

        fetchRegime();

        // Refresh every 2 hours
        const interval = setInterval(fetchRegime, 2 * 60 * 60 * 1000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return state;
}
