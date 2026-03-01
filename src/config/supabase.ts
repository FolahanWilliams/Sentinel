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
            persistSession: true,       // Persist Supabase Auth session
            autoRefreshToken: true,      // Auto-refresh JWT tokens
        },
        realtime: {
            params: {
                eventsPerSecond: 2,      // Throttle real-time updates
            },
        },
    }
);
