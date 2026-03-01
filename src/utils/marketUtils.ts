import { MARKET_HOURS } from '@/config/constants';
import type { MarketStatus } from '@/types/market';

export function getMarketStatus(): MarketStatus {
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: MARKET_HOURS.timezone }));
    const h = et.getHours(), m = et.getMinutes(), t = h * 60 + m;
    const day = et.getDay();
    if (day === 0 || day === 6) return 'closed';
    if (t < 240) return 'closed';
    if (t < 570) return 'pre_market';
    if (t < 960) return 'open';
    if (t < 1200) return 'after_hours';
    return 'closed';
}
export function isMarketOpen(): boolean { return getMarketStatus() === 'open'; }
