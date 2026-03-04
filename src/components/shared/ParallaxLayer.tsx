/**
 * ParallaxLayer — Depth-based transform offset wrapper
 *
 * Applies subtle translation based on scroll or mouse position.
 * Higher depth values = more parallax shift.
 */

import { useRef, type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useMousePosition } from '@/hooks/useMousePosition';

interface ParallaxLayerProps {
  children: ReactNode;
  /** Depth level 0-3. Higher = more shift. Default 1. */
  depth?: number;
  /** Whether parallax is driven by mouse or disabled. Default 'mouse'. */
  type?: 'mouse' | 'none';
  className?: string;
}

export function ParallaxLayer({
  children,
  depth = 1,
  type = 'mouse',
  className = '',
}: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const mouse = useMousePosition(ref);

  if (reducedMotion || type === 'none' || depth === 0) {
    return <div className={className}>{children}</div>;
  }

  const maxShift = depth * 3; // px
  const tx = (mouse.x - 0.5) * maxShift * 2;
  const ty = (mouse.y - 0.5) * maxShift * 2;

  return (
    <div
      ref={ref}
      className={className}
      data-parallax
      style={{
        transform: mouse.isHovering
          ? `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`
          : 'translate(0, 0)',
        transition: 'transform 0.15s ease-out',
      }}
    >
      {children}
    </div>
  );
}
