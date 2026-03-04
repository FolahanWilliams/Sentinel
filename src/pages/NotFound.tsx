/**
 * Phase 3 fix (Audit C15): 404 catch-all page
 */

import { Link } from 'react-router-dom';

export function NotFound() {
    return (
        <div className="min-h-[60vh] flex items-center justify-center p-8">
            <div className="text-center">
                <h1 className="text-6xl font-bold text-sentinel-400 mb-4">404</h1>
                <p className="text-lg text-zinc-400 mb-6">Page not found</p>
                <Link
                    to="/"
                    className="px-4 py-2 bg-sentinel-600 text-white rounded-lg hover:bg-sentinel-500 transition-colors text-sm"
                >
                    Back to Dashboard
                </Link>
            </div>
        </div>
    );
}
