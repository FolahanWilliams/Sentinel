/**
 * Sentinel — App Root
 *
 * Wraps the app in Supabase Auth (Google Sign-In) and sets up React Router routes.
 * Secondary routes are lazy-loaded to reduce the initial bundle size.
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { clearUserIdCache } from '@/utils/getUserId';
import { AuthGate } from '@/components/auth/AuthGate';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChatProvider } from '@/contexts/ChatContext';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import type { Session } from '@supabase/supabase-js';

// ── Eagerly loaded (home page) ──────────────────────────────────────
import { UnifiedDashboard } from '@/components/UnifiedDashboard';

// ── Lazy-load with auto-reload on stale chunks after deploy ─────────
function lazyWithRetry<T extends Record<string, unknown>>(
    loader: () => Promise<T>,
    pick: keyof T,
): React.LazyExoticComponent<React.ComponentType> {
    return lazy(() =>
        loader()
            .then(m => ({ default: m[pick] as React.ComponentType }))
            .catch(() => {
                // Chunk hash changed after a new deploy — reload once to get fresh assets.
                const key = 'sentinel_chunk_retry';
                if (!sessionStorage.getItem(key)) {
                    sessionStorage.setItem(key, '1');
                    window.location.reload();
                }
                // If we already retried, surface the error to the ErrorBoundary.
                return Promise.reject(new Error('Failed to load page after retry'));
            }),
    );
}

// ── Lazy-loaded routes ──────────────────────────────────────────────
const Analysis = lazyWithRetry(() => import('@/pages/Analysis'), 'Analysis');
const Watchlist = lazyWithRetry(() => import('@/pages/Watchlist'), 'Watchlist');
const Backtest = lazyWithRetry(() => import('@/pages/Backtest'), 'Backtest');
const Scanner = lazyWithRetry(() => import('@/pages/Scanner'), 'Scanner');
const Settings = lazyWithRetry(() => import('@/pages/Settings'), 'Settings');
const Journal = lazyWithRetry(() => import('@/pages/Journal'), 'Journal');
const StockAnalysis = lazyWithRetry(() => import('@/pages/StockAnalysis'), 'StockAnalysis');
const Positions = lazyWithRetry(() => import('@/pages/Positions'), 'Positions');
const Alerts = lazyWithRetry(() => import('@/pages/Alerts'), 'Alerts');
const RiskDashboard = lazyWithRetry(() => import('@/pages/RiskDashboard'), 'RiskDashboard');
const Leaderboard = lazyWithRetry(() => import('@/pages/Leaderboard'), 'Leaderboard');
const EarningsCalendar = lazyWithRetry(() => import('@/pages/EarningsCalendar'), 'EarningsCalendar');
const NotFound = lazyWithRetry(() => import('@/pages/NotFound'), 'NotFound');

/** Minimal loading spinner shown while a lazy chunk loads */
function RouteLoader() {
    return (
        <div className="flex items-center justify-center py-32">
            <div className="w-6 h-6 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin" />
        </div>
    );
}

/** Clear all Sentinel-prefixed localStorage & sessionStorage caches */
function clearSentinelCaches() {
    for (const store of [localStorage, sessionStorage]) {
        const keysToRemove: string[] = [];
        for (let i = 0; i < store.length; i++) {
            const key = store.key(i);
            if (key?.startsWith('sentinel_')) keysToRemove.push(key);
        }
        keysToRemove.forEach(k => store.removeItem(k));
    }
}

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const prevUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        // 1. Check for an existing session on mount
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            prevUserIdRef.current = s?.user?.id ?? null;
            setSession(s);
            setLoading(false);
        }).catch(() => {
            setLoading(false);
        });

        // 2. Listen for auth state changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, s) => {
                const newUserId = s?.user?.id ?? null;
                const prevUserId = prevUserIdRef.current;

                // Clear caches when user changes or signs out
                if (event === 'SIGNED_OUT' || (newUserId && prevUserId && newUserId !== prevUserId)) {
                    clearSentinelCaches();
                    clearUserIdCache();
                }

                prevUserIdRef.current = newUserId;
                setSession(s);
                setLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    // Show a loading spinner while we check the session
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-sentinel-950">
                <div className="w-8 h-8 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin" />
            </div>
        );
    }

    // Not authenticated — show Google Sign-In
    if (!session) {
        return <AuthGate />;
    }

    return (
        // Phase 3 fix (Audit C13): Error Boundary wraps the entire app
        <ErrorBoundary>
            <ChatProvider>
                <BrowserRouter>
                    <Suspense fallback={<RouteLoader />}>
                        <Routes>
                            <Route element={<AppLayout />}>
                                <Route path="/" element={<UnifiedDashboard />} />
                                {/* Phase 3 fix (Audit C16): /analysis base route redirects to dashboard */}
                                <Route path="/analysis" element={<Navigate to="/" replace />} />
                                <Route path="/analysis/:ticker" element={<Analysis />} />
                                <Route path="/watchlist" element={<Watchlist />} />
                                <Route path="/backtest" element={<Backtest />} />
                                <Route path="/scanner" element={<Scanner />} />
                                <Route path="/research" element={<StockAnalysis />} />
                                <Route path="/research/:ticker" element={<StockAnalysis />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/journal" element={<Journal />} />
                                <Route path="/positions" element={<Positions />} />
                                <Route path="/performance" element={<Navigate to="/backtest?tab=performance" replace />} />
                                <Route path="/intelligence" element={<Navigate to="/?tab=intelligence" replace />} />
                                <Route path="/alerts" element={<Alerts />} />
                                <Route path="/risk" element={<RiskDashboard />} />
                                <Route path="/leaderboard" element={<Leaderboard />} />
                                <Route path="/earnings" element={<EarningsCalendar />} />
                                {/* Phase 3 fix (Audit C15): 404 catch-all route */}
                                <Route path="*" element={<NotFound />} />
                            </Route>
                        </Routes>
                    </Suspense>
                </BrowserRouter>
            </ChatProvider>
        </ErrorBoundary>
    );
}
