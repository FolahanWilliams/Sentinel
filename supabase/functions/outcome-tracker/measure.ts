/**
 * Path-aware outcome measurement — pure functions, no Deno/Node deps so the
 * logic can be unit-tested in isolation. Used by the outcome-tracker edge
 * function to reconstruct a signal's true price path from daily OHLC bars
 * rather than sampling spot price at poll time.
 *
 * Why this exists: the previous client-side tracker read the *current* quote at
 * whatever moment the 30-min poll fired. A stop or target touched intraday
 * between polls was missed, and max_gain / max_drawdown were sampled-spot, not
 * true extremes — systematically biasing the win/loss labels that calibration,
 * reflection, and the meta-learners all train on.
 */

export interface Bar {
    date: string; // YYYY-MM-DD
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export interface OutcomeRow {
    entry_price: number;
    tracked_at: string;
    price_at_1d: number | null;
    price_at_5d: number | null;
    price_at_10d: number | null;
    price_at_30d: number | null;
    max_gain: number | null;
    max_drawdown: number | null;
}

export interface SignalLevels {
    stop_loss: number | null;
    target_price: number | null;
    is_short: boolean;
}

export type FinalOutcome = 'win' | 'loss' | 'pending';

export interface MeasurementResult {
    updates: Record<string, number | boolean | string>;
    isComplete: boolean;
    finalOutcome: FinalOutcome;
}

const MS_PER_DAY = 86_400_000;
const INTERVALS = [1, 5, 10, 30] as const;
const CHECKPOINT_FIELDS: Record<number, { priceField: string; returnField: string; existing: keyof OutcomeRow }> = {
    1: { priceField: 'price_at_1d', returnField: 'return_at_1d', existing: 'price_at_1d' },
    5: { priceField: 'price_at_5d', returnField: 'return_at_5d', existing: 'price_at_5d' },
    10: { priceField: 'price_at_10d', returnField: 'return_at_10d', existing: 'price_at_10d' },
    30: { priceField: 'price_at_30d', returnField: 'return_at_30d', existing: 'price_at_30d' },
};

function dayTime(dateStr: string): number {
    return Date.parse(dateStr + 'T00:00:00Z');
}
function startOfUTCDay(ms: number): number {
    return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
}
function round4(n: number): number {
    return Math.round(n * 10_000) / 10_000;
}
function firstBarOnOrAfter(bars: Bar[], t: number): Bar | undefined {
    return bars.find(b => dayTime(b.date) >= t);
}

/**
 * Reconstruct a single outcome's state from daily bars.
 *
 * Conventions:
 *  - Stop/target hits are detected from bar high/low (side-aware), not close.
 *  - If a bar touches BOTH stop and target, the stop is assumed first
 *    (pessimistic — the standard backtesting convention).
 *  - The trade ends at the first hit bar; checkpoints/extremes beyond the exit
 *    are not recorded.
 *  - max_gain / max_drawdown are raw price-return extremes over the live path
 *    (matching the existing column semantics, now path-true).
 */
export function measureOutcome(
    outcome: OutcomeRow,
    signal: SignalLevels | null,
    bars: Bar[],
    now: number,
): MeasurementResult {
    const updates: Record<string, number | boolean | string> = {};
    const empty: MeasurementResult = { updates, isComplete: false, finalOutcome: 'pending' };

    const entry = outcome.entry_price;
    if (!(entry > 0) || bars.length === 0) return empty;

    const entryDay = startOfUTCDay(new Date(outcome.tracked_at).getTime());
    const entryTime = new Date(outcome.tracked_at).getTime();
    const daysElapsed = (now - entryTime) / MS_PER_DAY;

    const path = bars
        .filter(b => b.close > 0 && dayTime(b.date) >= entryDay)
        .sort((a, b) => a.date.localeCompare(b.date));
    if (path.length === 0) return empty;

    // ── 1. Find the first stop/target hit (defines the exit) ──────────────
    let hitIndex = -1;
    let finalOutcome: FinalOutcome = 'pending';
    if (signal) {
        const { stop_loss, target_price, is_short } = signal;
        for (let i = 0; i < path.length; i++) {
            const b = path[i]!;
            if (stop_loss != null && stop_loss > 0) {
                const hitStop = is_short ? b.high >= stop_loss : b.low <= stop_loss;
                if (hitStop) {
                    updates.hit_stop_loss = true;
                    finalOutcome = 'loss';
                    hitIndex = i;
                    break;
                }
            }
            if (target_price != null && target_price > 0) {
                const hitTarget = is_short ? b.low <= target_price : b.high >= target_price;
                if (hitTarget) {
                    updates.hit_target = true;
                    finalOutcome = 'win';
                    hitIndex = i;
                    break;
                }
            }
        }
    }

    const exitBar = hitIndex >= 0 ? path[hitIndex]! : null;
    const exitTime = exitBar ? dayTime(exitBar.date) : now;
    const livePath = hitIndex >= 0 ? path.slice(0, hitIndex + 1) : path;

    // ── 2. Checkpoint closes that occurred on/before the exit ─────────────
    for (const n of INTERVALS) {
        const f = CHECKPOINT_FIELDS[n]!;
        const targetDay = entryDay + n * MS_PER_DAY;
        if (daysElapsed >= n && targetDay <= exitTime && outcome[f.existing] == null) {
            const bar = firstBarOnOrAfter(livePath, targetDay);
            if (bar) {
                updates[f.priceField] = round4(bar.close);
                updates[f.returnField] = round4(((bar.close - entry) / entry) * 100);
            }
        }
    }

    // ── 3. Path-true extremes over the live path ──────────────────────────
    let maxHigh = -Infinity;
    let minLow = Infinity;
    for (const b of livePath) {
        if (b.high > maxHigh) maxHigh = b.high;
        if (b.low < minLow) minLow = b.low;
    }
    if (maxHigh > -Infinity) {
        const maxGain = round4(((maxHigh - entry) / entry) * 100);
        if (outcome.max_gain == null || maxGain > outcome.max_gain) updates.max_gain = maxGain;
    }
    if (minLow < Infinity) {
        const maxDraw = round4(((minLow - entry) / entry) * 100);
        if (outcome.max_drawdown == null || maxDraw < outcome.max_drawdown) updates.max_drawdown = maxDraw;
    }

    // ── 4. Completion ─────────────────────────────────────────────────────
    let isComplete = false;
    if (hitIndex >= 0) {
        isComplete = true;
        updates.completed_at = new Date(exitTime).toISOString();
    } else if (daysElapsed >= 30) {
        // Time expiry: settle by strategy return at the 30d checkpoint.
        isComplete = true;
        const bar = firstBarOnOrAfter(path, entryDay + 30 * MS_PER_DAY) ?? path[path.length - 1]!;
        const raw = ((bar.close - entry) / entry) * 100;
        const strat = signal?.is_short ? -raw : raw;
        finalOutcome = strat >= 0 ? 'win' : 'loss';
        updates.completed_at = new Date(now).toISOString();
    }

    if (isComplete) updates.outcome = finalOutcome;

    return { updates, isComplete, finalOutcome };
}
