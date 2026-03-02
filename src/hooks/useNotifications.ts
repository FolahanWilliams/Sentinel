import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

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
        // Pull recent signals as notifications (signals are the events users care about)
        const { data } = await supabase
            .from('signals')
            .select('id, ticker, signal_type, thesis, created_at')
            .order('created_at', { ascending: false })
            .limit(20);

        const mapped: Notification[] = (data || []).map((s: any) => ({
            id: s.id,
            ticker: s.ticker,
            signal_type: s.signal_type,
            message: s.thesis || `New ${s.signal_type} signal for ${s.ticker}`,
            read: false, // In a full impl, track read state per-user
            created_at: s.created_at,
        }));

        setNotifications(mapped);

        // Count signals from the last 24h as "unread"
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recentCount = mapped.filter(n => n.created_at >= oneDayAgo).length;
        setUnreadCount(recentCount);
    }, []);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const markAllRead = useCallback(() => {
        setUnreadCount(0);
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    return { notifications, unreadCount, markAllRead, refetch: fetchNotifications };
}
