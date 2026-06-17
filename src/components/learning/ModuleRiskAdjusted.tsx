/**
 * Module 3 — Risk-Adjusted Performance.
 */
import { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { SectionHeader, ConceptGrid, Figure, Slider, StatPill, type Concept } from './primitives';
import { scaleLinear } from '@/utils/learningMath';

const CONCEPTS: Concept[] = [
    {
        term: 'Sharpe Ratio',
        plain: 'Excess return earned per unit of total risk. The default scorecard for risk-adjusted performance.',
        formula: 'Sharpe = (r_p − r_f) / σ_p',
        why: 'Lets you compare a calm 8%/yr strategy with a wild 20%/yr one on a level field. Higher is better.',
        sayIt: '"Sharpe is excess return over volatility — reward per unit of risk."',
    },
    {
        term: 'Sortino Ratio',
        plain: 'Like Sharpe, but divides by downside deviation instead of total volatility.',
        formula: 'Sortino = (r_p − r_f) / downside deviation',
        why: 'Doesn’t punish a strategy for big *upside* swings — only for the volatility that actually loses money.',
        sayIt: '"Sortino is Sharpe that only counts the bad volatility."',
    },
    {
        term: 'Information Ratio',
        plain: 'Active return per unit of tracking error (how consistently you beat the benchmark).',
        formula: 'IR = (r_p − r_b) / σ(r_p − r_b)',
        why: 'The headline measure of *active management skill* — high IR means reliable, repeatable outperformance.',
        sayIt: '"Information ratio is how much alpha I make per unit of benchmark-relative risk."',
    },
    {
        term: 'Treynor Ratio',
        plain: 'Excess return per unit of *market* risk (beta) rather than total risk.',
        formula: 'Treynor = (r_p − r_f) / β',
        why: 'Right measure when the portfolio is one slice of a diversified book — only market risk is left unpriced.',
        sayIt: '"Treynor rewards return per unit of market risk, ignoring diversifiable risk."',
    },
    {
        term: 'Jensen’s Alpha',
        plain: 'Return above what CAPM says you should earn for the risk (beta) you took.',
        formula: 'α = r_p − [ r_f + β (r_m − r_f) ]',
        why: 'Positive alpha is genuine skill — return the market didn’t hand you for free via beta.',
        sayIt: '"Alpha is the return left over after I account for the risk I took."',
    },
    {
        term: 'Calmar Ratio',
        plain: 'Annual return divided by the max drawdown over the period.',
        formula: 'Calmar = annualised return / |max drawdown|',
        why: 'Frames performance against the worst pain endured — favoured by anyone who fears blow-ups.',
        sayIt: '"Calmar is return per unit of worst-case drawdown."',
    },
];

interface Strat { name: string; vol: number; ret: number; color: string }
const STRATS: Strat[] = [
    { name: 'A', vol: 8, ret: 6, color: 'fill-blue-400' },
    { name: 'B', vol: 15, ret: 12, color: 'fill-violet-400' },
    { name: 'C', vol: 22, ret: 19, color: 'fill-emerald-400' },
    { name: 'D', vol: 12, ret: 7, color: 'fill-amber-400' },
];

function SharpeScatter() {
    const [rf, setRf] = useState(3);

    const view = useMemo(() => {
        const W = 340;
        const H = 240;
        const P = 34;
        const sx = scaleLinear(0, 26, P, W - P);
        const sy = scaleLinear(0, 24, H - P, P);
        const withSharpe = STRATS.map(s => ({ ...s, sharpe: (s.ret - rf) / s.vol }));
        const best = withSharpe.reduce((a, b) => (b.sharpe > a.sharpe ? b : a), withSharpe[0] ?? { ...STRATS[0]!, sharpe: 0 });
        // Capital Allocation Line: from (0, rf) through the best-Sharpe point, extended.
        const calX = 26;
        const calY = rf + best.sharpe * calX;
        return { W, H, P, sx, sy, withSharpe, best, cal: { x1: sx(0), y1: sy(rf), x2: sx(calX), y2: sy(Math.min(24, calY)) } };
    }, [rf]);

    return (
        <Figure
            title="Risk vs return — and the line that ranks them"
            accent="text-violet-400"
            caption={<>Each dot is a strategy. The line is the Capital Allocation Line from the risk-free rate through the *best Sharpe* strategy — its steepness is the best reward-per-risk available. Move the risk-free rate and watch the winner change.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={view.P} y1={view.H - view.P} x2={view.W - view.P} y2={view.H - view.P} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <line x1={view.P} y1={view.P} x2={view.P} y2={view.H - view.P} className="text-sentinel-700" stroke="currentColor" strokeWidth={0.5} />
                <text x={view.W - view.P} y={view.H - view.P + 14} textAnchor="end" className="fill-sentinel-500 text-[9px]">risk (σ) →</text>
                <text x={view.P - 6} y={view.P} textAnchor="end" className="fill-sentinel-500 text-[9px]">return</text>
                {/* risk-free marker */}
                <circle cx={view.sx(0)} cy={view.sy(rf)} r={3} className="fill-sentinel-400" />
                <line x1={view.cal.x1} y1={view.cal.y1} x2={view.cal.x2} y2={view.cal.y2} className="text-violet-400" stroke="currentColor" strokeWidth={1.5} strokeDasharray="5 3" />
                {view.withSharpe.map(s => {
                    const isBest = s.name === view.best.name;
                    return (
                        <g key={s.name}>
                            <circle cx={view.sx(s.vol)} cy={view.sy(s.ret)} r={isBest ? 7 : 5} className={`${s.color} ${isBest ? '' : 'opacity-70'}`} />
                            <text x={view.sx(s.vol)} y={view.sy(s.ret) - 9} textAnchor="middle" className="fill-sentinel-200 text-[10px] font-mono">{s.name}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-1">
                {view.withSharpe.map(s => (
                    <StatPill key={s.name} label={`Strategy ${s.name}`} value={s.sharpe.toFixed(2)} accent={s.name === view.best.name ? 'text-violet-300' : 'text-sentinel-200'} hint={`${s.ret}% @ ${s.vol}σ`} />
                ))}
            </div>
            <div className="mt-3">
                <Slider label="Risk-free rate" min={0} max={10} step={0.5} value={rf} onChange={setRf} format={v => `${v}%`} accent="accent-violet-400" />
            </div>
        </Figure>
    );
}

export function ModuleRiskAdjusted() {
    return (
        <div className="space-y-4">
            <SectionHeader icon={Gauge} title="Risk-Adjusted Performance" accent="text-violet-400" blurb="Raw return is meaningless without the risk taken to earn it. These ratios all answer one question: how much reward per unit of which risk?" />
            <ConceptGrid concepts={CONCEPTS} accent="text-violet-400" />
            <SharpeScatter />
        </div>
    );
}
