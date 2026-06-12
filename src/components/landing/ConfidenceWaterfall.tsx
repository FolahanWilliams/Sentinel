/**
 * ConfidenceWaterfall — a confidence ledger. A raw model score is composed into
 * a calibrated one, each principle applying a signed adjustment (green = earned,
 * red = burned), before calibration grounds the number in observed win rate.
 *
 * Vertical layout so it stays readable on mobile. Reduced-motion safe.
 */

import { motion } from 'framer-motion';
import { CONFIDENCE_LEDGER, LEDGER_START, LEDGER_FINAL } from './landingContent';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const PX_PER_UNIT = 4;

interface Row {
    label: string;
    sub: string;
    delta: number;
    running: number;
}

function buildRows(): Row[] {
    let running = LEDGER_START;
    return CONFIDENCE_LEDGER.map(step => {
        running += step.delta;
        return { label: step.label, sub: step.principle, delta: step.delta, running };
    });
}

export function ConfidenceWaterfall() {
    const reducedMotion = useReducedMotion();
    const rows = buildRows();
    const preCalibration = rows.length ? rows[rows.length - 1]!.running : LEDGER_START;

    return (
        <div className="glass-panel rounded-2xl p-5 sm:p-7">
            {/* Raw */}
            <LedgerHeader label="Raw model confidence" value={LEDGER_START} tone="#64748b" />

            <div className="mt-4 space-y-2.5">
                {rows.map((row, i) => (
                    <motion.div
                        key={row.label}
                        initial={reducedMotion ? undefined : { opacity: 0, y: 8 }}
                        whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-30px' }}
                        transition={{ duration: 0.35, delay: i * 0.1 }}
                        className="grid grid-cols-[1fr_auto] items-center gap-3"
                    >
                        <div className="min-w-0">
                            <div className="text-sm text-sentinel-200 truncate">{row.label}</div>
                            <div className="text-[11px] text-sentinel-500 truncate">{row.sub}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <DeltaBar delta={row.delta} reducedMotion={reducedMotion} />
                            <span className="w-9 text-right font-mono text-sm text-sentinel-300">{row.running}</span>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Calibration remap */}
            <motion.div
                initial={reducedMotion ? undefined : { opacity: 0 }}
                whileInView={reducedMotion ? undefined : { opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: rows.length * 0.1 + 0.1, duration: 0.4 }}
                className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between"
            >
                <div>
                    <div className="text-sm font-semibold text-sentinel-100">Calibration remap</div>
                    <div className="text-[11px] text-sentinel-500">{preCalibration} → observed win rate</div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-sentinel-500 line-through">{preCalibration}</span>
                    <span className="text-sentinel-600">→</span>
                    <span className="px-2.5 py-1 rounded-lg font-mono text-base font-bold bg-purple-500/15 text-purple-300 ring-1 ring-purple-500/30">
                        {LEDGER_FINAL}
                    </span>
                </div>
            </motion.div>
        </div>
    );
}

function LedgerHeader({ label, value, tone }: { label: string; value: number; tone: string }) {
    return (
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <span className="text-sm text-sentinel-400">{label}</span>
            <span className="font-mono text-base font-bold" style={{ color: tone }}>{value}</span>
        </div>
    );
}

function DeltaBar({ delta, reducedMotion }: { delta: number; reducedMotion: boolean }) {
    const positive = delta > 0;
    const color = positive ? '#10b981' : '#ef4444';
    const width = Math.abs(delta) * PX_PER_UNIT;
    const bar = (
        <motion.div
            className="h-2"
            style={{
                width,
                background: color,
                borderRadius: positive ? '0 9999px 9999px 0' : '9999px 0 0 9999px',
                transformOrigin: positive ? 'left' : 'right',
            }}
            initial={reducedMotion ? undefined : { scaleX: 0 }}
            whileInView={reducedMotion ? undefined : { scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
        />
    );
    const tag = (
        <span className="text-[10px] font-mono shrink-0" style={{ color }}>
            {positive ? `+${delta}` : delta}
        </span>
    );

    return (
        <div className="flex items-center w-[132px]">
            <div className="flex-1 flex justify-end items-center gap-1.5">
                {!positive && tag}
                {!positive && bar}
            </div>
            <div className="w-px h-4 bg-sentinel-700 shrink-0" />
            <div className="flex-1 flex justify-start items-center gap-1.5">
                {positive && bar}
                {positive && tag}
            </div>
        </div>
    );
}
