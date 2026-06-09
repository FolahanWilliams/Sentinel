/**
 * Shared section scaffolding for the landing + /about showcase, so every
 * section shares spacing, eyebrow, and heading treatment.
 */

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';

export function Section({
    id,
    children,
    bordered = true,
    className = '',
}: {
    id?: string;
    children: ReactNode;
    bordered?: boolean;
    className?: string;
}) {
    return (
        <section
            id={id}
            className={`relative max-w-6xl mx-auto px-6 py-20 sm:py-28 ${bordered ? 'border-t border-sentinel-800/40' : ''} ${className}`}
        >
            {children}
        </section>
    );
}

export function Eyebrow({ label, color = '#3b82f6' }: { label: string; color?: string }) {
    return (
        <span className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-[0.18em] text-sentinel-400">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
            {label}
        </span>
    );
}

export function SectionTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <motion.h2
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5 }}
            className={`text-2xl sm:text-3xl lg:text-4xl font-bold font-display tracking-tight text-sentinel-50 ${className}`}
        >
            {children}
        </motion.h2>
    );
}

export function Lead({ children, className = '' }: { children: ReactNode; className?: string }) {
    return (
        <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className={`text-base sm:text-lg text-sentinel-400 leading-relaxed ${className}`}
        >
            {children}
        </motion.p>
    );
}
