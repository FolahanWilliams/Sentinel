import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

const READ_IDS_KEY = 'sentinel_read_notification_ids';

function getReadIds(): Set<string> {
    try {
        const raw = localStorage.getItem(READ_IDS_KEY);
        if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set();
}

function persistReadIds(ids: Set<string>) {
    try {
        // Keep only the most recent 200 IDs to avoid unbounded growth
        const arr = [...ids].slice(-200);
        localStorage.setItem(READ_IDS_KEY, JSON.stringify(arr));
    } catch { /* ignore */ }
}

interface Notification {
    id: string;
    ticker: string;
    signal_type: string;
    message: string;
    read: boolean;
    created_at: string;
}

export function useNotifications() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const fetchNotifications = useCallback(async () => {
        const { data } = await supabase
            .from('signals')
            .select('id, ticker, signal_type, thesis, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        const readIds = getReadIds();

        const mapped: Notification[] = (data || []).map((s: any) => ({
            id: s.id,
            ticker: s.ticker,
            signal_type: s.signal_type,
            message: s.thesis || `New ${s.signal_type} signal for ${s.ticker}`,
            read: readIds.has(s.id),
            created_at: s.created_at,
        }));

        setNotifications(mapped);
        setUnreadCount(mapped.filter(n => !n.read).length);
    }, []);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const markAllRead = useCallback(() => {
        setNotifications(prev => {
            const readIds = getReadIds();
            for (const n of prev) readIds.add(n.id);
            persistReadIds(readIds);
            return prev.map(n => ({ ...n, read: true }));
        });
        setUnreadCount(0);
    }, []);

    return { notifications, unreadCount, markAllRead, refetch: fetchNotifications };
}
