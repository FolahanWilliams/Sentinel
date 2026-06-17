/**
 * Module 2 — Risk & the Distribution of Returns.
 */
import { useMemo, useState } from 'react';
import { Activity, FlaskConical } from 'lucide-react';
import { SectionHeader, ConceptGrid, Figure, Slider, StatPill, Caveat, type Concept } from './primitives';
import {
    mulberry32, gaussianReturns, equityFromReturns, drawdownSeries, maxDrawdown,
    histogram, normalPdf, scaleLinear, linspace, linePath, mean, stdev, percentile, TRADING_DAYS,
} from '@/utils/learningMath';

const CONCEPTS: Concept[] = [
    {
        term: 'Volatility (σ)',
        plain: 'How much returns bounce around their average — the standard measure of risk.',
        formula: 'σ = √( Σ (r_t − r̄)² / (n − 1) )      σ_annual = σ_daily × √252',
        why: 'The base ingredient for Sharpe, VaR and position sizing. Higher σ = wider range of outcomes.',
        sayIt: '"Volatility is the standard deviation of returns, scaled up to a year."',
    },
    {
        term: 'The √time Rule',
        plain: 'Risk grows with the square root of time, while returns grow linearly. A monthly σ annualises by ×√12, daily by ×√252.',
        formula: 'σ_T = σ_1 × √T',
        why: 'This asymmetry (return ∝ T, risk ∝ √T) is *why* a longer horizon improves the risk/return tradeoff.',
        sayIt: '"Double the horizon and risk only grows by √2, not 2× — time is on the investor’s side."',
    },
    {
        term: 'Normal Assumption & Fat Tails',
        plain: 'Many models assume returns are bell-shaped (normal). Real markets have fatter tails — extreme days happen far more often than a normal curve predicts.',
        formula: 'kurtosis > 3  ⇒  fatter tails than normal',
        why: 'Risk models that assume normality systematically *understate* the odds of a crash.',
        sayIt: '"Markets have fat tails — the once-in-a-century day shows up every few years."',
    },
    {
        term: 'Skew & Kurtosis',
        plain: 'Skew measures asymmetry (negative skew = occasional big losses); kurtosis measures tail fatness.',
        formula: 'skew = E[(r−μ)³]/σ³      kurtosis = E[(r−μ)⁴]/σ⁴',
        why: 'Two strategies with the same vol can have very different danger profiles — skew/kurtosis reveal it.',
        sayIt: '"Negative skew means I win small often and lose big rarely — like selling insurance."',
    },
    {
        term: 'Downside Deviation',
        plain: 'Volatility of only the bad (below-target) returns. Upside swings are not penalised.',
        formula: 'DD = √( Σ min(r_t − target, 0)² / n )',
        why: 'Investors don’t fear upside — downside deviation is the risk measure that drives the Sortino ratio.',
        sayIt: '"Downside deviation only counts the moves that actually hurt."',
    },
    {
        term: 'Drawdown & Max Drawdown',
        plain: 'Drawdown is the drop from a prior peak. Max drawdown is the worst peak-to-trough fall over the period.',
        formula: 'drawdown_t = (value_t − running peak) / running peak',
        why: 'The pain a holder actually feels — it drives whether they abandon the strategy at the bottom.',
        sayIt: '"Max drawdown is the biggest fall from a high before a new high is made."',
    },
];

function ReturnsDistribution() {
    const [vol, setVol] = useState(1.2);

    const { bars, curve } = useMemo(() => {
        const rng = mulberry32(7);
        const N = 4000;
        const drift = 0.03 / 100;
        const sigma = vol / 100;
        const rets = gaussianReturns(rng, N, drift, sigma);
        const lo = -0.06;
        const hi = 0.06;
        const bins = 41;
        const hist = histogram(rets, bins, lo, hi);
        const binW = (hi - lo) / bins;
        const counts = hist.map(h => h.count);
        const peak = Math.max(1, ...counts);
        const W = 340;
        const H = 200;
        const P = 24;
        const sx = scaleLinear(lo, hi, P, W - P);
        const sy = scaleLinear(0, peak, H - P, P);
        const bw = ((W - 2 * P) / bins) * 0.85;
        const barEls = hist.map(h => ({ x: sx(h.center) - bw / 2, y: sy(h.count), h: H - P - sy(h.count), w: bw }));
        const xs = linspace(lo, hi, 80);
        const curvePts: [number, number][] = xs.map(x => [sx(x), sy(normalPdf(x, drift, sigma) * N * binW)]);
        return { bars: barEls, curve: linePath(curvePts) };
    }, [vol]);

    return (
        <Figure
            title="Volatility widens the distribution"
            accent="text-amber-400"
            caption={<>Each bar counts simulated daily returns; the curve is the matching normal bell. Raise volatility and the whole distribution spreads — the same drift now produces far more big up *and* down days.</>}
        >
            <svg viewBox="0 0 340 200" className="w-full">
                <line x1={24} y1={176} x2={316} y2={176} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                {bars.map((b, i) => (
                    <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(0, b.h)} rx={1} className="fill-amber-400/35" />
                ))}
                <path d={curve} fill="none" className="text-amber-300" stroke="currentColor" strokeWidth={2} />
            </svg>
            <div className="grid grid-cols-2 gap-2 mt-1">
                <StatPill label="Daily volatility" value={`${vol.toFixed(2)}%`} accent="text-amber-400" />
                <StatPill label="Annualised σ" value={`${(vol * Math.sqrt(TRADING_DAYS)).toFixed(0)}%`} hint="× √252" />
            </div>
            <div className="mt-3">
                <Slider label="Daily volatility" min={0.2} max={3} step={0.1} value={vol} onChange={setVol} format={v => `${v.toFixed(1)}%`} accent="accent-amber-400" />
            </div>
        </Figure>
    );
}

function DrawdownChart() {
    const [vol, setVol] = useState(1.4);
    const [seed, setSeed] = useState(3);

    const { eqPath, ddArea, mdd } = useMemo(() => {
        const rng = mulberry32(seed);
        const rets = gaussianReturns(rng, TRADING_DAYS, 0.04 / 100, vol / 100);
        const eq = equityFromReturns(rets);
        const dd = drawdownSeries(eq);
        const W = 340;
        const Htop = 120;
        const Hbot = 70;
        const P = 8;
        const n = eq.length;
        const sx = scaleLinear(0, n - 1, P, W - P);
        const minEq = Math.min(...eq);
        const maxEq = Math.max(...eq);
        const syTop = scaleLinear(minEq, maxEq, Htop - P, P);
        const eqPts: [number, number][] = eq.map((e, i) => [sx(i), syTop(e)]);
        const minDd = Math.min(...dd, -0.001);
        const syBot = scaleLinear(minDd, 0, Hbot - 4, 4);
        const ddTop: [number, number][] = dd.map((d, i) => [sx(i), syBot(d)]);
        const area = `${linePath(ddTop)} L${sx(n - 1).toFixed(2)},${syBot(0).toFixed(2)} L${sx(0).toFixed(2)},${syBot(0).toFixed(2)} Z`;
        return { eqPath: linePath(eqPts), ddArea: area, mdd: maxDrawdown(rets) };
    }, [vol, seed]);

    return (
        <Figure
            title="Equity curve & the underwater chart"
            accent="text-rose-400"
            caption={<>Top: a simulated one-year equity curve. Bottom: the same path drawn as drawdown — how far below the prior high it sits at every moment. The deepest valley is the max drawdown.</>}
        >
            <svg viewBox="0 0 340 120" className="w-full">
                <path d={eqPath} fill="none" className="text-emerald-400" stroke="currentColor" strokeWidth={1.8} />
            </svg>
            <svg viewBox="0 0 340 70" className="w-full -mt-1">
                <path d={ddArea} className="fill-rose-500/25 stroke-rose-400" strokeWidth={1} />
            </svg>
            <div className="grid grid-cols-2 gap-2 mt-1">
                <StatPill label="Max drawdown" value={`${(mdd * 100).toFixed(1)}%`} accent="text-rose-400" />
                <button onClick={() => setSeed(s => s + 1)} className="rounded-lg px-3 py-2 text-sm font-medium text-rose-400 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-colors cursor-pointer">
                    New random path
                </button>
            </div>
            <div className="mt-3">
                <Slider label="Daily volatility" min={0.4} max={3} step={0.1} value={vol} onChange={setVol} format={v => `${v.toFixed(1)}%`} accent="accent-rose-400" />
            </div>
        </Figure>
    );
}

const SAMPLE = '0.8, -1.2, 0.4, 1.5, -0.3, 0.9, -2.1, 0.6, 1.1, -0.7, 0.2, 0.5, -1.5, 1.8, -0.4, 0.3, 0.7, -0.9, 1.2, -0.6';

function parseReturns(raw: string): number[] {
    return raw.split(/[\s,]+/).map(s => s.trim()).filter(Boolean).map(Number).filter(Number.isFinite).map(n => n / 100);
}

function RiskPlayground() {
    const [raw, setRaw] = useState(SAMPLE);
    const [rfAnnual, setRfAnnual] = useState('4');

    const stats = useMemo(() => {
        const rets = parseReturns(raw);
        if (rets.length < 2) return null;
        const dailyStd = stdev(rets);
        const dailyMean = mean(rets);
        const rfDaily = (Number(rfAnnual) || 0) / 100 / TRADING_DAYS;
        return {
            n: rets.length,
            annVol: dailyStd * Math.sqrt(TRADING_DAYS),
            annRet: dailyMean * TRADING_DAYS,
            sharpe: dailyStd > 0 ? ((dailyMean - rfDaily) / dailyStd) * Math.sqrt(TRADING_DAYS) : 0,
            var95: Math.max(0, -percentile(rets, 0.05)),
            mdd: maxDrawdown(rets),
        };
    }, [raw, rfAnnual]);

    const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

    return (
        <Figure title="Risk Playground — your own series" accent="text-amber-400" caption="Paste real daily returns and every metric recomputes live. This is the fastest way to feel what each number measures.">
            <div className="space-y-3">
                <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={3} spellCheck={false} className="w-full text-sm font-mono text-sentinel-200 bg-sentinel-900/60 border border-sentinel-700/50 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400/50" />
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-xs text-sentinel-500 block mb-1">Risk-free (annual %)</label>
                        <input value={rfAnnual} onChange={e => setRfAnnual(e.target.value)} className="w-24 text-sm font-mono text-sentinel-200 bg-sentinel-900/60 border border-sentinel-700/50 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400/50" />
                    </div>
                    <button onClick={() => setRaw(SAMPLE)} className="px-3 py-2 text-sm font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer">Reset sample</button>
                </div>
            </div>
            {stats ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                    <StatPill label="Annualised vol" value={pct(stats.annVol)} accent="text-amber-400" hint="daily σ × √252" />
                    <StatPill label="Annualised return" value={pct(stats.annRet)} hint="arithmetic approx" />
                    <StatPill label="Sharpe" value={stats.sharpe.toFixed(2)} hint="excess / σ" />
                    <StatPill label="95% 1-day VaR" value={pct(stats.var95)} accent="text-rose-400" hint="5th pct loss" />
                    <StatPill label="Max drawdown" value={pct(stats.mdd)} accent="text-rose-400" hint="peak→trough" />
                    <StatPill label="Observations" value={String(stats.n)} hint="data points" />
                </div>
            ) : (
                <p className="text-sm text-amber-400/80 mt-3">Enter at least two returns to compute the metrics.</p>
            )}
        </Figure>
    );
}

export function ModuleRisk() {
    return (
        <div className="space-y-4">
            <SectionHeader icon={Activity} title="Risk & the Distribution of Returns" accent="text-amber-400" blurb="Risk is the shape of the return distribution. Learn to read its width (volatility), its tails (kurtosis), and its worst path (drawdown)." />
            <ConceptGrid concepts={CONCEPTS} accent="text-amber-400" />
            <Caveat>Volatility treats up and down moves identically, and assumes returns don’t have fat tails. It is the most-used risk measure precisely because it’s simple — but never the only one you should quote.</Caveat>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <ReturnsDistribution />
                <DrawdownChart />
            </div>
            <div className="flex items-center gap-2 pt-1">
                <FlaskConical className="w-4 h-4 text-amber-400" />
                <span className="text-sm text-sentinel-300">Practice on real numbers:</span>
            </div>
            <RiskPlayground />
        </div>
    );
}
