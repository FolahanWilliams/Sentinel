/**
 * ReasoningStack — the full vertical stack a signal passes through, as a
 * connected timeline. Makes the point that the pipeline is far more than its
 * five headline agents.
 */

import { motion } from 'framer-motion';
import { REASONING_LAYERS } from './landingContent';

export function ReasoningStack() {
    return (
        <div className="relative pl-9">
            {/* Spine */}
            <div
                className="absolute left-[14px] top-1 bottom-1 w-px"
                style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.18), transparent)' }}
            />
            {REASONING_LAYERS.map((layer, i) => (
                <motion.div
                    key={layer.name}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-30px' }}
                    transition={{ duration: 0.4, delay: i * 0.08 }}
                    className="relative mb-2.5 last:mb-0"
                >
                    <span
                        className="absolute -left-9 top-3 flex items-center justify-center w-7 h-7 rounded-full font-mono text-[11px] font-bold"
                        style={{ background: `${layer.color}1f`, color: layer.color, border: `1px solid ${layer.color}66` }}
                    >
                        {i + 1}
                    </span>
                    <div className="glass-panel rounded-xl px-4 py-3" style={{ borderLeft: `2px solid ${layer.color}` }}>
                        <div className="text-sm font-semibold text-sentinel-100">{layer.name}</div>
                        <div className="text-xs text-sentinel-400 leading-snug mt-0.5">{layer.detail}</div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
