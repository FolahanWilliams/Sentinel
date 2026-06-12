/**
 * CalibrationCurve — a reliability diagram that self-draws on scroll.
 *
 * Shows stated confidence (x) against actual win rate (y):
 *  - raw model curve bows BELOW the diagonal (overconfident)
 *  - the isotonic-calibrated curve hugs the diagonal (a stated 70% wins ~70%)
 * A worked marker shows a raw 74% being pulled down to a measured 61%, matching
 * the confidence_raw → confidence_calibrated pair in the audit-trail sample.
 *
 * Pure SVG + framer-motion pathLength — no chart dependency on the landing bundle.
 */

import { motion } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const W = 340;
const H = 250;
const PAD = { l: 46, r: 16, t: 16, b: 38 };
const X0 = PAD.l;
const X1 = W - PAD.r;
const Y0 = PAD.t;
const Y1 = H - PAD.b;

const px = (c: number) => X0 + c * (X1 - X0);
const py = (r: number) => Y1 - r * (Y1 - Y0);

type Pt = [number, number];

const RAW: Pt[] = [[0.08, 0.05], [0.3, 0.18], [0.5, 0.35], [0.74, 0.61], [0.9, 0.79], [1, 0.9]];
const CAL: Pt[] = [[0.08, 0.09], [0.3, 0.31], [0.5, 0.49], [0.74, 0.73], [0.9, 0.9], [1, 0.99]];
const OBSERVED: Pt[] = [[0.3, 0.18], [0.5, 0.35], [0.74, 0.61], [0.9, 0.79]];

/** Catmull-Rom → cubic bezier smoothing for a premium curve. */
function smoothPath(points: Pt[]): string {
    const p: Pt[] = points.map(([x, y]) => [px(x), py(y)]);
    const first = p[0];
    if (!first) return '';
    let d = `M ${first[0].toFixed(1)} ${first[1].toFixed(1)}`;
    for (let i = 0; i < p.length - 1; i++) {
        const p1 = p[i];
        const p2 = p[i + 1];
        if (!p1 || !p2) continue;
        const p0 = p[i - 1] ?? p1;
        const p3 = p[i + 2] ?? p2;
        const c1x = p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
}

export function CalibrationCurve() {
    const reducedMotion = useReducedMotion();
    const drawProps = reducedMotion
        ? {}
        : {
              initial: { pathLength: 0 as const },
              whileInView: { pathLength: 1 as const },
              viewport: { once: true, margin: '-40px' },
          };

    const markerX = px(0.74);
    const markerY = py(0.61);

    return (
        <div className="w-full">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Confidence calibration reliability diagram">
                {/* Grid */}
                {[0.25, 0.5, 0.75].map(g => (
                    <line key={`h${g}`} x1={X0} x2={X1} y1={py(g)} y2={py(g)} stroke="rgba(255,255,255,0.04)" />
                ))}
                {[0.25, 0.5, 0.75].map(g => (
                    <line key={`v${g}`} x1={px(g)} x2={px(g)} y1={Y0} y2={Y1} stroke="rgba(255,255,255,0.04)" />
                ))}

                {/* Axes */}
                <line x1={X0} x2={X1} y1={Y1} y2={Y1} stroke="rgba(255,255,255,0.18)" />
                <line x1={X0} x2={X0} y1={Y0} y2={Y1} stroke="rgba(255,255,255,0.18)" />

                {/* Perfect-calibration reference */}
                <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="#64748b" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />

                {/* Raw (overconfident) */}
                <motion.path
                    d={smoothPath(RAW)}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    transition={{ duration: 1.4, ease: 'easeInOut' }}
                    {...drawProps}
                />
                {/* Calibrated */}
                <motion.path
                    d={smoothPath(CAL)}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    transition={{ duration: 1.4, ease: 'easeInOut', delay: 0.25 }}
                    {...drawProps}
                />

                {/* Observed buckets on the raw curve */}
                {OBSERVED.map(([x, y], i) => (
                    <motion.circle
                        key={i}
                        cx={px(x)}
                        cy={py(y)}
                        r={3.5}
                        fill="#f59e0b"
                        stroke="#0b0c10"
                        strokeWidth={1.5}
                        initial={reducedMotion ? undefined : { scale: 0, opacity: 0 }}
                        whileInView={reducedMotion ? undefined : { scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.9 + i * 0.12, duration: 0.4 }}
                    />
                ))}

                {/* Worked marker: stated 74% → measured 61% */}
                <motion.g
                    initial={reducedMotion ? undefined : { opacity: 0 }}
                    whileInView={reducedMotion ? undefined : { opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.5, duration: 0.5 }}
                >
                    <line x1={markerX} y1={Y1} x2={markerX} y2={markerY} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
                    <line x1={X0} y1={markerY} x2={markerX} y2={markerY} stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 3" />
                    <circle cx={markerX} cy={markerY} r={4.5} fill="#fff" stroke="#22d3ee" strokeWidth={2} />
                    <text x={markerX} y={Y1 + 14} textAnchor="middle" fontSize={9} fill="#cbd5e1" className="font-mono">74%</text>
                    <text x={X0 - 6} y={markerY + 3} textAnchor="end" fontSize={9} fill="#cbd5e1" className="font-mono">61%</text>
                </motion.g>

                {/* Axis labels */}
                <text x={(X0 + X1) / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="#64748b">Stated confidence</text>
                <text x={12} y={(Y0 + Y1) / 2} textAnchor="middle" fontSize={9} fill="#64748b" transform={`rotate(-90 12 ${(Y0 + Y1) / 2})`}>Actual win rate</text>
            </svg>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-3 text-[11px]">
                <LegendItem color="#f59e0b" label="Raw model — overconfident" />
                <LegendItem color="#22d3ee" label="Isotonic-calibrated" />
                <LegendItem color="#64748b" label="Perfect calibration" dashed />
            </div>
        </div>
    );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
    return (
        <span className="inline-flex items-center gap-2 text-sentinel-400">
            <span
                className="inline-block w-5 h-0"
                style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }}
            />
            {label}
        </span>
    );
}
