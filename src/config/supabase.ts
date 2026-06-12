/**
 * Sentinel — Supabase Client
 *
 * Single shared client instance for all Supabase interactions:
 * database queries, real-time subscriptions, and edge function invocations.
 */

import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import type { Database } from '@/types/database';

/** True only when real Supabase credentials were present at build time. */
export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);

// Placeholder fallbacks so createClient never throws at import when the app is
// unconfigured (which would white-screen everything). main.tsx gates on
// isSupabaseConfigured and shows a config-error screen, so this placeholder
// client is never actually used to make requests.
export const supabase = createClient<Database>(
    env.supabaseUrl || 'https://placeholder.supabase.co',
    env.supabaseAnonKey || 'placeholder-anon-key',
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
