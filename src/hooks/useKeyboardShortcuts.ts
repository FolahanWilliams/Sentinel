/**
 * useKeyboardShortcuts — Global keyboard shortcut registry with chord support.
 *
 * Chords: press G then D within 500ms to navigate to Dashboard.
 * Single keys: N to create new position.
 * Disabled when input/textarea/select is focused.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface ShortcutMap {
    [key: string]: () => void;
}

export function useKeyboardShortcuts() {
    const navigate = useNavigate();
    const chordFirstKey = useRef<string | null>(null);
    const chordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Skip if user is typing in an input
        const target = e.target as HTMLElement;
        const tag = target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
            return;
        }

        // Skip if modifier keys are held (except shift)
        if (e.metaKey || e.ctrlKey || e.altKey) return;

        const key = e.key.toLowerCase();

        // Chord handling: G + <key>
        if (chordFirstKey.current === 'g') {
            chordFirstKey.current = null;
            if (chordTimer.current) clearTimeout(chordTimer.current);

            const chordTargets: ShortcutMap = {
                'd': () => navigate('/'),
                'p': () => navigate('/positions'),
                's': () => navigate('/scanner'),
                'w': () => navigate('/watchlist'),
                'i': () => navigate('/?tab=intelligence'),
                'r': () => navigate('/risk'),
                'j': () => navigate('/journal'),
                'a': () => navigate('/alerts'),
                'e': () => navigate('/earnings'),
                'b': () => navigate('/backtest'),
            };

            const action = chordTargets[key];
            if (action) {
                e.preventDefault();
                action();
            }
            return;
        }

        // Start chord with G
        if (key === 'g') {
            chordFirstKey.current = 'g';
            chordTimer.current = setTimeout(() => {
                chordFirstKey.current = null;
            }, 500);
            return;
        }

        // Single-key shortcuts
        if (key === 'n') {
            e.preventDefault();
            navigate('/positions?prefill=true');
        }
    }, [navigate]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (chordTimer.current) clearTimeout(chordTimer.current);
        };
    }, [handleKeyDown]);
}
