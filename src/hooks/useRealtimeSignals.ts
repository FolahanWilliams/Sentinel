/**
 * useRealtimeSignals — Supabase Realtime hook for live signal notifications.
 *
 * Subscribes to INSERT events on the `signals` table.
 * Filters for high-confidence signals (>75) and surfaces them for toast display.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';

export interface RealtimeSignal {
    id: string;
    ticker: string;
    signal_type: string;
    confidence_score: number;
    thesis: string | null;
    risk_level: string;
    created_at: string;
}

export function useRealtimeSignals() {
    const [pendingSignals, setPendingSignals] = useState<RealtimeSignal[]>([]);

    const dismissSignal = useCallback((id: string) => {
        setPendingSignals(prev => prev.filter(s => s.id !== id));
    }, []);

    useEffect(() => {
        const channel = supabase
            .channel('signals-realtime')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'signals',
                },
                (payload) => {
                    const signal = payload.new as any;
                    // Only surface high-confidence signals
                    if (signal.confidence_score && signal.confidence_score > 75) {
                        const newSignal: RealtimeSignal = {
                            id: signal.id,
                            ticker: signal.ticker,
                            signal_type: signal.signal_type,
                            confidence_score: signal.confidence_score,
                            thesis: signal.thesis,
                            risk_level: signal.risk_level,
                            created_at: signal.created_at,
                        };
                        setPendingSignals(prev => [newSignal, ...prev].slice(0, 5)); // Keep max 5
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === 'CHANNEL_ERROR') {
                    console.error('[useRealtimeSignals] Subscription error:', err);
                } else if (status === 'TIMED_OUT') {
                    console.warn('[useRealtimeSignals] Subscription timed out, signals may not update in real-time');
                }
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    return { pendingSignals, dismissSignal };
}
