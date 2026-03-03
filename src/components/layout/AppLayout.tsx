/**
 * Sentinel — App Layout Shell
 *
 * Main layout wrapping the sidebar, header, and page content.
 * Also hosts global overlays: toast notifications, command palette, and onboarding.
 */

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SignalToast } from '@/components/notifications/SignalToast';
import { ToastContainer } from '@/components/notifications/ToastContainer';
import { CommandPalette } from '@/components/shared/CommandPalette';
import { OnboardingOverlay } from '@/components/shared/OnboardingOverlay';
import { AnalystChat } from '@/components/analysis/AnalystChat';

export function AppLayout() {
    return (
        <div className="flex min-h-screen main-ambient-background">
            <Sidebar />
            <div className="flex flex-col flex-1 min-w-0">
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
