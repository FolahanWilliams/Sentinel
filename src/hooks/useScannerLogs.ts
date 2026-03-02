import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import type { Database } from '@/types/database';

type ScanLog = Database['public']['Tables']['scan_logs']['Row'];

export function useScannerLogs(limit = 20) {
    const [logs, setLogs] = useState<ScanLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('scan_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (fetchError) throw fetchError;
            setLogs(data || []);
            setError(null);
        } catch (err) {
            console.error('[useScannerLogs] Fetch error:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch scan logs');
        } finally {
            setLoading(false);
        }
    }, [limit]);

    useEffect(() => {
        let mounted = true;

        if (mounted) {
            fetchLogs();
        }

        // Subscribe to real-time additions/updates
        const subscription = supabase
            .channel('scan_logs_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'scan_logs'
                },
                (payload) => {
                    const newLog = payload.new as ScanLog;
                    if (payload.eventType === 'INSERT') {
                        setLogs((prev) => [newLog, ...prev].slice(0, limit));
                    } else if (payload.eventType === 'UPDATE') {
                        setLogs((prev) => prev.map((log) => (log.id === newLog.id ? newLog : log)));
                    } else if (payload.eventType === 'DELETE') {
                        const oldLog = payload.old as { id: string };
                        setLogs((prev) => prev.filter((log) => log.id !== oldLog.id));
                    }
                }
            )
            .subscribe();

        return () => {
            mounted = false;
            supabase.removeChannel(subscription);
        };
    }, [fetchLogs, limit]);

    return { logs, loading, error, refresh: fetchLogs };
}
