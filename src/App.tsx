/**
 * Sentinel — App Root
 *
 * Wraps the app in Supabase Auth (Google Sign-In) and sets up React Router routes.
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { AuthGate } from '@/components/auth/AuthGate';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/pages/Dashboard';
import { Analysis } from '@/pages/Analysis';
import { Watchlist } from '@/pages/Watchlist';
import { Backtest } from '@/pages/Backtest';
import { Scanner } from '@/pages/Scanner';
import { Settings } from '@/pages/Settings';
import { Journal } from '@/pages/Journal';
import { Intelligence } from '@/pages/Intelligence';
import { StockAnalysis } from '@/pages/StockAnalysis';
import type { Session } from '@supabase/supabase-js';

export default function App() {
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // 1. Check for an existing session on mount
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            setLoading(false);
        });

        // 2. Listen for auth state changes (login, logout, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (_event, s) => {
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
        <BrowserRouter>
            <Routes>
                <Route element={<AppLayout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/analysis/:ticker" element={<Analysis />} />
                    <Route path="/watchlist" element={<Watchlist />} />
                    <Route path="/backtest" element={<Backtest />} />
                    <Route path="/scanner" element={<Scanner />} />
                    <Route path="/research" element={<StockAnalysis />} />
                    <Route path="/research/:ticker" element={<StockAnalysis />} />
                    <Route path="/intelligence" element={<Intelligence />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/journal" element={<Journal />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
