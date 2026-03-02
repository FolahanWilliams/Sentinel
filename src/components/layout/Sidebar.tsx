/**
 * Sentinel — Sidebar Navigation
 *
 * Collapsible sidebar with nav items, scanner status indicator, and last scan time.
 */

import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useScannerLogs } from '@/hooks/useScannerLogs';
import {
    LayoutDashboard,
    List,
    Radar,
    FlaskConical,
    Settings,
    BookOpen,
    Newspaper,
    ChevronLeft,
    ChevronRight,
    LogOut,
} from 'lucide-react';

const NAV_ITEMS = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/intelligence', icon: Newspaper, label: 'Intelligence' },
    { to: '/watchlist', icon: List, label: 'Watchlist' },
    { to: '/scanner', icon: Radar, label: 'Scanner' },
    { to: '/backtest', icon: FlaskConical, label: 'Backtest' },
    { to: '/journal', icon: BookOpen, label: 'Journal' },
    { to: '/settings', icon: Settings, label: 'Settings' },
] as const;

export function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const { logs } = useScannerLogs(1);

    const latestLog = logs[0];
    const isScanning = latestLog?.status === 'running';

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <aside
            className="flex flex-col h-screen sticky top-0 transition-all duration-300"
            style={{
                width: collapsed ? '64px' : '220px',
                backgroundColor: 'var(--color-bg-surface)',
                borderRight: '1px solid var(--color-border-default)',
            }}
        >
            {/* Logo */}
            <div className="flex items-center gap-3 px-4 py-5"
                style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <Radar size={24} style={{ color: 'var(--color-info)', flexShrink: 0 }} />
                {!collapsed && (
                    <span className="text-lg font-bold tracking-tight"
                        style={{ color: 'var(--color-text-primary)' }}>
                        Sentinel
                    </span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 px-2 space-y-1">
                {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 no-underline ${isActive ? '' : ''
                            }`
                        }
                        style={({ isActive }) => ({
                            backgroundColor: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                            color: isActive ? 'var(--color-info)' : 'var(--color-text-secondary)',
                            borderLeft: isActive ? '2px solid var(--color-info)' : '2px solid transparent',
                        })}
                    >
                        <Icon size={18} style={{ flexShrink: 0 }} />
                        {!collapsed && <span>{label}</span>}
                    </NavLink>
                ))}
            </nav>

            {/* Sign Out */}
            <div className="px-2 pb-2">
                <button
                    onClick={handleSignOut}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer w-full"
                    style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-bearish)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                >
                    <LogOut size={18} style={{ flexShrink: 0 }} />
                    {!collapsed && <span>Sign Out</span>}
                </button>
            </div>

            {/* Scanner Status (bottom) */}
            <div className="px-4 py-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                <div className="flex items-center gap-2">
                    <span
                        className={`w-2 h-2 rounded-full ${isScanning ? 'bg-blue-500 animate-pulse' : 'bg-red-500'}`}
                        title={isScanning ? 'Scanning Active' : 'Scanner Idle'}
                    />
                    {!collapsed && (
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            {isScanning ? 'Scanning Active' : 'Scanner Idle'}
                        </span>
                    )}
                </div>
            </div>

            {/* Collapse Toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="flex items-center justify-center py-3 cursor-pointer"
                style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderTop: '1px solid var(--color-border-subtle)',
                    color: 'var(--color-text-muted)',
                }}
            >
                {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
        </aside>
    );
}
