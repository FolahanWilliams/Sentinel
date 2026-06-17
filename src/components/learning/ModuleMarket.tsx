/**
 * Module 4 — Market Risk, Correlation & CAPM.
 */
import { useMemo, useState } from 'react';
import { Network } from 'lucide-react';
import { SectionHeader, ConceptGrid, Figure, Slider, StatPill, Caveat, type Concept } from './primitives';
import { mulberry32, gaussian, linregressPts, correlationPts, scaleLinear } from '@/utils/learningMath';

const CONCEPTS: Concept[] = [
    {
        term: 'Covariance & Correlation',
        plain: 'Covariance measures whether two assets move together; correlation is covariance rescaled to a clean −1…+1.',
        formula: 'ρ(a,b) = Cov(a,b) / (σ_a · σ_b)',
        why: 'Correlation is the raw material of diversification — low correlations are what make a portfolio safer than its parts.',
        sayIt: '"Correlation is covariance normalised so I can compare any two assets on the same −1 to +1 scale."',
    },
    {
        term: 'Beta',
        plain: 'How much an asset moves when the market moves 1%. The slope of asset returns regressed on market returns.',
        formula: 'β = Cov(r_a, r_m) / Var(r_m)',
        why: 'Splits risk into market-driven (beta) and stock-specific. β>1 amplifies the market; β<1 dampens it.',
        sayIt: '"Beta of 1.2 means I move about 1.2% when the market moves 1%."',
    },
    {
        term: 'CAPM',
        plain: 'The required return for an asset is the risk-free rate plus beta times the market’s risk premium.',
        formula: 'E[R] = r_f + β (E[R_m] − r_f)',
        why: 'The baseline "fair" return for risk taken. Beating it consistently is alpha; falling short is value destroyed.',
        sayIt: '"CAPM says you only get paid for market risk you can’t diversify away."',
    },
    {
        term: 'Systematic vs Idiosyncratic Risk',
        plain: 'Systematic risk is market-wide and undiversifiable (priced via beta). Idiosyncratic risk is stock-specific and diversifies away.',
        formula: 'total variance = β²·σ²_market + σ²_idiosyncratic',
        why: 'You are only compensated for systematic risk — holding undiversified idiosyncratic risk is uncompensated.',
        sayIt: '"The market pays me for systematic risk; the stock-specific part I’m supposed to diversify away for free."',
    },
    {
        term: 'R-squared',
        plain: 'The share of an asset’s movement explained by the market. 1 = moves entirely with the market; 0 = entirely idiosyncratic.',
        formula: 'R² = (explained variance) / (total variance)',
        why: 'A beta is only trustworthy if R² is high — otherwise the relationship is mostly noise.',
        sayIt: '"R-squared tells me how much of this stock is really just the market in disguise."',
    },
    {
        term: 'Correlation in a Crisis',
        plain: 'In a sell-off, correlations spike toward 1 — assets that looked independent all fall together.',
        formula: 'stressed ρ → 1 as the crisis deepens',
        why: 'Diversification fails exactly when you need it most. Backtested correlations understate crash risk.',
        sayIt: '"In a crisis everything correlates — the diversification you counted on evaporates."',
    },
];

function BetaRegression() {
    const [beta, setBeta] = useState(1.1);
    const [noise, setNoise] = useState(0.8);

    const view = useMemo(() => {
        const rng = mulberry32(11);
        const N = 90;
        const pts: [number, number][] = [];
        for (let i = 0; i < N; i++) {
            const m = gaussian(rng) * 1.4;
            const a = beta * m + noise * gaussian(rng);
            pts.push([m, a]);
        }
        const { slope, intercept, r2 } = linregressPts(pts);
        const W = 320;
        const H = 230;
        const P = 30;
        const sx = scaleLinear(-4, 4, P, W - P);
        const sy = scaleLinear(-5, 5, H - P, P);
        return { pts, slope, intercept, r2, sx, sy, W, H, line: { x1: sx(-4), y1: sy(slope * -4 + intercept), x2: sx(4), y2: sy(slope * 4 + intercept) } };
    }, [beta, noise]);

    return (
        <Figure
            title="Beta is a slope; R² is the tightness"
            accent="text-cyan-400"
            caption={<>Each dot is one period: market return (x) vs the asset (y). The fitted line’s slope is beta. Add idiosyncratic noise and the cloud fattens — beta barely changes, but R² (how market-driven it is) falls.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={view.sx(-4)} y1={view.sy(0)} x2={view.sx(4)} y2={view.sy(0)} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <line x1={view.sx(0)} y1={view.sy(-5)} x2={view.sx(0)} y2={view.sy(5)} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                {view.pts.map((p, i) => (
                    <circle key={i} cx={view.sx(p[0])} cy={view.sy(p[1])} r={2.2} className="fill-cyan-400/55" />
                ))}
                <line x1={view.line.x1} y1={view.line.y1} x2={view.line.x2} y2={view.line.y2} className="text-cyan-300" stroke="currentColor" strokeWidth={2} />
            </svg>
            <div className="grid grid-cols-3 gap-2 mt-1">
                <StatPill label="β (estimated)" value={view.slope.toFixed(2)} accent="text-cyan-400" />
                <StatPill label="R²" value={view.r2.toFixed(2)} />
                <StatPill label="ρ" value={Math.sqrt(Math.max(0, view.r2)).toFixed(2)} />
            </div>
            <div className="space-y-2 mt-3">
                <Slider label="True beta" min={-0.5} max={2} step={0.1} value={beta} onChange={setBeta} format={v => v.toFixed(1)} accent="accent-cyan-400" />
                <Slider label="Idiosyncratic noise" min={0} max={3} step={0.1} value={noise} onChange={setNoise} format={v => v.toFixed(1)} accent="accent-cyan-400" />
            </div>
        </Figure>
    );
}

function CorrelationScatter() {
    const [rho, setRho] = useState(0.6);

    const view = useMemo(() => {
        const rng = mulberry32(23);
        const pts: [number, number][] = [];
        for (let i = 0; i < 130; i++) {
            const x = gaussian(rng);
            const e = gaussian(rng);
            pts.push([x, rho * x + Math.sqrt(Math.max(0, 1 - rho * rho)) * e]);
        }
        const W = 320;
        const H = 230;
        const P = 26;
        const sx = scaleLinear(-3, 3, P, W - P);
        const sy = scaleLinear(-3, 3, H - P, P);
        return { pts, measured: correlationPts(pts), sx, sy, W, H };
    }, [rho]);

    return (
        <Figure
            title="Correlation — watch the cloud morph"
            accent="text-teal-400"
            caption={<>At ρ = +1 the dots collapse onto a line (one bet held twice). At 0 it’s a round cloud (independent). At −1 they hedge. Diversification only works when ρ is well below 1.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={view.sx(-3)} y1={view.sy(0)} x2={view.sx(3)} y2={view.sy(0)} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <line x1={view.sx(0)} y1={view.sy(-3)} x2={view.sx(0)} y2={view.sy(3)} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                {view.pts.map((p, i) => (
                    <circle key={i} cx={view.sx(p[0])} cy={view.sy(p[1])} r={2.2} className="fill-teal-400/55" />
                ))}
            </svg>
            <div className="grid grid-cols-2 gap-2 mt-1">
                <StatPill label="ρ (set)" value={rho.toFixed(2)} accent="text-teal-400" />
                <StatPill label="ρ (measured)" value={view.measured.toFixed(2)} />
            </div>
            <div className="mt-3">
                <Slider label="Correlation ρ" min={-1} max={1} step={0.05} value={rho} onChange={setRho} format={v => v.toFixed(2)} accent="accent-teal-400" />
            </div>
        </Figure>
    );
}

const CM_LABELS = ['TechA', 'TechB', 'Bank', 'Energy', 'Gold', 'Bond'];
const CM_BASE: number[][] = [
    [1, 0.8, 0.4, 0.3, -0.1, -0.2],
    [0.8, 1, 0.35, 0.25, -0.15, -0.2],
    [0.4, 0.35, 1, 0.5, 0.0, -0.1],
    [0.3, 0.25, 0.5, 1, 0.1, -0.05],
    [-0.1, -0.15, 0.0, 0.1, 1, 0.2],
    [-0.2, -0.2, -0.1, -0.05, 0.2, 1],
];

function corrColor(v: number): string {
    if (v >= 0) return `rgba(244,63,94,${(0.12 + 0.65 * v).toFixed(3)})`;
    return `rgba(45,212,191,${(0.12 + 0.65 * Math.abs(v)).toFixed(3)})`;
}

function CorrelationMatrix() {
    const [stress, setStress] = useState(0);

    const { matrix, avgOff } = useMemo(() => {
        const m = CM_BASE.map((row, i) => row.map((v, j) => (i === j ? 1 : v + stress * (1 - v))));
        let sum = 0;
        let count = 0;
        for (let i = 0; i < m.length; i++) {
            for (let j = i + 1; j < m.length; j++) {
                sum += m[i]?.[j] ?? 0;
                count++;
            }
        }
        return { matrix: m, avgOff: count ? sum / count : 0 };
    }, [stress]);

    return (
        <Figure
            title="Correlation matrix — and how crises collapse it"
            accent="text-rose-400"
            caption={<>A basket’s pairwise correlations. Warm = move together, cool = hedge. Drag "crisis stress" up and watch every pair march toward +1 — the diversification you see in calm markets disappears.</>}
        >
            <div className="overflow-x-auto">
                <table className="text-[10px] font-mono border-separate" style={{ borderSpacing: 2 }}>
                    <thead>
                        <tr>
                            <th />
                            {CM_LABELS.map(l => (
                                <th key={l} className="text-sentinel-500 font-normal px-1">{l}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.map((row, i) => (
                            <tr key={i}>
                                <td className="text-sentinel-500 pr-1 text-right">{CM_LABELS[i]}</td>
                                {row.map((v, j) => (
                                    <td key={j} className="text-center text-sentinel-100 rounded" style={{ backgroundColor: corrColor(v), width: 34, height: 26 }}>
                                        {v.toFixed(2)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
                <StatPill label="Avg pair correlation" value={avgOff.toFixed(2)} accent="text-rose-400" />
                <StatPill label="Crisis stress" value={`${(stress * 100).toFixed(0)}%`} />
            </div>
            <div className="mt-3">
                <Slider label="Crisis stress" min={0} max={1} step={0.05} value={stress} onChange={setStress} format={v => `${(v * 100).toFixed(0)}%`} accent="accent-rose-400" />
            </div>
        </Figure>
    );
}

interface SmlAsset { name: string; beta: number; ret: number; color: string }
const SML_ASSETS: SmlAsset[] = [
    { name: 'Utility', beta: 0.5, ret: 6, color: 'fill-blue-400' },
    { name: 'Index', beta: 1.0, ret: 9, color: 'fill-sentinel-300' },
    { name: 'Cyclical', beta: 1.4, ret: 15, color: 'fill-emerald-400' },
    { name: 'HighFlyer', beta: 1.8, ret: 13, color: 'fill-amber-400' },
];

function SecurityMarketLine() {
    const [rf, setRf] = useState(3);
    const [mrp, setMrp] = useState(6);

    const view = useMemo(() => {
        const W = 340;
        const H = 230;
        const P = 34;
        const sx = scaleLinear(0, 2, P, W - P);
        const sy = scaleLinear(0, 20, H - P, P);
        const assets = SML_ASSETS.map(a => ({ ...a, fair: rf + a.beta * mrp, alpha: a.ret - (rf + a.beta * mrp) }));
        return { W, H, P, sx, sy, assets, line: { x1: sx(0), y1: sy(rf), x2: sx(2), y2: sy(rf + 2 * mrp) } };
    }, [rf, mrp]);

    return (
        <Figure
            title="Security Market Line (CAPM)"
            accent="text-emerald-400"
            caption={<>The line is the return CAPM says each beta *deserves*. Dots above the line are cheap (positive alpha); dots below are expensive. Change the risk-free rate or risk premium and the whole fair-value line pivots.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={view.P} y1={view.H - view.P} x2={view.W - view.P} y2={view.H - view.P} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <line x1={view.P} y1={view.P} x2={view.P} y2={view.H - view.P} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <text x={view.W - view.P} y={view.H - view.P + 14} textAnchor="end" className="fill-sentinel-500 text-[9px]">β →</text>
                <text x={view.P - 6} y={view.P} textAnchor="end" className="fill-sentinel-500 text-[9px]">E[R]</text>
                <line x1={view.line.x1} y1={view.line.y1} x2={view.line.x2} y2={view.line.y2} className="text-emerald-300" stroke="currentColor" strokeWidth={1.5} />
                {view.assets.map(a => (
                    <g key={a.name}>
                        <circle cx={view.sx(a.beta)} cy={view.sy(a.ret)} r={5} className={a.color} />
                        <text x={view.sx(a.beta)} y={view.sy(a.ret) - 9} textAnchor="middle" className="fill-sentinel-200 text-[9px]">{a.name}</text>
                    </g>
                ))}
            </svg>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                {view.assets.map(a => (
                    <StatPill key={a.name} label={`${a.name} α`} value={`${a.alpha >= 0 ? '+' : ''}${a.alpha.toFixed(1)}%`} accent={a.alpha >= 0 ? 'text-emerald-400' : 'text-rose-400'} hint={`β ${a.beta}`} />
                ))}
            </div>
            <div className="space-y-2 mt-3">
                <Slider label="Risk-free rate" min={0} max={8} step={0.5} value={rf} onChange={setRf} format={v => `${v}%`} accent="accent-emerald-400" />
                <Slider label="Market risk premium" min={2} max={10} step={0.5} value={mrp} onChange={setMrp} format={v => `${v}%`} accent="accent-emerald-400" />
            </div>
        </Figure>
    );
}

export function ModuleMarket() {
    return (
        <div className="space-y-4">
            <SectionHeader icon={Network} title="Market Risk, Correlation & CAPM" accent="text-cyan-400" blurb="No asset lives alone. This module is about how things move together — beta to the market, correlation to each other, and the fair return CAPM demands for the risk." />
            <ConceptGrid concepts={CONCEPTS} accent="text-cyan-400" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <BetaRegression />
                <CorrelationScatter />
            </div>
            <Caveat>Beta and correlation are estimated from history and drift over time — especially in stress, when they jump toward 1. Treat them as regime-dependent estimates, never constants.</Caveat>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <CorrelationMatrix />
                <SecurityMarketLine />
            </div>
        </div>
    );
}
