/**
 * Sentinel — Auth Gate Component
 *
 * Full-screen dark-themed login screen with Google Sign-In via Supabase Auth.
 * Replaces the old password-only gate with a modern OAuth flow.
 */

import { useState } from 'react';
import { Shield } from 'lucide-react';
import { supabase } from '@/config/supabase';

export function AuthGate() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);

        const { error: authError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
            },
        });

        if (authError) {
            setError(authError.message);
            setLoading(false);
        }
        // On success, Supabase redirects to Google OAuth, then back to our app.
        // The App.tsx auth listener will pick up the session and call onAuthenticated.
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-sentinel-950">
            <div className="w-full max-w-sm mx-4 animate-fade-in">
                {/* Logo & Title */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-sentinel-800 border border-sentinel-700"
                        style={{ boxShadow: '0 0 20px rgba(74, 158, 255, 0.2)' }}>
                        <Shield size={32} className="text-blue-400" />
                    </div>
                    <h1 className="text-2xl font-bold text-sentinel-50">
                        Sentinel
                    </h1>
                    <p className="text-sm mt-1 text-sentinel-400">
                        Trading Intelligence Terminal
                    </p>
                </div>

                {/* Sign In Card */}
                <div className="bg-sentinel-900 border border-sentinel-700 rounded-xl p-6">
                    <button
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-200 cursor-pointer bg-white text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                        ) : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        )}
                        {loading ? 'Redirecting...' : 'Sign in with Google'}
                    </button>

                    {error && (
                        <p className="text-xs mt-3 text-center text-red-400">
                            {error}
                        </p>
                    )}

                    <div className="mt-4 pt-4 border-t border-sentinel-800">
                        <p className="text-xs text-center text-sentinel-500">
                            Authorised accounts only. Access is verified via Google OAuth.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
