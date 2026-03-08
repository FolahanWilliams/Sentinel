/**
 * SignalToast — Animated toast notifications for new AI signals.
 *
 * Slides in from the top-right, auto-dismisses after 8 seconds,
 * and stacks multiple toasts. Each toast shows the ticker, signal type,
 * confidence, and a "View" link to the analysis page.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, TrendingUp, Shield, ArrowRight } from 'lucide-react';
import { useRealtimeSignals, RealtimeSignal } from '@/hooks/useRealtimeSignals';

export function SignalToast() {
    const { pendingSignals, dismissSignal } = useRealtimeSignals();
    const navigate = useNavigate();

    // Auto-dismiss after 8 seconds — only start timer for newly added signals
    const dismissedRef = useRef(new Set<string>());
    useEffect(() => {
        if (pendingSignals.length === 0) return;

        const timers: ReturnType<typeof setTimeout>[] = [];
        for (const signal of pendingSignals) {
            if (!dismissedRef.current.has(signal.id)) {
                dismissedRef.current.add(signal.id);
                timers.push(setTimeout(() => dismissSignal(signal.id), 8000));
            }
        }

        return () => timers.forEach(clearTimeout);
    }, [pendingSignals, dismissSignal]);

    const handleView = useCallback((signal: RealtimeSignal) => {
        dismissSignal(signal.id);
        navigate(`/analysis/${signal.ticker}`);
    }, [dismissSignal, navigate]);

    const formatSignalType = (type: string) => {
        return type
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 max-w-sm">
            <AnimatePresence mode="popLayout">
                {pendingSignals.map((signal) => (
                    <motion.div
                        key={signal.id}
                        layout
                        initial={{ opacity: 0, x: 100, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 100, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="bg-sentinel-950/95 rounded-xl border border-sentinel-800/60 shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden"
                    >
                        {/* Gradient top bar */}
                        <div className="h-0.5 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />

                        <div className="p-4">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-500/20">
                                        <Zap className="w-4 h-4 text-emerald-400" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">New Signal</p>
                                        <p className="text-sm font-bold font-mono text-sentinel-100">{signal.ticker}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => dismissSignal(signal.id)}
                                    className="w-6 h-6 rounded flex items-center justify-center text-sentinel-500 hover:text-sentinel-300 transition-colors cursor-pointer border-none bg-transparent"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* Details */}
                            <div className="flex items-center gap-3 mb-3">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-500/15 text-blue-400">
                                    <TrendingUp className="w-3 h-3" />
                                    {formatSignalType(signal.signal_type)}
                                </span>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-purple-500/15 text-purple-400">
                                    <Shield className="w-3 h-3" />
                                    {signal.confidence_score}% confidence
                                </span>
                            </div>

                            {/* Thesis preview */}
                            {signal.thesis && (
                                <p className="text-xs text-sentinel-400 leading-relaxed mb-3 line-clamp-2">
                                    {signal.thesis}
                                </p>
                            )}

                            {/* Action */}
                            <button
                                onClick={() => handleView(signal)}
                                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-sentinel-800/50 hover:bg-sentinel-800 text-sentinel-200 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-sentinel-700/50 hover:border-sentinel-600"
                            >
                                View Analysis <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Auto-dismiss progress bar */}
                        <motion.div
                            initial={{ scaleX: 1 }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: 8, ease: 'linear' }}
                            style={{ transformOrigin: 'left' }}
                            className="h-0.5 bg-gradient-to-r from-emerald-500/50 to-blue-500/50"
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
