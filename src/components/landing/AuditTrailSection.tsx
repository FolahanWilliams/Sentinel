/**
 * AuditTrailSection — the moat: every signal persists its full reasoning,
 * bias flags, scores, and outcomes. The record is the product.
 */

import { motion } from 'framer-motion';
import { Section, Eyebrow, SectionTitle, Lead } from './SectionPrimitives';
import { AuditTrailViz } from './AuditTrailViz';

const BULLETS = [
    'Full agent reasoning — stored verbatim, never truncated for storage.',
    'Every bias flag with severity and the passage it came from.',
    'Raw vs calibrated confidence, stamped with the calibration version that produced it.',
    'Projected risk/reward against the realized result.',
    'Post-mortem narratives at 1D, 5D, 10D, and 30D.',
];

export function AuditTrailSection() {
    return (
        <Section id="audit">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                <div>
                    <Eyebrow label="The moat" color="#f59e0b" />
                    <SectionTitle className="mt-4 mb-5">Nothing is thrown away.</SectionTitle>
                    <Lead className="mb-6">
                        Most systems show you a verdict. Sentinel keeps the whole reasoning trail — so
                        any call can be re-opened, audited, and graded long after it fired. The audit
                        trail is the product; the signal is just its first line.
                    </Lead>
                    <ul className="space-y-3">
                        {BULLETS.map((b, i) => (
                            <motion.li
                                key={b}
                                initial={{ opacity: 0, x: -8 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: '-40px' }}
                                transition={{ duration: 0.4, delay: i * 0.07 }}
                                className="flex items-start gap-3 text-sm text-sentinel-300"
                            >
                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                                {b}
                            </motion.li>
                        ))}
                    </ul>
                </div>

                <AuditTrailViz />
            </div>
        </Section>
    );
}
