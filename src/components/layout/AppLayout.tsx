/**
 * Sentinel — App Layout Shell
 *
 * Main layout wrapping the sidebar, header, and page content.
 */

import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { SignalToast } from '@/components/notifications/SignalToast';

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
        </div>
    );
}
