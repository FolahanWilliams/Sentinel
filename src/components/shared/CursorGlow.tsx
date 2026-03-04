/**
 * CursorGlow — Radial gradient spotlight following the cursor
 *
 * Creates a "flashlight under frosted glass" effect.
 * Positioned absolutely within a relative-positioned parent.
 */

import { type RefObject } from 'react';
import { useMousePosition } from '@/hooks/useMousePosition';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';

interface CursorGlowProps {
  containerRef: RefObject<HTMLElement | null>;
  /** Glow color with alpha. Default: rgba(59, 130, 246, 0.08) */
  color?: string;
  /** Radius in px. Default: 200 */
  size?: number;
}

export function CursorGlow({
  containerRef,
  color = 'rgba(59, 130, 246, 0.08)',
  size = 200,
}: CursorGlowProps) {
  const { clientX, clientY, isHovering } = useMousePosition(containerRef);
  const reducedMotion = useReducedMotion();
  const { isLowEnd } = useDeviceCapability();

  if (reducedMotion || isLowEnd) return null;

  return (
    <div
      style={{
        position: 'absolute',
        left: clientX - size / 2,
        top: clientY - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color}, transparent 70%)`,
        pointerEvents: 'none',
        opacity: isHovering ? 1 : 0,
        transition: 'opacity 0.3s ease-out',
        zIndex: 0,
      }}
      aria-hidden="true"
    />
  );
}
