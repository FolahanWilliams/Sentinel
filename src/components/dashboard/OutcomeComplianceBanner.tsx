/**
 * Sentinel — Outcome Compliance Banner
 *
 * Shows a persistent banner when the user has overdue/pending outcomes.
 * Soft-gates new analysis insights at <80% compliance (dismissible but tracked).
 */

import { useState, useEffect, useCallback } from 'react';
import { OutcomeTracker } from '@/services/outcomeTracker';
import { AlertTriangle, CheckCircle2, X, BarChart3 } from 'lucide-react';

interface ComplianceStats {
    pending: number;
    overdue: number;
    logged: number;
    total: number;
    compliancePct: number;
}

export function OutcomeComplianceBanner() {
    const [stats, setStats] = useState<ComplianceStats | null>(null);
    const [dismissed, setDismissed] = useState(false);

    const fetchStats = useCallback(async () => {
        try {
            const s = await OutcomeTracker.getComplianceStats();
            setStats(s);
        } catch {
            // Non-fatal
        }
    }, []);

    useEffect(() => {
        fetchStats();
        // Also mark overdue outcomes when banner mounts
        OutcomeTracker.markOverdueOutcomes().then(() => fetchStats());
    }, [fetchStats]);

    if (!stats || stats.total === 0 || dismissed) return null;

    const needsAttention = stats.overdue > 0 || stats.compliancePct < 80;
    if (!needsAttention && stats.pending === 0) return null;

    const isOverdue = stats.overdue > 0;
    const bgColor = isOverdue
        ? 'bg-amber-500/10 ring-amber-500/25'
        : 'bg-sentinel-800/50 ring-sentinel-700/30';
    const textColor = isOverdue ? 'text-amber-400' : 'text-sentinel-300';

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ring-1 mb-4 ${bgColor}`}>
            {isOverdue ? (
                <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            ) : (
                <BarChart3 className="w-5 h-5 text-sentinel-400 flex-shrink-0" />
            )}

            <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${textColor}`}>
                    {isOverdue ? (
                        <>
                            {stats.overdue} decision{stats.overdue !== 1 ? 's' : ''} overdue for outcome review
                            {stats.pending > 0 && ` · ${stats.pending} pending`}
                        </>
                    ) : (
                        <>{stats.pending} decision{stats.pending !== 1 ? 's' : ''} awaiting outcome review</>
                    )}
                </p>
                <p className="text-xs text-sentinel-500 mt-0.5">
                    Outcome compliance: {stats.compliancePct}%
                    {stats.compliancePct < 80 && ' — Log outcomes to unlock full insights'}
                </p>
            </div>

            {/* Compliance indicator */}
            <div className="hidden sm:flex items-center gap-2">
                <div className="w-24 h-1.5 bg-sentinel-800 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all ${
                            stats.compliancePct >= 80 ? 'bg-emerald-500' : stats.compliancePct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${stats.compliancePct}%` }}
                    />
                </div>
                <span className="text-xs font-mono text-sentinel-500">{stats.compliancePct}%</span>
            </div>

            {stats.compliancePct >= 80 && (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            )}

            <button
                onClick={() => setDismissed(true)}
                className="p-1 hover:bg-sentinel-700/50 rounded transition-colors border-none cursor-pointer text-sentinel-500"
                aria-label="Dismiss compliance banner"
            >
                <X className="w-4 h-4" />
            </button>
        </div>
    );
}
