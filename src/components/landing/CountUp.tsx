/**
 * CountUp — animates a number from 0 to its target the first time it scrolls
 * into view. Falls back to the final value immediately under reduced-motion.
 */

import { useEffect, useRef, useState } from 'react';
import { animate, useInView } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface CountUpProps {
    value: number;
    suffix?: string;
    durationMs?: number;
    className?: string;
}

export function CountUp({ value, suffix = '', durationMs = 1400, className = '' }: CountUpProps) {
    const ref = useRef<HTMLSpanElement>(null);
    const inView = useInView(ref, { once: true, margin: '-60px' });
    const reducedMotion = useReducedMotion();
    const [display, setDisplay] = useState(0);

    useEffect(() => {
        if (!inView) return;
        if (reducedMotion) {
            setDisplay(value);
            return;
        }
        const controls = animate(0, value, {
            duration: durationMs / 1000,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: v => setDisplay(v),
        });
        return () => controls.stop();
    }, [inView, value, durationMs, reducedMotion]);

    return (
        <span ref={ref} className={className}>
            {Math.round(display)}
            {suffix}
        </span>
    );
}
