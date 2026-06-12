/**
 * StatsBand — count-up architecture stats. Mechanism counts only, all
 * verifiable from the codebase — never a performance claim.
 */

import { motion } from 'framer-motion';
import { CountUp } from './CountUp';
import { ARCHITECTURE_STATS, type ArchStat } from './landingContent';

export function StatsBand({ stats = ARCHITECTURE_STATS }: { stats?: ArchStat[] }) {
    return (
        <div className="border-y border-sentinel-800/40 bg-white/[0.015]">
            <div className="max-w-6xl mx-auto px-6 py-14 grid grid-cols-2 lg:grid-cols-4 gap-y-10 gap-x-6">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.4, delay: i * 0.08 }}
                        className="text-center sm:text-left"
                    >
                        <div className="text-4xl sm:text-5xl font-bold font-mono bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                            <CountUp value={stat.value} suffix={stat.suffix} />
                        </div>
                        <div className="mt-2 text-sm font-semibold text-sentinel-200">{stat.label}</div>
                        <div className="text-xs text-sentinel-500">{stat.sub}</div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
