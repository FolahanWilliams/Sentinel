/**
 * Sentinel — Sidebar Navigation
 *
 * Collapsible sidebar with nav items, scanner status indicator, and last scan time.
 * Upgraded with framer-motion for fluid active-state gliding.
 */

import { useState, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useScannerLogs } from '@/hooks/useScannerLogs';
import { motion } from 'framer-motion';
import { CursorGlow } from '@/components/shared/CursorGlow';
import {
    LayoutDashboard,
    List,
    Radar,
    Microscope,
    FlaskConical,
    Settings,
    BookOpen,
    Newspaper,
    Briefcase,
    BarChart3,
    Bell,
    Shield,
    Trophy,
    Calendar,
    ChevronLeft,
    ChevronRight,
    LogOut,
} from 'lucide-react';

const NAV_ITEMS = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/?tab=intelligence', icon: Newspaper, label: 'Intelligence' },
    { to: '/watchlist', icon: List, label: 'Watchlist' },
    { to: '/positions', icon: Briefcase, label: 'Positions' },
    { to: '/scanner', icon: Radar, label: 'Scanner' },
    { to: '/research', icon: Microscope, label: 'Research' },
    { to: '/backtest', icon: FlaskConical, label: 'Backtest' },
    { to: '/performance', icon: BarChart3, label: 'Performance' },
    { to: '/journal', icon: BookOpen, label: 'Journal' },
    { to: '/alerts', icon: Bell, label: 'Alerts' },
    { to: '/risk', icon: Shield, label: 'Risk' },
    { to: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
    { to: '/earnings', icon: Calendar, label: 'Earnings' },
    { to: '/settings', icon: Settings, label: 'Settings' },
] as const;

export function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const { logs } = useScannerLogs(1);
    const location = useLocation();
    const sidebarRef = useRef<HTMLElement>(null);

    const latestLog = logs[0];
    const isScanning = latestLog?.status === 'running';

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <aside
            ref={sidebarRef}
            className={`flex flex-col h-screen sticky top-0 transition-all duration-300 z-50 glass-panel-heavy border-l-0 border-t-0 border-b-0 ${collapsed ? 'w-[72px]' : 'w-[240px]'
                }`}
        >
            {/* Cursor proximity glow */}
            <CursorGlow containerRef={sidebarRef} color="rgba(59, 130, 246, 0.06)" size={250} />

            {/* Logo area */}
            <div className="flex items-center gap-3 px-5 py-6 h-20 border-b border-white/5">
                <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20 shrink-0">
                    <Radar className="w-5 h-5 text-blue-400" />
                    {isScanning && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse ring-2 ring-sentinel-950" />
                    )}
                </div>
                {!collapsed && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xl font-bold font-display tracking-tight text-sentinel-50"
                    >
                        Sentinel
                    </motion.span>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-6 px-3 space-y-1.5 overflow-y-auto overflow-x-hidden">
                {NAV_ITEMS.map(({ to, icon: Icon, label }) => {
                    // Handle query-param routes like /?tab=intelligence
                    const isTabRoute = to.includes('?tab=');
                    const isActive = isTabRoute
                        ? location.pathname === '/' && location.search === to.slice(1) // Match /?tab=intelligence
                        : location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

                    return (
                        <NavLink
                            key={to}
                            to={to}
                            className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors no-underline group outline-none"
                            title={collapsed ? label : undefined}
                        >
                            {/* Animated Active Background */}
                            {isActive && (
                                <motion.div
                                    layoutId="sidebar-active-pill"
                                    className="absolute inset-0 bg-blue-500/12 border border-blue-500/20 rounded-xl"
                                    style={{
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)',
                                        boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.2), 0 0 12px rgba(59,130,246,0.15)',
                                    }}
                                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                />
                            )}

                            {/* Content */}
                            <div className={`relative flex items-center justify-center shrink-0 transition-colors ${isActive ? 'text-blue-400' : 'text-sentinel-400 group-hover:text-sentinel-200'}`}>
                                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                            </div>

                            {!collapsed && (
                                <span className={`relative whitespace-nowrap transition-colors ${isActive ? 'text-sentinel-100 font-semibold' : 'text-sentinel-400 group-hover:text-sentinel-200'}`}>
                                    {label}
                                </span>
                            )}
                        </NavLink>
                    );
                })}
            </nav>

            {/* Bottom Actions */}
            <div className="p-3 border-t border-white/5 bg-transparent space-y-2">
                <button
                    onClick={handleSignOut}
                    className="flex flex-row items-center gap-3 px-3 py-2.5 w-full rounded-xl text-sm font-medium text-sentinel-400 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer border-none outline-none group"
                    title={collapsed ? 'Sign Out' : undefined}
                >
                    <LogOut className="w-5 h-5 shrink-0 transition-transform group-hover:-translate-x-1" strokeWidth={2} />
                    {!collapsed && <span>Sign Out</span>}
                </button>

                <button
                    onClick={() => setCollapsed(!collapsed)}
                    className="flex items-center justify-center w-full py-2.5 rounded-xl text-sentinel-500 hover:text-sentinel-200 hover:bg-sentinel-800/50 transition-colors cursor-pointer border-none outline-none"
                >
                    {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                </button>
            </div>
        </aside>
    );
}
