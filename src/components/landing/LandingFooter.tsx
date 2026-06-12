/**
 * LandingFooter — shared footer for the public surfaces.
 */

import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';

export function LandingFooter() {
    const year = new Date().getFullYear();
    return (
        <footer className="border-t border-sentinel-800/40">
            <div className="max-w-6xl mx-auto px-6 py-12">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-5 h-5 text-blue-400" />
                            <span className="font-bold font-display text-sentinel-100">Sentinel</span>
                        </div>
                        <p className="text-xs text-sentinel-500 max-w-xs leading-relaxed">
                            An autonomous market-intelligence engine — reasoning, self-critique, and an auditable record on every signal.
                        </p>
                    </div>
                    <nav className="flex items-center gap-6 text-xs text-sentinel-500">
                        <a href="#pipeline" className="hover:text-sentinel-300 transition-colors no-underline">Pipeline</a>
                        <a href="#audit" className="hover:text-sentinel-300 transition-colors no-underline">Audit trail</a>
                        <Link to="/about" className="hover:text-sentinel-300 transition-colors no-underline">The build</Link>
                    </nav>
                </div>
                <div className="mt-8 pt-6 border-t border-sentinel-800/40 text-[11px] text-sentinel-600">
                    © {year} Sentinel · Live, transparent, auditable reasoning.
                </div>
            </div>
        </footer>
    );
}
