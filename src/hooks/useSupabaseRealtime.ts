// Hook stubs — full implementations in later stages
import { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';

/** Subscribe to Supabase real-time changes on a table. */
export function useSupabaseRealtime<T>(table: string, filter?: string) {
    const [data, setData] = useState<T[]>([]);
    useEffect(() => {
        const channel = supabase.channel(`realtime-${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table, filter }, (payload) => {
                setData(prev => [payload.new as T, ...prev]);
            })
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [table, filter]);
    return data;
}
