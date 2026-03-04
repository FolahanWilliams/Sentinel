import { useState, useEffect, type RefObject } from 'react';

interface ScrollFade {
  opacity: number;
  blur: number;
}

/**
 * Returns opacity and blur for a child element based on its position
 * within a scrollable container. Items near edges fade/blur slightly.
 */
export function useScrollFade(
  containerRef: RefObject<HTMLElement | null>,
  itemRef: RefObject<HTMLElement | null>,
): ScrollFade {
  const [fade, setFade] = useState<ScrollFade>({ opacity: 1, blur: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const item = itemRef.current;
    if (!container || !item) return;

    let raf = 0;

    const compute = () => {
      const cRect = container.getBoundingClientRect();
      const iRect = item.getBoundingClientRect();

      const fadeZone = cRect.height * 0.15; // top/bottom 15% fades

      // Distance from safe zone edges
      const topDist = iRect.top - cRect.top;
      const bottomDist = cRect.bottom - iRect.bottom;

      let factor = 1;
      if (topDist < fadeZone) factor = Math.min(factor, Math.max(0.7, topDist / fadeZone));
      if (bottomDist < fadeZone) factor = Math.min(factor, Math.max(0.7, bottomDist / fadeZone));

      setFade({
        opacity: 0.7 + 0.3 * factor,
        blur: (1 - factor) * 2,
      });
    };

    const handleScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    compute();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [containerRef, itemRef]);

  return fade;
}
