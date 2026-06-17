/**
 * Module 5 — Portfolio Construction (Modern Portfolio Theory).
 */
import { useMemo, useState } from 'react';
import { PieChart } from 'lucide-react';
import { SectionHeader, ConceptGrid, Figure, Slider, StatPill, type Concept } from './primitives';
import { mulberry32, randomWeights, portfolioReturn, portfolioVol, portfolioVol2, scaleLinear, linspace, linePath } from '@/utils/learningMath';

const CONCEPTS: Concept[] = [
    {
        term: 'Position & Active Weight',
        plain: 'A position’s weight is its value over AUM. Active weight is how far that sits from the benchmark’s weight — the deliberate bet.',
        formula: 'w_i = value_i / AUM      active = w_portfolio − w_benchmark',
        why: 'Risk and active return both concentrate in your largest active weights.',
        sayIt: '"Overweight means I hold more than the benchmark does — a conscious bet I have to justify."',
    },
    {
        term: 'Concentration (Herfindahl)',
        plain: 'One number for how concentrated the book is — the sum of squared weights.',
        formula: 'HHI = Σ w_i²     effective N = 1 / HHI',
        why: '1/HHI is the "effective number of holdings" — a quick read on whether you’re truly diversified.',
        sayIt: '"Sum of squared weights; its reciprocal is how many equal positions I effectively hold."',
    },
    {
        term: 'Diversification',
        plain: 'Combining assets that don’t move in lockstep yields a portfolio less risky than the weighted average of its parts.',
        formula: 'σ_p < Σ w_i σ_i   whenever correlations < 1',
        why: 'The only "free lunch" in finance — risk reduction without giving up expected return.',
        sayIt: '"As long as correlations are below 1, the whole is less risky than the sum of its parts."',
    },
    {
        term: 'The Efficient Frontier',
        plain: 'For every level of risk there is a portfolio with the highest possible return. That set of best portfolios is the efficient frontier.',
        formula: 'maximise E[R_p]  subject to  σ_p = target',
        why: 'Any portfolio *below* the frontier is strictly inferior — same risk, less return. It defines "optimal".',
        sayIt: '"The frontier is the menu of best-possible portfolios; anything underneath it is a mistake."',
    },
    {
        term: 'Tangency Portfolio & the CML',
        plain: 'Mix the risk-free asset with the single highest-Sharpe (tangency) portfolio and you trace the Capital Market Line — better than the frontier itself.',
        formula: 'CML: E[R] = r_f + Sharpe_tangency · σ',
        why: 'Everyone should hold the *same* risky portfolio (the tangency) and dial risk via cash/leverage — the core MPT result.',
        sayIt: '"Hold the best-Sharpe portfolio and adjust risk with cash — that beats picking points on the frontier."',
    },
    {
        term: 'Rebalancing',
        plain: 'Periodically trimming winners and topping up laggards back to target weights.',
        formula: 'trade Δw_i = target_i − current_i',
        why: 'Enforces "sell high, buy low" mechanically and stops winners from quietly becoming your whole risk budget.',
        sayIt: '"Rebalancing is a disciplined sell-high-buy-low that also caps concentration drift."',
    },
];

function DiversificationCurve() {
    const [rho, setRho] = useState(0.2);
    const s1 = 12;
    const s2 = 20;

    const view = useMemo(() => {
        const W = 340;
        const H = 220;
        const P = 32;
        const sx = scaleLinear(0, 1, P, W - P);
        const sy = scaleLinear(8, 22, H - P, P);
        const ws = linspace(0, 1, 60);
        const curve: [number, number][] = ws.map(w => [sx(w), sy(portfolioVol2(w, s1, s2, rho))]);
        const straight: [number, number][] = ws.map(w => [sx(w), sy(w * s1 + (1 - w) * s2)]);
        // min-variance weight (2-asset closed form)
        const denom = s1 * s1 + s2 * s2 - 2 * rho * s1 * s2;
        const wMin = denom !== 0 ? (s2 * s2 - rho * s1 * s2) / denom : 0.5;
        const wMinC = Math.max(0, Math.min(1, wMin));
        const minVol = portfolioVol2(wMinC, s1, s2, rho);
        return { sx, sy, W, H, curve, straight, wMinC, minVol, minPt: [sx(wMinC), sy(minVol)] as [number, number] };
    }, [rho]);

    return (
        <Figure
            title="Diversification bends the risk down"
            accent="text-fuchsia-400"
            caption={<>Two assets (σ 12% and 20%). The dashed line is naïve "average" risk. The solid curve is the *real* portfolio risk — it bows below the line whenever ρ &lt; 1. The lowest point is the minimum-variance mix.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={32} y1={188} x2={308} y2={188} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <line x1={32} y1={32} x2={32} y2={188} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <text x={170} y={208} textAnchor="middle" className="fill-sentinel-500 text-[9px]">weight in asset 1 →</text>
                <path d={linePath(view.straight)} fill="none" className="text-sentinel-500" stroke="currentColor" strokeWidth={1.3} strokeDasharray="4 3" />
                <path d={linePath(view.curve)} fill="none" className="text-fuchsia-400" stroke="currentColor" strokeWidth={2} />
                <circle cx={view.minPt[0]} cy={view.minPt[1]} r={4} className="fill-fuchsia-300" />
            </svg>
            <div className="grid grid-cols-2 gap-2 mt-1">
                <StatPill label="Min-variance σ" value={`${view.minVol.toFixed(1)}%`} accent="text-fuchsia-400" hint={`${(view.wMinC * 100).toFixed(0)}% in asset 1`} />
                <StatPill label="Correlation ρ" value={rho.toFixed(2)} />
            </div>
            <div className="mt-3">
                <Slider label="Correlation ρ" min={-0.9} max={1} step={0.05} value={rho} onChange={setRho} format={v => v.toFixed(2)} accent="accent-fuchsia-400" />
            </div>
        </Figure>
    );
}

const EF_MU = [6, 10, 14];
const EF_SIG = [10, 16, 22];
const EF_CORR = [
    [1, 0.3, 0.2],
    [0.3, 1, 0.4],
    [0.2, 0.4, 1],
];

function EfficientFrontier() {
    const [rf, setRf] = useState(2);

    const cloud = useMemo(() => {
        const rng = mulberry32(99);
        const pts: { vol: number; ret: number }[] = [];
        for (let i = 0; i < 800; i++) {
            const w = randomWeights(rng, 3);
            pts.push({ vol: portfolioVol(w, EF_SIG, EF_CORR), ret: portfolioReturn(w, EF_MU) });
        }
        return pts;
    }, []);

    const view = useMemo(() => {
        const W = 340;
        const H = 250;
        const P = 34;
        const sx = scaleLinear(6, 24, P, W - P);
        const sy = scaleLinear(4, 16, H - P, P);
        const tangency = cloud.reduce((a, b) => ((b.ret - rf) / b.vol > (a.ret - rf) / a.vol ? b : a), cloud[0] ?? { vol: 1, ret: rf });
        const minVol = cloud.reduce((a, b) => (b.vol < a.vol ? b : a), cloud[0] ?? { vol: 1, ret: rf });
        // upper envelope (efficient frontier): max return per vol-bin
        const bins = 26;
        const lo = 6;
        const hi = 24;
        const best = new Array(bins).fill(-Infinity) as number[];
        for (const p of cloud) {
            let b = Math.floor(((p.vol - lo) / (hi - lo)) * bins);
            if (b < 0) b = 0;
            if (b >= bins) b = bins - 1;
            if (p.ret > (best[b] ?? -Infinity)) best[b] = p.ret;
        }
        const frontier: [number, number][] = [];
        best.forEach((r, i) => {
            if (r > -Infinity) frontier.push([sx(lo + ((i + 0.5) / bins) * (hi - lo)), sy(r)]);
        });
        const sharpe = (tangency.ret - rf) / tangency.vol;
        return { W, H, sx, sy, tangency, minVol, frontier, sharpe, cml: { x1: sx(6), y1: sy(rf + sharpe * 6), x2: sx(24), y2: sy(Math.min(16, rf + sharpe * 24)) } };
    }, [cloud, rf]);

    return (
        <Figure
            title="The efficient frontier & the Capital Market Line"
            accent="text-emerald-400"
            caption={<>Each grey dot is a random 3-asset portfolio. The upper edge is the efficient frontier — best return per risk. The green line is the Capital Market Line from the risk-free rate through the highest-Sharpe (tangency) portfolio.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={34} y1={view.H - 34} x2={view.W - 34} y2={view.H - 34} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <line x1={34} y1={34} x2={34} y2={view.H - 34} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <text x={view.W - 34} y={view.H - 20} textAnchor="end" className="fill-sentinel-500 text-[9px]">risk (σ) →</text>
                <text x={28} y={34} textAnchor="end" className="fill-sentinel-500 text-[9px]">return</text>
                {cloud.map((p, i) => (
                    <circle key={i} cx={view.sx(p.vol)} cy={view.sy(p.ret)} r={1.4} className="fill-sentinel-500/40" />
                ))}
                <path d={linePath(view.frontier)} fill="none" className="text-emerald-400" stroke="currentColor" strokeWidth={2} />
                <line x1={view.cml.x1} y1={view.cml.y1} x2={view.cml.x2} y2={view.cml.y2} className="text-emerald-300" stroke="currentColor" strokeWidth={1.4} strokeDasharray="5 3" />
                <circle cx={view.sx(view.tangency.vol)} cy={view.sy(view.tangency.ret)} r={5} className="fill-emerald-300" />
                <circle cx={view.sx(view.minVol.vol)} cy={view.sy(view.minVol.ret)} r={4} className="fill-blue-400" />
            </svg>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                <StatPill label="Tangency Sharpe" value={view.sharpe.toFixed(2)} accent="text-emerald-400" />
                <StatPill label="Tangency" value={`${view.tangency.ret.toFixed(1)}% / ${view.tangency.vol.toFixed(1)}σ`} />
                <StatPill label="Min-variance" value={`${view.minVol.ret.toFixed(1)}% / ${view.minVol.vol.toFixed(1)}σ`} accent="text-blue-400" />
            </div>
            <div className="mt-3">
                <Slider label="Risk-free rate" min={0} max={8} step={0.5} value={rf} onChange={setRf} format={v => `${v}%`} accent="accent-emerald-400" />
            </div>
        </Figure>
    );
}

export function ModulePortfolio() {
    return (
        <div className="space-y-4">
            <SectionHeader icon={PieChart} title="Portfolio Construction (MPT)" accent="text-fuchsia-400" blurb="Holdings interact. Modern Portfolio Theory is the math of combining them so you get the most return for a chosen level of risk — the one genuine free lunch in finance." />
            <ConceptGrid concepts={CONCEPTS} accent="text-fuchsia-400" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <DiversificationCurve />
                <EfficientFrontier />
            </div>
        </div>
    );
}
