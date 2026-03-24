/**
 * Sentinel — App Layout Shell
 *
 * Main layout wrapping the sidebar, header, and page content.
 * Also hosts global overlays: toast notifications, command palette, and onboarding.
 * Integrates the reactive ambient background and device capability checks.
 *
 * Mobile: Sidebar hidden, bottom nav visible, content full-width with padding for bottom nav.
 */

import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileNav } from './MobileNav';
import { AmbientBackground } from './AmbientBackground';
import { SignalToast } from '@/components/notifications/SignalToast';
import { ToastContainer } from '@/components/notifications/ToastContainer';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { OnboardingOverlay } from '@/components/shared/OnboardingOverlay';
import { AnalystChat } from '@/components/analysis/AnalystChat';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { OutcomeTracker } from '@/services/outcomeTracker';
import { ExposureMonitor } from '@/services/exposureMonitor';
import { BrowserNotificationService } from '@/services/browserNotifications';

export function AppLayout() {
    const { isLowEnd } = useDeviceCapability();
    useKeyboardShortcuts();
    const outcomeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const exposureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    // Pause intervals when tab is hidden to avoid wasted API calls
    useEffect(() => {
        function handleVisibilityChange() {
            if (document.hidden) {
                if (outcomeIntervalRef.current) {
                    clearInterval(outcomeIntervalRef.current);
                    outcomeIntervalRef.current = null;
                }
                if (exposureIntervalRef.current) {
                    clearInterval(exposureIntervalRef.current);
                    exposureIntervalRef.current = null;
                }
            } else {
                // Resume on tab focus
                if (!outcomeIntervalRef.current) {
                    OutcomeTracker.updatePendingOutcomes().catch(() => {});
                    outcomeIntervalRef.current = setInterval(() => {
                        OutcomeTracker.updatePendingOutcomes().catch(() => {});
                    }, 30 * 60 * 1000);
                }
                if (!exposureIntervalRef.current) {
                    ExposureMonitor.checkAndAlert().catch(() => {});
                    exposureIntervalRef.current = setInterval(() => {
                        ExposureMonitor.checkAndAlert().catch(() => {});
                    }, 5 * 60 * 1000);
                }
            }
        }
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Run OutcomeTracker independently every 30 minutes
    useEffect(() => {
        // Initial run after 60s to avoid blocking app startup
        const startupTimeout = setTimeout(() => {
            OutcomeTracker.updatePendingOutcomes().catch(() => {});
            // Mark overdue outcomes + send browser notification if needed
            OutcomeTracker.markOverdueOutcomes().then(() => {
                OutcomeTracker.getComplianceStats().then(stats => {
                    if (stats.overdue > 0 || stats.pending > 3) {
                        BrowserNotificationService.notifyOutcomeReminder(stats.overdue, stats.pending);
                    }
                }).catch(() => {});
            }).catch(() => {});
        }, 60_000);

        outcomeIntervalRef.current = setInterval(() => {
            OutcomeTracker.updatePendingOutcomes().catch(() => {});
        }, 30 * 60 * 1000); // 30 minutes

        return () => {
            clearTimeout(startupTimeout);
            if (outcomeIntervalRef.current) clearInterval(outcomeIntervalRef.current);
        };
    }, []);

    // Continuous sector/total exposure drift monitoring — configurable interval
    useEffect(() => {
        const intervalMs = ExposureMonitor.getCheckInterval();

        // Initial check after 90s (after outcome tracker starts)
        const startupTimeout = setTimeout(() => {
            ExposureMonitor.checkAndAlert().catch(() => {});
        }, 90_000);

        exposureIntervalRef.current = setInterval(() => {
            ExposureMonitor.checkAndAlert().catch(() => {});
        }, intervalMs);

        return () => {
            clearTimeout(startupTimeout);
            if (exposureIntervalRef.current) clearInterval(exposureIntervalRef.current);
        };
    }, []);

    return (
        <div className="relative flex min-h-screen" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
            <AmbientBackground />
            {/* Sidebar — hidden on mobile, visible on md+ */}
            <div className="hidden md:block">
                <Sidebar />
            </div>
            <div className="relative flex flex-col flex-1 min-w-0" style={{ zIndex: 1 }}>
                <Header />
                <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-y-auto pb-20 md:pb-6">
                    <Outlet />
                </main>
            </div>
            {/* Mobile Bottom Nav */}
            <MobileNav />
            <SignalToast />
            <ToastContainer />
            <CommandPalette />
            <OnboardingOverlay />
            <AnalystChat />
        </div>
    );
}
