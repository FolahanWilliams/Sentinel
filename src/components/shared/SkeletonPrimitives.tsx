/**
 * SkeletonPrimitives — Reusable shimmer loading placeholders.
 *
 * Drop-in replacements for spinners that match the shape of the real content,
 * giving users an instant sense of structure while data loads.
 */

import { motion } from 'framer-motion';

/** Single shimmering line / rectangle */
export function SkeletonLine({ className = '' }: { className?: string }) {
    return (
        <div className={`skeleton-shimmer rounded ${className}`} />
    );
}

/** A generic skeleton card matching glass-panel style */
export function SkeletonCard({ className = '', lines = 3 }: { className?: string; lines?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`glass-panel rounded-xl p-5 space-y-3 ${className}`}
        >
            <SkeletonLine className="h-4 w-1/3" />
            {Array.from({ length: lines }).map((_, i) => (
                <SkeletonLine key={i} className={`h-3 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
            ))}
        </motion.div>
    );
}

/** Skeleton table with configurable rows and columns */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass-panel rounded-xl overflow-hidden"
        >
            {/* Header row */}
            <div className="flex gap-4 px-6 py-4 border-b border-white/5">
                {Array.from({ length: cols }).map((_, i) => (
                    <SkeletonLine key={i} className="h-3 flex-1" />
                ))}
            </div>
            {/* Body rows */}
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex gap-4 px-6 py-4 border-b border-white/5 last:border-b-0">
                    {Array.from({ length: cols }).map((_, c) => (
                        <SkeletonLine
                            key={c}
                            className={`h-4 flex-1 ${c === 0 ? 'max-w-[80px]' : ''}`}
                        />
                    ))}
                </div>
            ))}
        </motion.div>
    );
}

/** Skeleton for signal feed cards */
export function SkeletonSignalFeed({ count = 4 }: { count?: number }) {
    return (
        <div className="divide-y divide-sentinel-800/30">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="p-5 space-y-3">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <SkeletonLine className="h-6 w-16 rounded-md" />
                            <SkeletonLine className="h-4 w-24" />
                        </div>
                        <div className="flex items-center gap-2">
                            <SkeletonLine className="h-4 w-12" />
                            <SkeletonLine className="h-5 w-16 rounded-md" />
                        </div>
                    </div>
                    <SkeletonLine className="h-3 w-full" />
                    <SkeletonLine className="h-3 w-4/5" />
                    <SkeletonLine className="h-8 w-48 rounded-lg" />
                </div>
            ))}
        </div>
    );
}

/** Skeleton for positions summary cards */
export function SkeletonSummaryCards() {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="glass-panel p-4 rounded-xl space-y-2">
                    <SkeletonLine className="h-3 w-20" />
                    <SkeletonLine className="h-7 w-24" />
                </div>
            ))}
        </div>
    );
}
