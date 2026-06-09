/**
 * ProblemSection — layer 1 of the narrative: the universal problem of cognitive
 * failure under uncertainty, with a drifting marquee of bias names.
 */

import { motion } from 'framer-motion';
import { Section, Eyebrow, SectionTitle, Lead } from './SectionPrimitives';
import { BIAS_SAMPLES, THREE_LAYER } from './landingContent';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export function ProblemSection() {
    return (
        <Section bordered={false} className="pt-8 sm:pt-12">
            <div className="max-w-3xl">
                <Eyebrow label="The problem" color="#8b5cf6" />
                <SectionTitle className="mt-4 mb-5">{THREE_LAYER.problem.title}</SectionTitle>
                <Lead>{THREE_LAYER.problem.body}</Lead>
            </div>

            <div className="mt-12 space-y-3">
                <BiasMarquee items={BIAS_SAMPLES} />
                <BiasMarquee items={[...BIAS_SAMPLES].reverse()} reverse />
            </div>

            <p className="mt-10 text-sm text-sentinel-500 max-w-2xl">
                Sentinel’s premise: if a decision process is going to be trusted, every step of its
                reasoning should be inspectable — and every outcome should be scored against what
                actually happened.
            </p>
        </Section>
    );
}

function BiasMarquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
    const reducedMotion = useReducedMotion();
    const doubled = [...items, ...items];

    if (reducedMotion) {
        return (
            <div className="flex flex-wrap gap-2.5 opacity-70">
                {items.map(b => (
                    <BiasChip key={b} label={b} />
                ))}
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
            <motion.div
                className="flex gap-2.5 w-max"
                animate={{ x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }}
                transition={{ duration: 34, ease: 'linear', repeat: Infinity }}
            >
                {doubled.map((b, i) => (
                    <BiasChip key={`${b}-${i}`} label={b} />
                ))}
            </motion.div>
        </div>
    );
}

function BiasChip({ label }: { label: string }) {
    return (
        <span className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm text-sentinel-300 bg-white/[0.03] ring-1 ring-white/[0.06] capitalize">
            {label}
        </span>
    );
}
