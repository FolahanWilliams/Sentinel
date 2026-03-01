/**
 * Sentinel — Header Bar
 *
 * Top header with page title, market status, notification bell, and scanner controls.
 */

import { useLocation } from 'react-router-dom';
import { Bell, Lock, Play, Pause, RefreshCw } from 'lucide-react';
import { destroySession } from '@/utils/auth';

const PAGE_TITLES: Record<string, string> = {
    '/': 'Dashboard',
    '/watchlist': 'Watchlist',
    '/scanner': 'Scanner',
    '/backtest': 'Backtest',
    '/journal': 'Journal',
    '/settings': 'Settings',
};

export function Header() {
    const location = useLocation();

    // Match analysis routes
    const pageTitle = location.pathname.startsWith('/analysis/')
        ? `Analysis — ${location.pathname.split('/')[2]?.toUpperCase() ?? ''}`
        : PAGE_TITLES[location.pathname] ?? 'Sentinel';

    const handleLock = () => {
        destroySession();
        window.location.reload();
    };

    return (
        <header
            className="flex items-center justify-between px-6 py-3 sticky top-0 z-10"
            style={{
                backgroundColor: 'var(--color-bg-surface)',
                borderBottom: '1px solid var(--color-border-default)',
                backdropFilter: 'blur(12px)',
            }}
        >
            {/* Left: Page Title */}
            <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {pageTitle}
            </h1>

            {/* Center: Market Status */}
            <div className="flex items-center gap-2">
                <span className="status-dot status-stopped" />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    Market Closed
                </span>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2">
                {/* Scanner Quick Controls */}
                <button className="p-2 rounded-lg transition-colors cursor-pointer"
                    style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-secondary)' }}
                    title="Start Scanner">
                    <Play size={16} />
                </button>
                <button className="p-2 rounded-lg transition-colors cursor-pointer"
                    style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-secondary)' }}
                    title="Pause Scanner">
                    <Pause size={16} />
                </button>
                <button className="p-2 rounded-lg transition-colors cursor-pointer"
                    style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-secondary)' }}
                    title="Manual Scan">
                    <RefreshCw size={16} />
                </button>

                {/* Divider */}
                <div className="w-px h-5 mx-1" style={{ backgroundColor: 'var(--color-border-default)' }} />

                {/* Notification Bell */}
                <button className="p-2 rounded-lg transition-colors cursor-pointer relative"
                    style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-secondary)' }}
                    title="Notifications">
                    <Bell size={18} />
                    {/* TODO: Badge with unread count from useNotifications hook */}
                </button>

                {/* Lock Button */}
                <button
                    onClick={handleLock}
                    className="p-2 rounded-lg transition-colors cursor-pointer"
                    style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-muted)' }}
                    title="Lock Sentinel"
                >
                    <Lock size={16} />
                </button>
            </div>
        </header>
    );
}
