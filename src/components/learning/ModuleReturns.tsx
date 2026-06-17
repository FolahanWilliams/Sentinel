/**
 * Module 1 — Returns & Compounding.
 */
import { useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { SectionHeader, ConceptGrid, Figure, Slider, StatPill, type Concept } from './primitives';
import { scaleLinear, linspace, linePath } from '@/utils/learningMath';

const CONCEPTS: Concept[] = [
    {
        term: 'AUM (Assets Under Management)',
        plain: 'The total market value of everything in the book right now.',
        formula: 'AUM = Σ (price_i × shares_i)   — all in one base currency',
        why: 'It is the denominator for almost every weight and return figure on a dashboard.',
        sayIt: '"AUM is just the current value of all holdings, converted to one currency."',
    },
    {
        term: 'Simple vs Log Returns',
        plain: 'Simple return is the percentage change. Log return is ln(1 + simple) — it adds up cleanly across time and is symmetric.',
        formula: 'simple r = P_t / P_{t-1} − 1      log r = ln(P_t / P_{t-1})',
        why: 'Log returns are additive over time (sum them); simple returns compound (multiply 1+r). Quants model log returns.',
        sayIt: '"Simple returns multiply, log returns add — that is why models use logs."',
    },
    {
        term: 'Arithmetic vs Geometric Mean',
        plain: 'Arithmetic is the simple average; geometric is the compounded average actually realised. Geometric ≤ arithmetic, and the gap grows with volatility.',
        formula: 'geo = (Π (1 + r_t))^(1/n) − 1',
        why: '+50% then −50% averages 0% arithmetically but loses 25% geometrically. Geometric is the truth.',
        sayIt: '"Geometric mean is what you actually compounded at — always use it for multi-period returns."',
    },
    {
        term: 'Time-weighted vs Money-weighted',
        plain: 'TWR strips out the timing of deposits/withdrawals (judges the strategy); MWR / IRR reflects when cash went in (judges the investor’s experience).',
        formula: 'TWR = Π (1 + r_subperiod) − 1',
        why: 'Funds report time-weighted so performance is not flattered or punished by client cash flows.',
        sayIt: '"Time-weighted judges the manager; money-weighted judges the investor’s outcome."',
    },
    {
        term: 'Annualising',
        plain: 'Scaling a return or risk figure to a yearly basis so periods are comparable.',
        formula: 'return: (1 + r_period)^(periods/yr) − 1     risk: σ × √(periods/yr)',
        why: 'Returns scale with time, volatility scales with the square root of time — a crucial asymmetry.',
        sayIt: '"Returns annualise by compounding; volatility by √time."',
    },
    {
        term: 'Benchmark / Active Return',
        plain: 'Your return minus the benchmark’s return over the same window.',
        formula: 'active return = r_portfolio − r_benchmark',
        why: 'Beating the benchmark (positive active return / alpha) is the entire point of active management.',
        sayIt: '"Active return is how much I beat the index by — that is what active management is paid for."',
    },
];

function CompoundingCurve() {
    const [rate, setRate] = useState(8);
    const [years, setYears] = useState(30);

    const { compPts, simplePts, compFinal, simpleFinal } = useMemo(() => {
        const r = rate / 100;
        const W = 340;
        const H = 220;
        const P = 34;
        const maxY = Math.max(2, (1 + r) ** years);
        const sx = scaleLinear(0, years, P, W - P);
        const sy = scaleLinear(0, maxY, H - P, P);
        const ts = linspace(0, years, 60);
        const comp: [number, number][] = ts.map(t => [sx(t), sy((1 + r) ** t)]);
        const simple: [number, number][] = ts.map(t => [sx(t), sy(1 + r * t)]);
        return {
            compPts: comp,
            simplePts: simple,
            compFinal: (1 + r) ** years,
            simpleFinal: 1 + r * years,
        };
    }, [rate, years]);

    return (
        <Figure
            title="The compounding gap"
            accent="text-blue-400"
            caption={<>Simple growth (dashed) is a straight line. Compounding (solid) curves upward because each year earns on the prior year’s gains. The gap is exponential — it is why time in the market dominates.</>}
        >
            <svg viewBox="0 0 340 220" className="w-full">
                <line x1={34} y1={186} x2={306} y2={186} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <line x1={34} y1={34} x2={34} y2={186} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <path d={linePath(simplePts)} fill="none" className="text-sentinel-500" stroke="currentColor" strokeWidth={1.5} strokeDasharray="4 3" />
                <path d={linePath(compPts)} fill="none" className="text-blue-400" stroke="currentColor" strokeWidth={2} />
            </svg>
            <div className="grid grid-cols-2 gap-2 mt-1">
                <StatPill label="Compounded" value={`${compFinal.toFixed(1)}×`} accent="text-blue-400" hint={`${years}y @ ${rate}%`} />
                <StatPill label="Simple (no compounding)" value={`${simpleFinal.toFixed(1)}×`} />
            </div>
            <div className="space-y-2 mt-3">
                <Slider label="Annual return" min={1} max={20} step={0.5} value={rate} onChange={setRate} format={v => `${v}%`} />
                <Slider label="Years" min={1} max={40} step={1} value={years} onChange={setYears} format={v => `${v}y`} />
            </div>
        </Figure>
    );
}

export function ModuleReturns() {
    return (
        <div className="space-y-4">
            <SectionHeader icon={Wallet} title="Returns & Compounding" accent="text-blue-400" blurb="The headline numbers a client sees first — what it is worth, how it has grown, and how that compares to the benchmark." />
            <ConceptGrid concepts={CONCEPTS} accent="text-blue-400" />
            <CompoundingCurve />
        </div>
    );
}
