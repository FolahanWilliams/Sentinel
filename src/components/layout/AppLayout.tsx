/**
 * Sentinel — App Layout Shell
 *
 * Main layout wrapping the sidebar, header, and page content.
 * Also hosts global overlays: toast notifications, command palette, and onboarding.
 * Integrates the reactive ambient background and device capability checks.
 */

import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AmbientBackground } from './AmbientBackground';
import { SignalToast } from '@/components/notifications/SignalToast';
import { ToastContainer } from '@/components/notifications/ToastContainer';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { OnboardingOverlay } from '@/components/shared/OnboardingOverlay';
import { AnalystChat } from '@/components/analysis/AnalystChat';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import { OutcomeTracker } from '@/services/outcomeTracker';

export function AppLayout() {
    const { isLowEnd } = useDeviceCapability();
    const outcomeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Progressive degradation: halve blur and disable noise on low-end devices
    useEffect(() => {
        const root = document.documentElement;
        if (isLowEnd) {
            root.style.setProperty('--glass-blur-scale', '0.5');
            root.style.setProperty('--noise-opacity', '0');
        }
        return () => {
            root.style.removeProperty('--glass-blur-scale');
            root.style.removeProperty('--noise-opacity');
        };
    }, [isLowEnd]);

    // Run OutcomeTracker independently every 30 minutes
    useEffect(() => {
        // Initial run after 60s to avoid blocking app startup
        const startupTimeout = setTimeout(() => {
            OutcomeTracker.updatePendingOutcomes().catch(() => {});
        }, 60_000);

        outcomeIntervalRef.current = setInterval(() => {
            OutcomeTracker.updatePendingOutcomes().catch(() => {});
        }, 30 * 60 * 1000); // 30 minutes

        return () => {
            clearTimeout(startupTimeout);
            if (outcomeIntervalRef.current) clearInterval(outcomeIntervalRef.current);
        };
    }, []);

    return (
        <div className="relative flex min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
            <AmbientBackground />
            <Sidebar />
            <div className="relative flex flex-col flex-1 min-w-0" style={{ zIndex: 1 }}>
                <Header />
                <main className="flex-1 p-6 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
            <SignalToast />
            <ToastContainer />
            <CommandPalette />
            <OnboardingOverlay />
            <AnalystChat />
        </div>
    );
}
