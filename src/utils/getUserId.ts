/**
 * getUserId — Returns the current authenticated user's ID from Supabase Auth.
 *
 * Used for operations that need to explicitly pass user_id (e.g., upserts with
 * composite unique constraints). Most operations don't need this because:
 * - INSERT: The database column DEFAULT auth.uid() auto-fills user_id
 * - SELECT: RLS policies auto-filter by user_id = auth.uid()
 */

import { supabase } from '@/config/supabase';

let cachedUserId: string | null = null;

/** Get the current user's ID. Throws if not authenticated. */
export async function getUserId(): Promise<string> {
    if (cachedUserId) return cachedUserId;

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Not authenticated');

    cachedUserId = user.id;
    return user.id;
}

/** Get the current user's ID or null if not authenticated. */
export async function getUserIdOrNull(): Promise<string | null> {
    try {
        return await getUserId();
    } catch {
        return null;
    }
}

/** Clear the cached user ID (call on auth state change). */
export function clearUserIdCache(): void {
    cachedUserId = null;
}
