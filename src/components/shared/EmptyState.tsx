/**
 * EmptyState — Animated placeholder for when a list/section has no data.
 *
 * Features a pulsing gradient ring around the icon, entrance animation,
 * and an optional CTA button to guide the user's next action.
 */

import { Inbox } from 'lucide-react';
import { motion } from 'framer-motion';

interface EmptyStateProps {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}

export function EmptyState({
    title = 'No data yet',
    description,
    icon,
    action,
}: EmptyStateProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center justify-center py-16 gap-5 text-center"
        >
            {/* Pulsing gradient ring behind icon */}
            <div className="relative">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/10 to-emerald-500/20 blur-xl animate-pulse scale-150" />
                <div className="relative p-5 bg-sentinel-800/40 rounded-full ring-1 ring-white/10 backdrop-blur-sm">
                    {icon || <Inbox className="w-8 h-8 text-sentinel-400" />}
                </div>
            </div>
            <div>
                <h3 className="text-lg font-semibold text-sentinel-200">{title}</h3>
                {description && (
                    <p className="text-sm text-sentinel-500 mt-1.5 max-w-sm leading-relaxed">{description}</p>
                )}
            </div>
            {action}
        </motion.div>
    );
}
