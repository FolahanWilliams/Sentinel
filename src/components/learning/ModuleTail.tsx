/**
 * Module 6 — Tail Risk & Simulation.
 */
import { useMemo, useState } from 'react';
import { Siren } from 'lucide-react';
import { SectionHeader, ConceptGrid, Figure, Slider, StatPill, Caveat, type Concept } from './primitives';
import { mulberry32, gaussian, gaussianReturns, equityFromReturns, histogram, percentile, mean, scaleLinear, linePath } from '@/utils/learningMath';

const CONCEPTS: Concept[] = [
    {
        term: 'Value at Risk (VaR)',
        plain: 'A loss threshold you expect to breach only X% of the time, over a set horizon.',
        formula: '95% 1-day VaR = −(5th percentile of the return distribution)',
        why: 'A single, intuitive "how bad is a bad day" figure that sits at the top of nearly every risk report.',
        sayIt: '"95% VaR of 2% means on the worst 1-in-20 days I’d expect to lose at least 2%."',
    },
    {
        term: 'Three ways to compute VaR',
        plain: 'Historical (re-use the actual past distribution), Parametric (assume normal: μ − z·σ), Monte Carlo (simulate thousands of paths).',
        formula: 'parametric 95% VaR = −(μ − 1.645 σ)',
        why: 'Historical captures fat tails but is bound by the past; parametric is clean but understates crashes; MC is flexible but model-dependent.',
        sayIt: '"Historical trusts the past, parametric trusts the bell curve, Monte Carlo trusts your model."',
    },
    {
        term: 'Expected Shortfall (CVaR)',
        plain: 'The average loss *given* that you’ve breached VaR — how bad the bad days actually are, on average.',
        formula: 'ES = average of returns worse than the VaR cutoff',
        why: 'VaR tells you the doorway to the tail; ES tells you what’s behind it. Regulators increasingly prefer ES.',
        sayIt: '"VaR is the threshold; Expected Shortfall is the average loss once you’re past it."',
    },
    {
        term: 'Confidence & Horizon',
        plain: 'VaR has two knobs: how confident (95%, 99%) and over what period (1-day, 10-day).',
        formula: 'VaR scales roughly with √horizon (if returns are independent)',
        why: 'A 99% number is far larger than a 95% one — always quote both knobs or the figure is meaningless.',
        sayIt: '"A VaR without a confidence level and a horizon attached is just a number."',
    },
    {
        term: 'Stress Testing',
        plain: 'Instead of statistics, replay specific brutal scenarios: 2008, a rate shock, a sector crash.',
        formula: 'reprice the book under a chosen shock vector',
        why: 'Tail events don’t follow the bell curve — stress tests probe the scenarios VaR’s averages miss.',
        sayIt: '"Stress testing asks ‘what if 2008 happened tomorrow’, not ‘what does the average bad day look like’."',
    },
    {
        term: 'Monte Carlo Simulation',
        plain: 'Generate thousands of possible future paths from assumed drift and volatility, then read the distribution of outcomes.',
        formula: 'path_{t+1} = path_t × (1 + drift + σ · z_t)',
        why: 'Turns a single point forecast into a full range of outcomes — the honest way to express uncertainty.',
        sayIt: '"Monte Carlo replaces one guess with a fan of thousands, so I can talk in probabilities."',
    },
];

function VaRDistribution() {
    const [conf, setConf] = useState(95);

    const view = useMemo(() => {
        const rng = mulberry32(5);
        const N = 5000;
        const rets = gaussianReturns(rng, N, 0.03 / 100, 1.3 / 100);
        const q = 1 - conf / 100;
        const cutoff = percentile(rets, q);
        const tail = rets.filter(r => r <= cutoff);
        const es = tail.length ? mean(tail) : cutoff;
        const lo = -0.06;
        const hi = 0.06;
        const bins = 45;
        const hist = histogram(rets, bins, lo, hi);
        const peak = Math.max(1, ...hist.map(h => h.count));
        const W = 340;
        const H = 210;
        const P = 22;
        const sx = scaleLinear(lo, hi, P, W - P);
        const sy = scaleLinear(0, peak, H - P, P);
        const bw = ((W - 2 * P) / bins) * 0.85;
        const bars = hist.map(h => ({ x: sx(h.center) - bw / 2, y: sy(h.count), h: H - P - sy(h.count), w: bw, inTail: h.center <= cutoff }));
        return { bars, sx, varCut: cutoff, es, W, H, varLineX: sx(cutoff), pTop: P, pBot: H - P };
    }, [conf]);

    return (
        <Figure
            title="VaR & Expected Shortfall"
            accent="text-rose-400"
            caption={<>The shaded left tail is the worst {(100 - conf).toFixed(0)}% of days. The line is VaR — the edge of that tail. Expected Shortfall is the *average* depth of the shaded region, always worse than VaR.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={22} y1={view.pBot} x2={318} y2={view.pBot} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                {view.bars.map((b, i) => (
                    <rect key={i} x={b.x} y={b.y} width={b.w} height={Math.max(0, b.h)} rx={1} className={b.inTail ? 'fill-rose-500/55' : 'fill-sentinel-500/30'} />
                ))}
                <line x1={view.varLineX} y1={view.pTop} x2={view.varLineX} y2={view.pBot} className="text-rose-300" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 2" />
            </svg>
            <div className="grid grid-cols-3 gap-2 mt-1">
                <StatPill label={`${conf}% 1-day VaR`} value={`${(-view.varCut * 100).toFixed(2)}%`} accent="text-rose-400" />
                <StatPill label="Expected Shortfall" value={`${(-view.es * 100).toFixed(2)}%`} accent="text-rose-300" />
                <StatPill label="Confidence" value={`${conf}%`} />
            </div>
            <div className="mt-3">
                <Slider label="Confidence level" min={90} max={99} step={0.5} value={conf} onChange={setConf} format={v => `${v}%`} accent="accent-rose-400" />
            </div>
        </Figure>
    );
}

function MonteCarloFan() {
    const [drift, setDrift] = useState(8);
    const [vol, setVol] = useState(15);
    const [months, setMonths] = useState(36);

    const view = useMemo(() => {
        const rng = mulberry32(17);
        const M = 250;
        const T = months;
        const dDrift = drift / 100 / 12;
        const dVol = vol / 100 / Math.sqrt(12);
        const paths: number[][] = [];
        for (let m = 0; m < M; m++) {
            const rets = Array.from({ length: T }, () => dDrift + dVol * gaussian(rng));
            paths.push(equityFromReturns(rets, 1));
        }
        const W = 340;
        const H = 230;
        const P = 30;
        const allVals = paths.flat();
        const maxV = Math.max(1.2, ...allVals);
        const minV = Math.min(0.8, ...allVals);
        const sx = scaleLinear(0, T - 1, P, W - P);
        const sy = scaleLinear(minV, maxV, H - P, P);
        const band = (q: number): [number, number][] =>
            Array.from({ length: T }, (_, t) => {
                const col = paths.map(p => p[t] ?? 1);
                return [sx(t), sy(percentile(col, q))] as [number, number];
            });
        const p05 = band(0.05);
        const p50 = band(0.5);
        const p95 = band(0.95);
        const outer = `${linePath(p95)} ${[...p05].reverse().map(([x, y]) => `L${x.toFixed(2)},${y.toFixed(2)}`).join(' ')} Z`;
        const finals = paths.map(p => p[p.length - 1] ?? 1);
        return { sx, sy, W, H, outer, median: linePath(p50), f05: percentile(finals, 0.05), f50: percentile(finals, 0.5), f95: percentile(finals, 0.95) };
    }, [drift, vol, months]);

    return (
        <Figure
            title="Monte Carlo — a fan of futures"
            accent="text-indigo-400"
            caption={<>250 simulated paths from your drift and volatility, summarised as a 5th–95th percentile band with the median line. The fan widens with √time — the honest picture of forecast uncertainty.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={30} y1={view.H - 30} x2={view.W - 30} y2={view.H - 30} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <path d={view.outer} className="fill-indigo-500/20 stroke-indigo-400/40" strokeWidth={0.5} />
                <path d={view.median} fill="none" className="text-indigo-300" stroke="currentColor" strokeWidth={2} />
            </svg>
            <div className="grid grid-cols-3 gap-2 mt-1">
                <StatPill label="5th pct outcome" value={`${view.f05.toFixed(2)}×`} accent="text-rose-400" />
                <StatPill label="Median" value={`${view.f50.toFixed(2)}×`} accent="text-indigo-300" />
                <StatPill label="95th pct outcome" value={`${view.f95.toFixed(2)}×`} accent="text-emerald-400" />
            </div>
            <div className="space-y-2 mt-3">
                <Slider label="Annual drift" min={-5} max={20} step={1} value={drift} onChange={setDrift} format={v => `${v}%`} accent="accent-indigo-400" />
                <Slider label="Annual volatility" min={5} max={40} step={1} value={vol} onChange={setVol} format={v => `${v}%`} accent="accent-indigo-400" />
                <Slider label="Horizon" min={6} max={60} step={1} value={months} onChange={setMonths} format={v => `${v}mo`} accent="accent-indigo-400" />
            </div>
        </Figure>
    );
}

export function ModuleTail() {
    return (
        <div className="space-y-4">
            <SectionHeader icon={Siren} title="Tail Risk & Simulation" accent="text-rose-400" blurb="Averages hide the catastrophes. This module is about the edges of the distribution — how much you can lose on a bad day, and the full range of where you might end up." />
            <ConceptGrid concepts={CONCEPTS} accent="text-rose-400" />
            <Caveat>Every number here assumes a model of returns. The 2008 lesson: real tails are fatter than the normal curve, so a normal-based VaR will quietly understate the odds of disaster. Pair it with stress tests.</Caveat>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <VaRDistribution />
                <MonteCarloFan />
            </div>
        </div>
    );
}
