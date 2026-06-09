/**
 * PipelineSection — the 5-agent pipeline, fronted by the animated PipelineFlow,
 * with the two post-pipeline passes (self-critique, calibration) below.
 */

import { motion } from 'framer-motion';
import { Section, Eyebrow, SectionTitle, Lead } from './SectionPrimitives';
import { PipelineFlow } from './PipelineFlow';
import { POST_PIPELINE_STAGES, PIPELINE_AGENTS } from './landingContent';

export function PipelineSection({ detailed = false }: { detailed?: boolean }) {
    return (
        <Section id="pipeline">
            <div className="max-w-3xl">
                <Eyebrow label="The reasoning pipeline" color="#8b5cf6" />
                <SectionTitle className="mt-4 mb-5">Five agents. One adversarial gauntlet.</SectionTitle>
                <Lead>
                    Each signal flows through five specialized agents in sequence. The order is
                    load-bearing — the thesis is built up, then deliberately attacked. Red Team has a
                    kill switch: a fatal flaw ends the signal outright, never softened to “advisory.”
                </Lead>
            </div>

            <div className="mt-14 glass-panel rounded-2xl p-6 sm:p-10">
                <PipelineFlow detailed={detailed} />
            </div>

            {/* Per-agent roles (home shows compact cards; /about shows them inline in the flow) */}
            {!detailed && (
                <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {PIPELINE_AGENTS.map((agent, i) => (
                        <motion.div
                            key={agent.name}
                            initial={{ opacity: 0, y: 14 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-40px' }}
                            transition={{ duration: 0.4, delay: i * 0.06 }}
                            className="rounded-xl p-4 bg-white/[0.02] ring-1 ring-white/[0.06]"
                            style={{ borderTop: `2px solid ${agent.color}` }}
                        >
                            <div className="text-xs font-mono mb-1" style={{ color: agent.color }}>{String(i + 1).padStart(2, '0')}</div>
                            <div className="text-sm font-semibold text-sentinel-100 mb-1">{agent.name}</div>
                            <div className="text-xs text-sentinel-500 leading-snug">{agent.role}</div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Post-pipeline passes */}
            <div className="mt-10">
                <div className="text-xs font-mono uppercase tracking-wider text-sentinel-500 mb-4">
                    …then, before any signal can score
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                    {POST_PIPELINE_STAGES.map((stage, i) => (
                        <motion.div
                            key={stage.name}
                            initial={{ opacity: 0, y: 14 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true, margin: '-40px' }}
                            transition={{ duration: 0.4, delay: i * 0.08 }}
                            className="glass-panel rounded-xl p-5 flex items-start gap-4"
                        >
                            <span
                                className="mt-1 flex items-center justify-center w-9 h-9 rounded-lg font-mono text-sm font-bold shrink-0"
                                style={{ background: `${stage.color}1a`, color: stage.color }}
                            >
                                {i === 0 ? '↺' : 'ƒ'}
                            </span>
                            <div>
                                <div className="text-sm font-semibold text-sentinel-100 mb-1">{stage.name}</div>
                                <div className="text-xs text-sentinel-400 leading-relaxed">{stage.detail}</div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </Section>
    );
}
