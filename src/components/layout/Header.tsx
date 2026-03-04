/**
 * Sentinel — Header Bar
 *
 * Top header with page title, market status, notification bell, and scanner controls.
 */

import { useLocation } from 'react-router-dom';
import { Bell, Lock } from 'lucide-react';
import { destroySession } from '@/utils/auth';
import { useNotifications } from '@/hooks/useNotifications';
import { useEffect, useState } from 'react';

function useMarketStatus() {
    const [status, setStatus] = useState({ label: 'Checking...', colorClass: 'status-stopped' });

    useEffect(() => {
        const updateStatus = () => {
            const now = new Date();
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York',
                hour12: false,
                weekday: 'short',
                hour: 'numeric',
                minute: 'numeric'
            });
            const parts = formatter.formatToParts(now);
            const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

            const weekday = getPart('weekday');
            const hourStr = getPart('hour');
            let hour = parseInt(hourStr || '0', 10);
            if (hourStr === '24') hour = 0;
            const minute = parseInt(getPart('minute') || '0', 10);

            if (weekday === 'Sat' || weekday === 'Sun') {
                setStatus({ label: 'Market Closed', colorClass: 'status-stopped' });
                return;
            }

            const timeAsDecimal = hour + minute / 60;

            if (timeAsDecimal >= 9.5 && timeAsDecimal < 16) {
                setStatus({ label: 'Market Open', colorClass: 'status-running' });
            } else if (timeAsDecimal >= 4 && timeAsDecimal < 9.5) {
                setStatus({ label: 'Pre-Market', colorClass: 'status-scanning' });
            } else if (timeAsDecimal >= 16 && timeAsDecimal < 20) {
                setStatus({ label: 'After Hours', colorClass: 'status-scanning' });
            } else {
                setStatus({ label: 'Market Closed', colorClass: 'status-stopped' });
            }
        };

        updateStatus();
        const interval = setInterval(updateStatus, 60000);
        return () => clearInterval(interval);
    }, []);

    return status;
}

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
    const { unreadCount, markAllRead } = useNotifications();
    const marketInfo = useMarketStatus();

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
            className="flex items-center justify-between px-6 py-3 sticky top-0 z-10 glass-panel-heavy border-l-0 border-t-0 border-r-0 rounded-none shadow-none"
        >
            {/* Left: Page Title */}
            <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {pageTitle}
            </h1>

            {/* Center: Market Status */}
            <div className="flex items-center gap-2">
                <span className={`status-dot ${marketInfo.colorClass}`} />
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                    {marketInfo.label}
                </span>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-2">

                {/* Notification Bell */}
                <button className="p-2 rounded-lg transition-colors cursor-pointer relative"
                    style={{ backgroundColor: 'transparent', border: 'none', color: 'var(--color-text-secondary)' }}
                    title="Notifications"
                    onClick={markAllRead}>
                    <Bell size={18} />
                    {unreadCount > 0 && (
                        <span
                            className="absolute top-0.5 right-0.5 flex items-center justify-center text-white font-bold"
                            style={{
                                fontSize: '0.55rem',
                                minWidth: 16,
                                height: 16,
                                borderRadius: '9999px',
                                backgroundColor: '#EF4444',
                                padding: '0 4px',
                                lineHeight: 1,
                            }}
                        >
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
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
