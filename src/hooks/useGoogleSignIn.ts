/**
 * useGoogleSignIn — shared Google OAuth entry point for public surfaces.
 *
 * Extracted so the landing nav, hero, and CTA (and the /about showcase) all
 * trigger the exact same auth flow rather than re-implementing the Supabase
 * OAuth call in each place.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/config/supabase';

export function useGoogleSignIn() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const signIn = useCallback(async () => {
        setLoading(true);
        setError(null);
        const { error: authError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
        if (authError) {
            setError(authError.message);
            setLoading(false);
        }
        // On success the browser redirects, so we intentionally leave loading=true.
    }, []);

    return { signIn, loading, error };
}
