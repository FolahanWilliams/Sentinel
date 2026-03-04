/**
 * GlassMaterialize — Blur-to-clear entrance animation wrapper
 *
 * Cards start blurred and transparent, then sharpen into focus.
 * Used for staggered cascade effects on page load.
 */

import { motion } from 'framer-motion';
import { type ReactNode } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface GlassMaterializeProps {
  children: ReactNode;
  /** Stagger delay in ms. Default 0. */
  delay?: number;
  className?: string;
}

export function GlassMaterialize({
  children,
  delay = 0,
  className = '',
}: GlassMaterializeProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{
        duration: 0.4,
        delay: delay / 1000,
        ease: 'easeOut',
      }}
    >
      {children}
    </motion.div>
  );
}
