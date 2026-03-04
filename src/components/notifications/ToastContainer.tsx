/**
 * ToastContainer — Global toast notification display.
 *
 * Renders stacked toasts in the bottom-right corner with Framer Motion
 * slide-in/out animations and an auto-dismiss progress bar.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useToast, type ToastType } from '@/hooks/useToast';

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    error: <AlertCircle className="w-4 h-4 text-red-400" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-400" />,
    info: <Info className="w-4 h-4 text-blue-400" />,
};

const TOAST_COLORS: Record<ToastType, string> = {
    success: 'from-emerald-500/20 to-emerald-500/0',
    error: 'from-red-500/20 to-red-500/0',
    warning: 'from-amber-500/20 to-amber-500/0',
    info: 'from-blue-500/20 to-blue-500/0',
};

const TOAST_BAR_COLORS: Record<ToastType, string> = {
    success: 'from-emerald-500 to-emerald-400',
    error: 'from-red-500 to-red-400',
    warning: 'from-amber-500 to-amber-400',
    info: 'from-blue-500 to-blue-400',
};

export function ToastContainer() {
    const { toasts, dismissToast } = useToast();

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 max-w-sm">
            <AnimatePresence mode="popLayout">
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        layout
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        className="bg-sentinel-950/95 rounded-xl border border-sentinel-800/60 shadow-2xl shadow-black/50 backdrop-blur-xl overflow-hidden relative"
                    >
                        {/* Surface ripple on entry */}
                        <motion.div
                            initial={{ scale: 0, opacity: 0.15 }}
                            animate={{ scale: 4, opacity: 0 }}
                            transition={{ duration: 0.4, ease: 'easeOut' }}
                            className="absolute left-0 top-1/2 w-10 h-10 rounded-full pointer-events-none"
                            style={{ background: 'rgba(255, 255, 255, 0.05)', transformOrigin: 'center' }}
                        />

                        {/* Gradient stripe */}
                        <div className={`h-0.5 bg-gradient-to-r ${TOAST_BAR_COLORS[toast.type]}`} />

                        <div className={`p-3.5 bg-gradient-to-b ${TOAST_COLORS[toast.type]}`}>
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex-shrink-0">{TOAST_ICONS[toast.type]}</div>
                                <p className="text-sm text-sentinel-200 flex-1 leading-relaxed">{toast.message}</p>
                                <button
                                    onClick={() => dismissToast(toast.id)}
                                    className="w-5 h-5 rounded flex items-center justify-center text-sentinel-500 hover:text-sentinel-300 transition-colors cursor-pointer border-none bg-transparent flex-shrink-0"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Auto-dismiss progress bar */}
                        <motion.div
                            initial={{ scaleX: 1 }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: 5, ease: 'linear' }}
                            style={{ transformOrigin: 'left' }}
                            className={`h-0.5 bg-gradient-to-r ${TOAST_BAR_COLORS[toast.type]} opacity-50`}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
