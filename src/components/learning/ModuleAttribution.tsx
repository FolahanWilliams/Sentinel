/**
 * Module 7 — Performance Attribution.
 */
import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { SectionHeader, ConceptGrid, Figure, Slider, StatPill, type Concept } from './primitives';
import { scaleLinear } from '@/utils/learningMath';

const CONCEPTS: Concept[] = [
    {
        term: 'Time Windows',
        plain: 'Returns measured over standard calendar / trailing periods so performance is comparable.',
        formula: 'MTD: from 1st of month · QTD: from quarter start · YTD: from Jan 1 · 1Y: trailing 365d',
        why: 'Separates a hot month from a strong year, and recent form from the long-run track record.',
        sayIt: '"YTD is since Jan 1; 1Y is the trailing twelve months — always say which window."',
    },
    {
        term: 'Return Contribution',
        plain: 'How much each holding or sector added to the total return: its weight times its return.',
        formula: 'contribution_i = w_i × r_i   (Σ over a sector = sector contribution)',
        why: 'Tells you what actually carried the book — not merely that it went up.',
        sayIt: '"Contribution is weight times return; sum by sector to see what drove the number."',
    },
    {
        term: 'Active Return & Tracking Error',
        plain: 'Active return is portfolio minus benchmark; tracking error is the volatility of that difference.',
        formula: 'active = r_p − r_b      TE = σ(r_p − r_b)',
        why: 'Together they define the information ratio — the cleanest measure of active skill.',
        sayIt: '"Active return is the outperformance; tracking error is how bumpy the road to it was."',
    },
    {
        term: 'Brinson: Allocation vs Selection',
        plain: 'Splits out-performance into two skills: being in the right sectors (allocation) vs picking the right names within them (selection).',
        formula: 'alloc = (w_p − w_b)(r_b,sec − r_b,total)    select = w_b(r_p,sec − r_b,sec)',
        why: 'Tells you whether you add value as a top-down sector caller or a bottom-up stock picker — different skills, different teams.',
        sayIt: '"Allocation is right sectors; selection is right stocks within them — Brinson separates the two."',
    },
];

interface Sector { name: string; wb: number; wpFull: number; rb: number; rp: number; color: string }
const SECTORS: Sector[] = [
    { name: 'Tech', wb: 28, wpFull: 36, rb: 14, rp: 16, color: 'text-cyan-400' },
    { name: 'Financials', wb: 18, wpFull: 14, rb: 8, rp: 7, color: 'text-blue-400' },
    { name: 'Energy', wb: 8, wpFull: 4, rb: -3, rp: -2, color: 'text-amber-400' },
    { name: 'Health', wb: 16, wpFull: 18, rb: 6, rp: 8, color: 'text-emerald-400' },
    { name: 'Consumer', wb: 30, wpFull: 28, rb: 5, rp: 5, color: 'text-violet-400' },
];

function BrinsonAttribution() {
    const [tilt, setTilt] = useState(1);

    const view = useMemo(() => {
        const rbTotal = SECTORS.reduce((s, x) => s + (x.wb / 100) * x.rb, 0);
        const rows = SECTORS.map(s => {
            const wp = s.wb + tilt * (s.wpFull - s.wb);
            const allocation = ((wp - s.wb) / 100) * (s.rb - rbTotal);
            const selection = (s.wb / 100) * (s.rp - s.rb);
            return { name: s.name, allocation, selection };
        });
        const totalAlloc = rows.reduce((s, r) => s + r.allocation, 0);
        const totalSelect = rows.reduce((s, r) => s + r.selection, 0);
        const W = 340;
        const H = 220;
        const P = 26;
        const maxAbs = Math.max(0.4, ...rows.flatMap(r => [Math.abs(r.allocation), Math.abs(r.selection)]));
        const sy = scaleLinear(-maxAbs, maxAbs, H - P, P);
        const groupW = (W - 2 * P) / rows.length;
        const bw = groupW * 0.3;
        return { rows, totalAlloc, totalSelect, total: totalAlloc + totalSelect, W, H, P, y0: sy(0), sy, groupW, bw };
    }, [tilt]);

    return (
        <Figure
            title="Brinson attribution — allocation vs selection"
            accent="text-emerald-400"
            caption={<>For each sector: the blue bar is the allocation effect (your sector tilt), the violet bar is the selection effect (stock picking within it). Drag the tilt to dial your active sector bets up and down and watch allocation respond while selection holds.</>}
        >
            <svg viewBox={`0 0 ${view.W} ${view.H}`} className="w-full">
                <line x1={view.P} y1={view.y0} x2={view.W - view.P} y2={view.y0} className="text-sentinel-600" stroke="currentColor" strokeWidth={0.7} />
                {view.rows.map((r, i) => {
                    const cx = view.P + view.groupW * (i + 0.5);
                    const aY = view.sy(r.allocation);
                    const sY = view.sy(r.selection);
                    return (
                        <g key={r.name}>
                            <rect x={cx - view.bw - 2} y={Math.min(view.y0, aY)} width={view.bw} height={Math.abs(aY - view.y0)} rx={1} className="fill-blue-400/70" />
                            <rect x={cx + 2} y={Math.min(view.y0, sY)} width={view.bw} height={Math.abs(sY - view.y0)} rx={1} className="fill-violet-400/70" />
                            <text x={cx} y={view.H - 8} textAnchor="middle" className="fill-sentinel-500 text-[9px]">{r.name}</text>
                        </g>
                    );
                })}
            </svg>
            <div className="flex items-center gap-3 text-[11px] mt-1">
                <span className="flex items-center gap-1 text-sentinel-400"><span className="w-2.5 h-2.5 rounded-sm bg-blue-400/70 inline-block" /> Allocation</span>
                <span className="flex items-center gap-1 text-sentinel-400"><span className="w-2.5 h-2.5 rounded-sm bg-violet-400/70 inline-block" /> Selection</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
                <StatPill label="Allocation effect" value={`${view.totalAlloc >= 0 ? '+' : ''}${view.totalAlloc.toFixed(2)}%`} accent="text-blue-400" />
                <StatPill label="Selection effect" value={`${view.totalSelect >= 0 ? '+' : ''}${view.totalSelect.toFixed(2)}%`} accent="text-violet-400" />
                <StatPill label="Total active" value={`${view.total >= 0 ? '+' : ''}${view.total.toFixed(2)}%`} accent={view.total >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
            </div>
            <div className="mt-3">
                <Slider label="Active tilt strength" min={0} max={1.5} step={0.05} value={tilt} onChange={setTilt} format={v => `${(v * 100).toFixed(0)}%`} accent="accent-emerald-400" />
            </div>
        </Figure>
    );
}

export function ModuleAttribution() {
    return (
        <div className="space-y-4">
            <SectionHeader icon={BarChart3} title="Performance Attribution" accent="text-emerald-400" blurb="Not just what the return was — what drove it. Attribution decomposes performance into the decisions behind it: which windows, which holdings, sector bets vs stock picks." />
            <ConceptGrid concepts={CONCEPTS} accent="text-emerald-400" />
            <BrinsonAttribution />
        </div>
    );
}
