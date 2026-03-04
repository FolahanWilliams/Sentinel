import { MARKET_HOURS } from '@/config/constants';
import type { MarketStatus } from '@/types/market';

/**
 * Phase 4 fix (Audit m8): Use Intl.DateTimeFormat with explicit parts
 * instead of parsing toLocaleString() output (which is locale-dependent).
 */
export function getMarketStatus(): MarketStatus {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: MARKET_HOURS.timezone,
        hour: 'numeric',
        minute: 'numeric',
        weekday: 'short',
        hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const weekday = parts.find(p => p.type === 'weekday')?.value;
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const t = h * 60 + m;

    // Weekend check
    if (weekday === 'Sat' || weekday === 'Sun') return 'closed';

    // Time windows (in minutes from midnight)
    if (t < 240) return 'closed';        // Before 4:00 AM
    if (t < 570) return 'pre_market';     // 4:00 AM - 9:30 AM
    if (t < 960) return 'open';           // 9:30 AM - 4:00 PM
    if (t < 1200) return 'after_hours';   // 4:00 PM - 8:00 PM
    return 'closed';
}

export function isMarketOpen(): boolean { return getMarketStatus() === 'open'; }
