/** Alert rule types and matching logic for signal notifications */

export interface AlertRule {
    id: string;
    enabled: boolean;
    sector: string;
    minConfidence: number;
    signalType: 'all' | 'overreaction' | 'contagion';
    bias: 'all' | 'bullish' | 'bearish';
    createdAt: number;
    tickers: string[];              // Empty = all tickers, otherwise only these tickers
    timeWindowStart: string | null; // e.g. "09:30" or null for any time
    timeWindowEnd: string | null;   // e.g. "16:00" or null for any time
    cooldownMinutes: number;        // 0 = no cooldown. Minutes to suppress duplicate alerts for same ticker
}

const STORAGE_KEY = 'sentinel_alert_rules';

/** Tracks last alert times per rule+ticker combo for cooldown logic */
const lastAlertTimes = new Map<string, number>();

/** Record that an alert was sent for a rule+ticker combo (for cooldown tracking) */
export function recordAlertSent(ruleId: string, ticker: string): void {
    const key = `${ruleId}::${ticker.toUpperCase()}`;
    lastAlertTimes.set(key, Date.now());
}

/** Get current time in EST as "HH:MM" string */
function getCurrentTimeEST(): string {
    const now = new Date();
    const estString = now.toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
    });
    return estString;
}

/** Check if a time string "HH:MM" is within a start/end window */
function isWithinTimeWindow(current: string, start: string, end: string): boolean {
    // Simple comparison works for same-day windows (e.g. 09:30 to 16:00)
    return current >= start && current <= end;
}

export function getMatchingAlertRules(signal: any): AlertRule[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];

        const rules: AlertRule[] = JSON.parse(stored);
        const activeRules = rules.filter(r => r.enabled);

        return activeRules.filter(rule => {
            // Sector check
            if (rule.sector !== 'All Sectors') {
                const sector = (signal.sector || '').toLowerCase();
                if (sector !== rule.sector.toLowerCase()) return false;
            }

            // Confidence check
            if (rule.minConfidence > 0) {
                if ((signal.confidence_score ?? 0) < rule.minConfidence) return false;
            }

            // Type check (exact match, not substring)
            if (rule.signalType !== 'all') {
                const type = (signal.signal_type || '').toLowerCase();
                if (type !== rule.signalType.toLowerCase()) return false;
            }

            // Bias check
            if (rule.bias !== 'all') {
                const bias = (signal.bias_type || '').toLowerCase();
                if (bias !== rule.bias.toLowerCase()) return false;
            }

            // Tickers check
            const tickers = rule.tickers ?? [];
            if (tickers.length > 0) {
                const signalTicker = (signal.ticker || '').toUpperCase();
                const allowed = tickers.map(t => t.toUpperCase());
                if (!allowed.includes(signalTicker)) return false;
            }

            // Time window check (EST)
            if (rule.timeWindowStart && rule.timeWindowEnd) {
                const currentEST = getCurrentTimeEST();
                if (!isWithinTimeWindow(currentEST, rule.timeWindowStart, rule.timeWindowEnd)) return false;
            }

            // Cooldown check
            const cooldown = rule.cooldownMinutes ?? 0;
            if (cooldown > 0) {
                const ticker = (signal.ticker || '').toUpperCase();
                const key = `${rule.id}::${ticker}`;
                const lastSent = lastAlertTimes.get(key);
                if (lastSent) {
                    const elapsedMinutes = (Date.now() - lastSent) / (1000 * 60);
                    if (elapsedMinutes < cooldown) return false;
                }
            }

            return true;
        });
    } catch (e) {
        console.error('Failed to parse alert rules', e);
        return [];
    }
}
