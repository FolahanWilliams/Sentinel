/**
 * useToast — Global toast notification system (Zustand store).
 *
 * Usage:
 *   import { useToast } from '@/hooks/useToast';
 *   const { addToast } = useToast();
 *   addToast('Scan complete', 'success');
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    createdAt: number;
}

interface ToastStore {
    toasts: Toast[];
    addToast: (message: string, type?: ToastType) => void;
    dismissToast: (id: string) => void;
}

let toastCounter = 0;
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToast = create<ToastStore>((set) => ({
    toasts: [],
    addToast: (message, type = 'info') => {
        const id = `toast-${++toastCounter}-${Date.now()}`;
        const toast: Toast = { id, message, type, createdAt: Date.now() };

        set((state) => ({ toasts: [...state.toasts, toast] }));

        // Auto-dismiss after 5 seconds (with tracked timer for cleanup)
        const timer = setTimeout(() => {
            toastTimers.delete(id);
            set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
        }, 5000);
        toastTimers.set(id, timer);
    },
    dismissToast: (id) => {
        // Clear any pending auto-dismiss timer
        const timer = toastTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            toastTimers.delete(id);
        }
        set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    },
}));
