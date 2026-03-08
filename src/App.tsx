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

// ── Lazy-loaded routes ──────────────────────────────────────────────
const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Analysis = lazy(() => import('@/pages/Analysis').then(m => ({ default: m.Analysis })));
const Watchlist = lazy(() => import('@/pages/Watchlist').then(m => ({ default: m.Watchlist })));
const Backtest = lazy(() => import('@/pages/Backtest').then(m => ({ default: m.Backtest })));
const Scanner = lazy(() => import('@/pages/Scanner').then(m => ({ default: m.Scanner })));
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })));
const Journal = lazy(() => import('@/pages/Journal').then(m => ({ default: m.Journal })));
const StockAnalysis = lazy(() => import('@/pages/StockAnalysis').then(m => ({ default: m.StockAnalysis })));
const Positions = lazy(() => import('@/pages/Positions').then(m => ({ default: m.Positions })));
const Performance = lazy(() => import('@/pages/Performance').then(m => ({ default: m.Performance })));
const Alerts = lazy(() => import('@/pages/Alerts').then(m => ({ default: m.Alerts })));
const RiskDashboard = lazy(() => import('@/pages/RiskDashboard').then(m => ({ default: m.RiskDashboard })));
const Leaderboard = lazy(() => import('@/pages/Leaderboard').then(m => ({ default: m.Leaderboard })));
const EarningsCalendar = lazy(() => import('@/pages/EarningsCalendar').then(m => ({ default: m.EarningsCalendar })));
const NotFound = lazy(() => import('@/pages/NotFound').then(m => ({ default: m.NotFound })));

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
                                <Route path="/legacy" element={<Dashboard />} />
                                {/* Phase 3 fix (Audit C16): /analysis base route redirects to dashboard */}
                                <Route path="/analysis" element={<Navigate to="/" replace />} />
                                <Route path="/analysis/:ticker" element={<Analysis />} />
                                <Route path="/watchlist" element={<Watchlist />} />
                                <Route path="/backtest" element={<Backtest />} />
                                <Route path="/scanner" element={<Scanner />} />
                                <Route path="/research" element={<StockAnalysis />} />
                                <Route path="/research/:ticker" element={<StockAnalysis />} />
                                <Route path="/intelligence" element={<Navigate to="/?tab=intelligence" replace />} />
                                <Route path="/settings" element={<Settings />} />
                                <Route path="/journal" element={<Journal />} />
                                <Route path="/positions" element={<Positions />} />
                                <Route path="/performance" element={<Performance />} />
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
