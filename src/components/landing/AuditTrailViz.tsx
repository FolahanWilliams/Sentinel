/**
 * AuditTrailViz — the signal record materializing field-by-field on scroll.
 *
 * Renders representative audit-trail fields as a terminal-style JSON record;
 * each row blurs-in on a stagger so the "every signal is fully persisted"
 * claim is shown, not just stated.
 */

import { motion } from 'framer-motion';
import { AUDIT_TRAIL_FIELDS } from './landingContent';

const KIND_COLOR: Record<string, string> = {
    id: '#94a3b8',
    price: '#10b981',
    reason: '#8b5cf6',
    score: '#3b82f6',
    outcome: '#f59e0b',
};

export function AuditTrailViz() {
    return (
        <div className="glass-panel-heavy rounded-2xl overflow-hidden">
            {/* Title bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                <span className="ml-2 font-mono text-[11px] text-sentinel-500">signal.audit.json</span>
            </div>

            {/* Record body */}
            <motion.div
                className="p-4 font-mono text-[11.5px] leading-relaxed"
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: '-40px' }}
                transition={{ staggerChildren: 0.06 }}
            >
                <div className="text-sentinel-500">{'{'}</div>
                {AUDIT_TRAIL_FIELDS.map(field => (
                    <motion.div
                        key={field.key}
                        className="flex items-baseline gap-2 pl-4"
                        variants={{
                            hidden: { opacity: 0, x: -6, filter: 'blur(4px)' },
                            show: { opacity: 1, x: 0, filter: 'blur(0px)' },
                        }}
                        transition={{ duration: 0.35 }}
                    >
                        <span style={{ color: KIND_COLOR[field.kind] }}>"{field.key}"</span>
                        <span className="text-sentinel-600">:</span>
                        <span className="text-sentinel-300 truncate">"{field.sample}"</span>
                    </motion.div>
                ))}
                <div className="text-sentinel-500 flex items-center gap-1">
                    {'}'}
                    <motion.span
                        className="inline-block w-1.5 h-3.5 bg-sentinel-400"
                        animate={{ opacity: [1, 1, 0, 0] }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                </div>
            </motion.div>
        </div>
    );
}
