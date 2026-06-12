/**
 * PrinciplesSection — the depth centerpiece. Maps fundamental decision-science
 * principles to the concrete mechanism in the codebase that operationalizes each.
 * Every mechanism listed is real and verifiable from src/services.
 */

import { motion } from 'framer-motion';
import {
    Brain, Waves, Skull, History, Users, Combine, Radar, ShieldAlert, Target,
    type LucideIcon,
} from 'lucide-react';
import { Section, Eyebrow, SectionTitle, Lead } from './SectionPrimitives';
import { PRINCIPLES } from './landingContent';

const ICONS: Record<string, LucideIcon> = {
    brain: Brain,
    waves: Waves,
    skull: Skull,
    history: History,
    users: Users,
    combine: Combine,
    radar: Radar,
    shield: ShieldAlert,
    target: Target,
};

export function PrinciplesSection() {
    return (
        <Section id="principles">
            <div className="max-w-3xl">
                <Eyebrow label="Principles, operationalized" color="#22d3ee" />
                <SectionTitle className="mt-4 mb-5">Decision science, compiled into code.</SectionTitle>
                <Lead>
                    Sentinel isn’t a model with a prompt. It’s a stack of well-studied principles for
                    reasoning under uncertainty — each turned into a concrete mechanism that runs on
                    every signal and leaves a trace in the audit trail.
                </Lead>
            </div>

            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {PRINCIPLES.map((p, i) => {
                    const Icon = ICONS[p.icon] ?? Brain;
                    return (
                        <motion.div
                            key={p.principle}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-40px' }}
                            transition={{ duration: 0.4, delay: (i % 3) * 0.08 }}
                            className="glass-panel rounded-2xl p-5 flex flex-col"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <span
                                    className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                                    style={{ background: `${p.color}1a`, color: p.color }}
                                >
                                    <Icon className="w-5 h-5" />
                                </span>
                                <div>
                                    <div className="text-sm font-bold text-sentinel-50 leading-tight">{p.principle}</div>
                                    <div className="text-[11px] font-mono text-sentinel-500">{p.lineage}</div>
                                </div>
                            </div>
                            <p className="text-sm text-sentinel-400 leading-relaxed flex-1">{p.mechanism}</p>
                            <div
                                className="mt-4 pt-3 text-[12px] text-sentinel-300 flex items-start gap-2"
                                style={{ borderTop: `1px solid ${p.color}33` }}
                            >
                                <span className="font-mono shrink-0" style={{ color: p.color }}>→</span>
                                {p.output}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </Section>
    );
}
