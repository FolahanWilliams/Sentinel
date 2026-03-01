/**
 * Sentinel — SentinelSkeleton (Spec §7)
 *
 * Shimmer loading state for the intelligence feed.
 */

export function SentinelSkeleton() {
    const shimmer = 'animate-pulse rounded-lg';

    return (
        <div className="space-y-4">
            {/* Briefing bar skeleton */}
            <div className="card" style={{ padding: 'var(--spacing-md)' }}>
                <div className="flex items-center gap-4">
                    <div className={shimmer} style={{ width: 80, height: 28, backgroundColor: 'var(--color-bg-elevated)' }} />
                    <div className="flex-1 space-y-2">
                        <div className={shimmer} style={{ width: '70%', height: 14, backgroundColor: 'var(--color-bg-elevated)' }} />
                        <div className={shimmer} style={{ width: '50%', height: 14, backgroundColor: 'var(--color-bg-elevated)' }} />
                    </div>
                    <div className={shimmer} style={{ width: 160, height: 24, backgroundColor: 'var(--color-bg-elevated)' }} />
                </div>
            </div>

            {/* Filter bar skeleton */}
            <div className="flex gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className={shimmer} style={{ width: 72, height: 32, backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-full)' }} />
                ))}
            </div>

            {/* Article cards skeleton */}
            {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <div className="flex gap-2 mb-3">
                        <div className={shimmer} style={{ width: 70, height: 22, backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-full)' }} />
                        <div className={shimmer} style={{ width: 60, height: 22, backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-full)' }} />
                        <div className={shimmer} style={{ width: 90, height: 22, backgroundColor: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-full)' }} />
                    </div>
                    <div className={shimmer} style={{ width: '85%', height: 18, backgroundColor: 'var(--color-bg-elevated)', marginBottom: 8 }} />
                    <div className={shimmer} style={{ width: '40%', height: 12, backgroundColor: 'var(--color-bg-elevated)', marginBottom: 12 }} />
                    <div className="space-y-1">
                        <div className={shimmer} style={{ width: '100%', height: 14, backgroundColor: 'var(--color-bg-elevated)' }} />
                        <div className={shimmer} style={{ width: '75%', height: 14, backgroundColor: 'var(--color-bg-elevated)' }} />
                    </div>
                </div>
            ))}
        </div>
    );
}
