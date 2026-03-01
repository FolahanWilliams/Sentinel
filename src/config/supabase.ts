/**
 * Sentinel — Supabase Client
 *
 * Single shared client instance for all Supabase interactions:
 * database queries, real-time subscriptions, and edge function invocations.
 */

import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from '@/types/database';

export const supabase = createClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
        auth: {
            persistSession: false,     // We use our own password gate, not Supabase Auth
            autoRefreshToken: false,
        },
        realtime: {
            params: {
                eventsPerSecond: 2,      // Throttle real-time updates
            },
        },
    }
);
