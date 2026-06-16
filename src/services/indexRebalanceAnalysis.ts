/**
 * Sentinel — Index Rebalance analysis (pure, no I/O)
 *
 * The "index effect": when a stock is added to (or removed from) a major index,
 * funds tracking that index must mechanically buy (or sell) around the effective
 * date. The edge is anticipating that flow before it completes — and not chasing
 * once it's already priced in. This module turns an event + live numbers into a
 * recommendation and an entry plan. Deterministic and unit-tested.
 */
export type RebalanceRecommendation = 'enter_now' | 'wait_pullback' | 'avoid_extended';

export interface RebalanceAnalysis {
    recommendation: RebalanceRecommendation;
    daysToEffective: number;
    runUpPct: number | null;
    entryZoneLow: number | null;
    entryZoneHigh: number | null;
    stop: number | null;
    target: number | null;
    conviction: number; // 0-100
    thesis: string;
    structuralNote: string;
    analyzedAt: string;
}

export interface RebalanceInputs {
    action: 'add' | 'remove';
    ticker: string;
    indexName: string;
    effectiveDate: string; // YYYY-MM-DD
    currentPrice: number;
    refPrice: number | null; // price near the announcement
    atr: number | null; // 14-period ATR if known
    rsi14: number | null;
    sma50: number | null;
    trendBullish: boolean | null;
    today?: Date;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Whole days from `today` to the effective date (negative once it has passed). */
export function daysBetween(effectiveDate: string, today: Date): number {
    const eff = new Date(`${effectiveDate}T00:00:00Z`).getTime();
    const t = new Date(`${today.toISOString().split('T')[0]}T00:00:00Z`).getTime();
    return Math.round((eff - t) / 86_400_000);
}

/** Pure analysis of an index-rebalance setup → recommendation + entry plan. */
export function analyzeRebalance(i: RebalanceInputs): RebalanceAnalysis {
    const today = i.today ?? new Date();
    const daysToEffective = daysBetween(i.effectiveDate, today);
    const atr = i.atr && i.atr > 0 ? i.atr : i.currentPrice * 0.03; // fallback: 3% of price
    const runUpPct = i.refPrice && i.refPrice > 0
        ? round2(((i.currentPrice - i.refPrice) / i.refPrice) * 100)
        : null;

    const structuralNote = i.action === 'add'
        ? `Funds tracking the ${i.indexName} must buy ${i.ticker} on/around ${i.effectiveDate} — a mechanical demand tailwind. The run-up typically front-runs the effective date and can fade ("sell the news") after it.`
        : `${i.ticker} is being removed from the ${i.indexName} on ${i.effectiveDate} — index funds must sell, a mechanical headwind. Treat as a long to avoid, not a dip to buy.`;

    // Removals: forced selling — no long plan.
    if (i.action === 'remove') {
        return {
            recommendation: 'avoid_extended',
            daysToEffective,
            runUpPct,
            entryZoneLow: null,
            entryZoneHigh: null,
            stop: null,
            target: null,
            conviction: 35,
            thesis: `Index removal — forced selling into ${i.effectiveDate}. Not a long.${runUpPct != null ? ` Down ${Math.abs(runUpPct)}% since the announcement.` : ''}`,
            structuralNote,
            analyzedAt: today.toISOString(),
        };
    }

    // Additions: long setup.
    let recommendation: RebalanceRecommendation;
    if (daysToEffective < -3) {
        recommendation = 'avoid_extended'; // flow done; post-effective reversion risk
    } else if (runUpPct != null && runUpPct >= 20) {
        recommendation = 'avoid_extended'; // most of the index-effect pop is priced in
    } else if (i.rsi14 != null && i.rsi14 >= 70) {
        recommendation = 'wait_pullback'; // short-term extended
    } else if ((i.rsi14 != null && i.rsi14 <= 45) || (runUpPct != null && runUpPct < 5)) {
        recommendation = 'enter_now'; // not extended, tailwind still ahead
    } else {
        recommendation = 'wait_pullback';
    }

    const entryZoneHigh = round2(i.currentPrice);
    // Pullback target: a ~0.6-ATR dip, floored at ~5% under price; prefer the
    // 50-day MA as support when it sits just below.
    let entryZoneLow = i.currentPrice - 0.6 * atr;
    if (i.sma50 && i.sma50 < i.currentPrice && i.sma50 > i.currentPrice * 0.94) {
        entryZoneLow = Math.min(entryZoneLow, i.sma50);
    }
    entryZoneLow = round2(Math.max(entryZoneLow, i.currentPrice * 0.95));
    const stop = round2(entryZoneLow - 1.5 * atr);
    const target = round2(entryZoneHigh + 2.5 * atr);

    let conviction = 55;
    if (daysToEffective >= 2 && daysToEffective <= 20) conviction += 15;
    if (i.rsi14 != null && i.rsi14 >= 40 && i.rsi14 <= 62) conviction += 10;
    if (i.trendBullish) conviction += 5;
    if (runUpPct != null && runUpPct >= 20) conviction -= 25;
    if (daysToEffective < 0) conviction -= 15;
    conviction = clamp(Math.round(conviction), 5, 95);

    const entryText = recommendation === 'enter_now'
        ? `Enter near $${entryZoneHigh} (or scale into $${entryZoneLow}–$${entryZoneHigh}).`
        : recommendation === 'wait_pullback'
            ? `Wait for a pullback into $${entryZoneLow}–$${entryZoneHigh}, then enter.`
            : 'Extended — the index-effect move is largely priced; skip or wait for a deeper reset.';

    const thesis = `${i.ticker} joins the ${i.indexName} ${daysToEffective >= 0 ? `in ${daysToEffective}d` : `${-daysToEffective}d ago`} (effective ${i.effectiveDate}). ${entryText}${runUpPct != null ? ` Up ${runUpPct}% since the announcement.` : ''}`;

    return {
        recommendation,
        daysToEffective,
        runUpPct,
        entryZoneLow,
        entryZoneHigh,
        stop,
        target,
        conviction,
        thesis,
        structuralNote,
        analyzedAt: today.toISOString(),
    };
}
