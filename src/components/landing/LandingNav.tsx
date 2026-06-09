/**
 * LandingNav — sticky glass nav shared by the home page and the /about showcase.
 *
 * Links accept either an in-page hash (#id) or a route path (/about); the right
 * element (anchor vs router Link) is chosen per link.
 */

import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';

export interface NavLink {
    label: string;
    href: string;
}

const DEFAULT_LINKS: NavLink[] = [
    { label: 'Pipeline', href: '#pipeline' },
    { label: 'Audit trail', href: '#audit' },
    { label: 'Calibration', href: '#calibration' },
    { label: 'The build', href: '/about' },
];

export function LandingNav({ links = DEFAULT_LINKS }: { links?: NavLink[] }) {
    const { signIn, loading } = useGoogleSignIn();

    return (
        <header className="sticky top-0 z-50 backdrop-blur-xl bg-sentinel-950/70 border-b border-sentinel-800/40">
            <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-2 no-underline">
                    <Shield className="w-6 h-6 text-blue-400" />
                    <span className="text-lg font-bold font-display tracking-tight text-sentinel-50">Sentinel</span>
                </Link>

                <nav className="hidden md:flex items-center gap-7">
                    {links.map(link =>
                        link.href.startsWith('#') ? (
                            <a key={link.href} href={link.href} className="text-sm text-sentinel-400 hover:text-sentinel-100 transition-colors no-underline">
                                {link.label}
                            </a>
                        ) : (
                            <Link key={link.href} to={link.href} className="text-sm text-sentinel-400 hover:text-sentinel-100 transition-colors no-underline">
                                {link.label}
                            </Link>
                        ),
                    )}
                </nav>

                <button
                    onClick={signIn}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors border-none cursor-pointer disabled:opacity-50"
                >
                    {loading ? 'Redirecting…' : 'Sign in'}
                </button>
            </div>
        </header>
    );
}
