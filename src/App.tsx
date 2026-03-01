/**
 * Sentinel — App Root
 *
 * Wraps the app in the password gate and sets up React Router routes.
 */

import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { validateSession } from '@/utils/auth';
import { PasswordGate } from '@/components/auth/PasswordGate';
import { AppLayout } from '@/components/layout/AppLayout';
import { Dashboard } from '@/pages/Dashboard';
import { Analysis } from '@/pages/Analysis';
import { Watchlist } from '@/pages/Watchlist';
import { Backtest } from '@/pages/Backtest';
import { Scanner } from '@/pages/Scanner';
import { Settings } from '@/pages/Settings';
import { Journal } from '@/pages/Journal';
import { env } from '@/config/env';

export default function App() {
    const [authenticated, setAuthenticated] = useState(() => {
        // If no password hash is configured, allow open access
        if (!env.appPasswordHash) return true;
        return validateSession();
    });

    if (!authenticated) {
        return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />;
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
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/journal" element={<Journal />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}
