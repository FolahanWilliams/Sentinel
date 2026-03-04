/**
 * MagneticButton — Button with subtle magnetic pull toward cursor
 *
 * Within a proximity radius, the button element subtly translates toward
 * the cursor position, creating a tactile glass-surface feel.
 */

import { useRef, useState, useCallback, type ReactNode, type CSSProperties } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface MagneticButtonProps {
  children: ReactNode;
  /** Pull strength 0-1. Default 0.15. */
  strength?: number;
  className?: string;
  style?: CSSProperties;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  title?: string;
}

export function MagneticButton({
  children,
  strength = 0.15,
  className = '',
  style,
  onClick,
  type,
  disabled,
  title,
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (reducedMotion) return;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;

      // Cap displacement at 3px
      const x = Math.max(-3, Math.min(3, dx * strength));
      const y = Math.max(-3, Math.min(3, dy * strength));
      setOffset({ x, y });
    },
    [strength, reducedMotion],
  );

  const handleMouseLeave = useCallback(() => {
    setOffset({ x: 0, y: 0 });
  }, []);

  return (
    <button
      ref={ref}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      type={type}
      disabled={disabled}
      title={title}
      style={{
        ...style,
        transform: `translate(${offset.x.toFixed(1)}px, ${offset.y.toFixed(1)}px)`,
        transition: 'transform 0.2s ease-out',
      }}
    >
      {children}
    </button>
  );
}
