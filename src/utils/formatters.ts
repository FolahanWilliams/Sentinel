/** Number formatting for trading data */
export function formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price);
}

// Phase 4 fix (Audit m10): Show "0.00%" without sign for exactly zero
export function formatPercent(pct: number): string {
    if (pct === 0) return '0.00%';
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
}

export function formatNumber(n: number): string {
    if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
}

export function formatVolume(vol: number): string { return formatNumber(vol); }

/**
 * Phase 4/5 fix (Audit m10, m9): Canonical timeAgo implementation.
 * Handles NaN, future dates, and sub-minute intervals gracefully.
 */
export function timeAgo(dateStr: string): string {
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return 'just now';
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (seconds < 60) return seconds === 0 ? 'just now' : `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
