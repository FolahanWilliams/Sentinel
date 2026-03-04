import { useEffect, type RefObject } from 'react';

/**
 * Sets will-change on mount for GPU compositing, then removes it after
 * the specified duration to free GPU memory.
 */
export function useWillChange(
  ref: RefObject<HTMLElement | null>,
  properties: string,
  durationMs: number,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.willChange = properties;

    const timer = setTimeout(() => {
      el.style.willChange = 'auto';
    }, durationMs);

    return () => {
      clearTimeout(timer);
      if (el) el.style.willChange = 'auto';
    };
  }, [ref, properties, durationMs]);
}
