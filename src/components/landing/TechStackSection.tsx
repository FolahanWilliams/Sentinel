/**
 * TechStackSection — builder-cut detail for the /about showcase. Generic,
 * domain-agnostic framing of how the engine is put together.
 */

import { motion } from 'framer-motion';
import { Cpu, Database, Boxes, GitBranch } from 'lucide-react';
import { Section, Eyebrow, SectionTitle, Lead } from './SectionPrimitives';

const GROUPS = [
    {
        icon: Boxes,
        color: '#3b82f6',
        title: 'Frontend',
        items: ['React 19 + TypeScript', 'Tailwind CSS 4 · Vite 6', 'Zustand state', 'Framer Motion'],
    },
    {
        icon: Database,
        color: '#10b981',
        title: 'Backend',
        items: ['Supabase Postgres', 'Edge Functions', 'Realtime + Auth', 'Versioned migrations'],
    },
    {
        icon: Cpu,
        color: '#8b5cf6',
        title: 'Reasoning',
        items: ['5-agent pipeline', 'Self-critique pass', 'Isotonic calibration', 'Rate-limited model proxy'],
    },
    {
        icon: GitBranch,
        color: '#f59e0b',
        title: 'Discipline',
        items: ['Audit-trail schema', 'Calibration versioning', 'Typed, composable services', 'Drift-prevention lints'],
    },
];

export function TechStackSection() {
    return (
        <Section>
            <div className="max-w-3xl">
                <Eyebrow label="Under the hood" color="#22d3ee" />
                <SectionTitle className="mt-4 mb-5">Built like infrastructure, not a demo.</SectionTitle>
                <Lead>
                    Every layer is typed, versioned, and auditable — from the edge functions that
                    fan out to live data, through the model proxy, to the calibration engine that keeps
                    confidence honest as new outcomes land.
                </Lead>
            </div>

            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {GROUPS.map((group, i) => {
                    const Icon = group.icon;
                    return (
                        <motion.div
                            key={group.title}
                            initial={{ opacity: 0, y: 16 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-40px' }}
                            transition={{ duration: 0.4, delay: i * 0.08 }}
                            className="glass-panel rounded-2xl p-5"
                        >
                            <span
                                className="flex items-center justify-center w-10 h-10 rounded-xl mb-4"
                                style={{ background: `${group.color}1a`, color: group.color }}
                            >
                                <Icon className="w-5 h-5" />
                            </span>
                            <div className="text-sm font-bold text-sentinel-100 mb-3">{group.title}</div>
                            <ul className="space-y-2">
                                {group.items.map(item => (
                                    <li key={item} className="flex items-center gap-2 text-xs text-sentinel-400">
                                        <span className="w-1 h-1 rounded-full" style={{ background: group.color }} />
                                        {item}
                                    </li>
                                ))}
                            </ul>
                        </motion.div>
                    );
                })}
            </div>
        </Section>
    );
}
