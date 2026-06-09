/**
 * ApplicationSection — the three-layer narrative as three stacked strata.
 * Layer 3 stays deliberately generic: the engine is domain-agnostic, trading is
 * simply where it is proven in public.
 */

import { motion } from 'framer-motion';
import { Brain, Activity, Layers } from 'lucide-react';
import { Section, Eyebrow, SectionTitle } from './SectionPrimitives';
import { THREE_LAYER } from './landingContent';

const LAYERS = [
    { ...THREE_LAYER.problem, icon: Brain, color: '#8b5cf6', tag: 'Universal' },
    { ...THREE_LAYER.proof, icon: Activity, color: '#10b981', tag: 'Proven here' },
    { ...THREE_LAYER.application, icon: Layers, color: '#3b82f6', tag: 'Generalizes' },
];

export function ApplicationSection() {
    return (
        <Section>
            <div className="max-w-3xl mb-12">
                <Eyebrow label="Why it matters" color="#3b82f6" />
                <SectionTitle className="mt-4">A reasoning audit you can take anywhere.</SectionTitle>
            </div>

            <div className="space-y-4">
                {LAYERS.map((layer, i) => {
                    const Icon = layer.icon;
                    return (
                        <motion.div
                            key={layer.title}
                            initial={{ opacity: 0, y: 18 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-50px' }}
                            transition={{ duration: 0.5, delay: i * 0.1 }}
                            className="glass-panel rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row gap-5 sm:items-center"
                            style={{ borderLeft: `3px solid ${layer.color}` }}
                        >
                            <div className="flex items-center gap-4 sm:w-64 shrink-0">
                                <span
                                    className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0"
                                    style={{ background: `${layer.color}1a`, color: layer.color }}
                                >
                                    <Icon className="w-5 h-5" />
                                </span>
                                <div>
                                    <div className="text-[10px] font-mono uppercase tracking-wider" style={{ color: layer.color }}>
                                        {layer.tag}
                                    </div>
                                    <div className="text-base font-bold font-display text-sentinel-50">{layer.title}</div>
                                </div>
                            </div>
                            <p className="text-sm text-sentinel-400 leading-relaxed flex-1">{layer.body}</p>
                        </motion.div>
                    );
                })}
            </div>
        </Section>
    );
}
