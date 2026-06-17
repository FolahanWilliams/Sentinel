/**
 * learningMath — pure, dependency-free math for the Learning visualizations.
 *
 * Deterministic (seeded RNG) so charts are stable across renders and only move
 * when a slider changes. All array access is written to satisfy
 * noUncheckedIndexedAccess (map/reduce/for-of/destructuring, or `?? fallback`).
 */

// ── Seeded RNG + gaussian ──

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Standard-normal sample via Box–Muller. */
export function gaussian(rng: () => number): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Single-series stats ──

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

export function variance(xs: number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
}

export const stdev = (xs: number[]): number => Math.sqrt(variance(xs));

/** Downside deviation: std of returns below a threshold (default 0). */
export function downsideDeviation(xs: number[], threshold = 0): number {
    const below = xs.filter(x => x < threshold).map(x => (x - threshold) ** 2);
    if (!below.length) return 0;
    return Math.sqrt(below.reduce((s, x) => s + x, 0) / below.length);
}

export function percentile(xs: number[], p: number): number {
    if (!xs.length) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const loV = sorted[lo] ?? 0;
    const hiV = sorted[hi] ?? 0;
    if (lo === hi) return loV;
    return loV + (idx - lo) * (hiV - loV);
}

// ── Paired stats (tuples avoid index-pairing hazards) ──

export function correlationPts(pts: [number, number][]): number {
    if (pts.length < 2) return 0;
    const mx = mean(pts.map(p => p[0]));
    const my = mean(pts.map(p => p[1]));
    let cov = 0;
    let vx = 0;
    let vy = 0;
    for (const [x, y] of pts) {
        cov += (x - mx) * (y - my);
        vx += (x - mx) ** 2;
        vy += (y - my) ** 2;
    }
    const d = Math.sqrt(vx * vy);
    return d ? cov / d : 0;
}

export function linregressPts(pts: [number, number][]): { slope: number; intercept: number; r2: number } {
    if (pts.length < 2) return { slope: 0, intercept: 0, r2: 0 };
    const mx = mean(pts.map(p => p[0]));
    const my = mean(pts.map(p => p[1]));
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const [x, y] of pts) {
        sxy += (x - mx) * (y - my);
        sxx += (x - mx) ** 2;
        syy += (y - my) ** 2;
    }
    const slope = sxx ? sxy / sxx : 0;
    const intercept = my - slope * mx;
    const r2 = sxx * syy ? (sxy * sxy) / (sxx * syy) : 0;
    return { slope, intercept, r2 };
}

// ── Distributions ──

export function normalPdf(x: number, mu: number, sigma: number): number {
    if (sigma <= 0) return 0;
    const z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** Bucket samples into a histogram over [min,max]. Returns bin centers + counts. */
export function histogram(xs: number[], bins: number, lo: number, hi: number): { center: number; count: number }[] {
    const width = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0) as number[];
    for (const x of xs) {
        let b = Math.floor((x - lo) / width);
        if (b < 0) b = 0;
        if (b >= bins) b = bins - 1;
        counts[b] = (counts[b] ?? 0) + 1;
    }
    return counts.map((count, i) => ({ center: lo + (i + 0.5) * width, count }));
}

// ── Return series → equity / drawdown ──

export function gaussianReturns(rng: () => number, n: number, drift: number, vol: number): number[] {
    return Array.from({ length: n }, () => drift + vol * gaussian(rng));
}

export function equityFromReturns(rets: number[], start = 1): number[] {
    const out: number[] = [];
    let eq = start;
    for (const r of rets) {
        eq *= 1 + r;
        out.push(eq);
    }
    return out;
}

export function drawdownSeries(equity: number[]): number[] {
    let peak = -Infinity;
    return equity.map(e => {
        if (e > peak) peak = e;
        return peak > 0 ? (e - peak) / peak : 0;
    });
}

export function maxDrawdown(rets: number[]): number {
    let eq = 1;
    let peak = 1;
    let mdd = 0;
    for (const r of rets) {
        eq *= 1 + r;
        if (eq > peak) peak = eq;
        const dd = (peak - eq) / peak;
        if (dd > mdd) mdd = dd;
    }
    return mdd;
}

// ── Portfolio math ──

/** Two-asset portfolio volatility. */
export function portfolioVol2(w1: number, s1: number, s2: number, rho: number): number {
    const w2 = 1 - w1;
    return Math.sqrt(Math.max(0, w1 * w1 * s1 * s1 + w2 * w2 * s2 * s2 + 2 * w1 * w2 * rho * s1 * s2));
}

export function portfolioReturn(w: number[], mu: number[]): number {
    return w.reduce((s, wi, i) => s + wi * (mu[i] ?? 0), 0);
}

/** N-asset portfolio volatility from per-asset vols + correlation matrix. */
export function portfolioVol(w: number[], sig: number[], corr: number[][]): number {
    let v = 0;
    for (let i = 0; i < w.length; i++) {
        for (let j = 0; j < w.length; j++) {
            const wi = w[i] ?? 0;
            const wj = w[j] ?? 0;
            const si = sig[i] ?? 0;
            const sj = sig[j] ?? 0;
            const rij = i === j ? 1 : corr[i]?.[j] ?? 0;
            v += wi * wj * si * sj * rij;
        }
    }
    return Math.sqrt(Math.max(0, v));
}

/** Long-only random weights via normalized exponentials (Dirichlet(1,…,1)). */
export function randomWeights(rng: () => number, n: number): number[] {
    const raw = Array.from({ length: n }, () => -Math.log(rng() + 1e-9));
    const sum = raw.reduce((s, x) => s + x, 0) || 1;
    return raw.map(x => x / sum);
}

// ── Helpers ──

export function scaleLinear(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
    const m = (r1 - r0) / (d1 - d0 || 1);
    return (v: number) => r0 + (v - d0) * m;
}

export function linspace(a: number, b: number, n: number): number[] {
    if (n <= 1) return [a];
    const step = (b - a) / (n - 1);
    return Array.from({ length: n }, (_, i) => a + i * step);
}

export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export const TRADING_DAYS = 252;

/** Build an SVG path "d" string from [x,y] pixel points. */
export function linePath(points: [number, number][]): string {
    return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}
