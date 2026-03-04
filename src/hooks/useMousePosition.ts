import { useState, useEffect, useCallback, type RefObject } from 'react';

interface MousePosition {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  clientX: number; // absolute px
  clientY: number; // absolute px
  isHovering: boolean;
}

export function useMousePosition(ref: RefObject<HTMLElement | null>): MousePosition {
  const [pos, setPos] = useState<MousePosition>({
    x: 0.5,
    y: 0.5,
    clientX: 0,
    clientY: 0,
    isHovering: false,
  });

  const handleMove = useCallback(
    (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setPos({ x, y, clientX: e.clientX - rect.left, clientY: e.clientY - rect.top, isHovering: true });
    },
    [ref],
  );

  const handleLeave = useCallback(() => {
    setPos((prev: MousePosition) => ({ ...prev, isHovering: false }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const throttled = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => handleMove(e));
    };

    el.addEventListener('mousemove', throttled);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', throttled);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, [ref, handleMove, handleLeave]);

  return pos;
}
