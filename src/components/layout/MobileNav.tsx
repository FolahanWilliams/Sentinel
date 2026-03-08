/**
 * MobileNav — Bottom navigation bar for mobile devices.
 *
 * Shows the 5 most important tabs with icons.
 * Visible only on screens < 768px (md breakpoint).
 * Uses swipe-friendly hit targets.
 */

import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard, Briefcase, Radar, BookOpen, BarChart3,
} from 'lucide-react';

const MOBILE_TABS = [
    { to: '/', icon: LayoutDashboard, label: 'Home' },
    { to: '/positions', icon: Briefcase, label: 'Trades' },
    { to: '/scanner', icon: Radar, label: 'Scan' },
    { to: '/journal', icon: BookOpen, label: 'Journal' },
    { to: '/performance', icon: BarChart3, label: 'Perf' },
] as const;

export function MobileNav() {
    const location = useLocation();

    return (
        <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-sentinel-950/95 backdrop-blur-xl border-t border-white/5 safe-area-bottom">
            <div className="flex items-center justify-around px-2 py-1" role="menubar">
                {MOBILE_TABS.map(({ to, icon: Icon, label }) => {
                    const isActive = to === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(to);

                    return (
                        <NavLink
                            key={to}
                            to={to}
                            aria-label={label}
                            aria-current={isActive ? 'page' : undefined}
                            className="flex flex-col items-center justify-center py-2 px-3 rounded-lg no-underline transition-colors min-w-[56px]"
                        >
                            <Icon
                                className={`w-5 h-5 transition-colors ${
                                    isActive ? 'text-blue-400' : 'text-sentinel-500'
                                }`}
                                strokeWidth={isActive ? 2.5 : 2}
                            />
                            <span
                                className={`text-[10px] mt-0.5 font-medium transition-colors ${
                                    isActive ? 'text-blue-400' : 'text-sentinel-600'
                                }`}
                            >
                                {label}
                            </span>
                        </NavLink>
                    );
                })}
            </div>
        </nav>
    );
}
