/**
 * ProvingGroundSection — layer 2 of the narrative: why live markets are the
 * proof. Includes an animated outcome-window timeline (1D/5D/10D/30D).
 *
 * Deliberately carries NO performance numbers — the claim is the auditable
 * mechanism (out-of-sample, fixed windows), not a quoted track record.
 */

import { motion } from 'framer-motion';
import { Flag, FileText } from 'lucide-react';
import { Section, Eyebrow, SectionTitle, Lead } from './SectionPrimitives';
import { THREE_LAYER } from './landingContent';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const CHECKPOINTS = [
    { label: 'Fired', sub: 'logged' },
    { label: '1D', sub: 'scored' },
    { label: '5D', sub: 'scored' },
    { label: '10D', sub: 'scored' },
    { label: '30D', sub: 'post-mortem' },
];

export function ProvingGroundSection() {
    return (
        <Section>
            <div className="max-w-3xl">
                <Eyebrow label="The proof" color="#10b981" />
                <SectionTitle className="mt-4 mb-5">{THREE_LAYER.proof.title}</SectionTitle>
                <Lead>{THREE_LAYER.proof.body}</Lead>
            </div>

            <div className="mt-14 glass-panel rounded-2xl p-6 sm:p-10">
                <OutcomeTimeline />
            </div>

            <p className="mt-8 text-sm text-sentinel-500 max-w-2xl">
                A backtest can be tuned until it looks brilliant. A live, timestamped record graded at
                fixed windows cannot — which is exactly why it’s the one that counts.
            </p>
        </Section>
    );
}

function OutcomeTimeline() {
    const reducedMotion = useReducedMotion();
    const n = CHECKPOINTS.length;

    return (
        <div className="relative">
            {/* Track */}
            <div className="absolute left-0 right-0 top-6 h-px bg-sentinel-700/50" />
            {/* Animated fill */}
            <motion.div
                className="absolute left-0 top-6 h-px"
                style={{ background: 'linear-gradient(90deg,#10b981,#22d3ee)', boxShadow: '0 0 8px rgba(16,185,129,0.5)' }}
                initial={reducedMotion ? { width: '100%' } : { width: 0 }}
                whileInView={reducedMotion ? undefined : { width: '100%' }}
                viewport={{ once: true }}
                transition={{ duration: 2, ease: 'easeInOut' }}
            />

            <div className="relative flex justify-between">
                {CHECKPOINTS.map((cp, i) => {
                    const isFirst = i === 0;
                    const isLast = i === n - 1;
                    return (
                        <motion.div
                            key={cp.label}
                            className="flex flex-col items-center text-center"
                            initial={reducedMotion ? undefined : { opacity: 0, scale: 0.6 }}
                            whileInView={reducedMotion ? undefined : { opacity: 1, scale: 1 }}
                            viewport={{ once: true }}
                            transition={{ delay: (i / (n - 1)) * 1.8, duration: 0.4 }}
                        >
                            <span
                                className="flex items-center justify-center w-12 h-12 rounded-full"
                                style={{
                                    background: isFirst ? 'rgba(16,185,129,0.15)' : isLast ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.04)',
                                    border: `1px solid ${isFirst ? '#10b981' : isLast ? '#22d3ee' : 'rgba(255,255,255,0.12)'}`,
                                }}
                            >
                                {isFirst ? (
                                    <Flag className="w-4 h-4 text-emerald-400" />
                                ) : isLast ? (
                                    <FileText className="w-4 h-4 text-cyan-400" />
                                ) : (
                                    <span className="text-xs font-mono font-bold text-sentinel-300">{cp.label}</span>
                                )}
                            </span>
                            <span className="mt-3 text-sm font-semibold text-sentinel-100">{cp.label}</span>
                            <span className="text-[11px] font-mono text-sentinel-500">{cp.sub}</span>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
