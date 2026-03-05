/** Time range types and utilities for sentinel filters */

export type TimeRange = '1h' | '6h' | '24h' | '7d' | 'all';

/** Returns the cutoff Date for a given time range */
export function getTimeRangeCutoff(range: TimeRange): Date | null {
    if (range === 'all') return null;

    const now = new Date();
    const ms: Record<Exclude<TimeRange, 'all'>, number> = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
    };

    return new Date(now.getTime() - ms[range]);
}
