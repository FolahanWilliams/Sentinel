import { useState, useEffect, type RefObject } from 'react';

interface ScrollPosition {
  scrollY: number;
  scrollProgress: number; // 0-1
  velocity: number; // px/frame
  isAtEnd: boolean;
}

export function useScrollPosition(ref: RefObject<HTMLElement | null>): ScrollPosition {
  const [pos, setPos] = useState<ScrollPosition>({
    scrollY: 0,
    scrollProgress: 0,
    velocity: 0,
    isAtEnd: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let prevScrollTop = el.scrollTop;

    const update = () => {
      const scrollTop = el.scrollTop;
      const maxScroll = el.scrollHeight - el.clientHeight;
      const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
      const velocity = scrollTop - prevScrollTop;
      prevScrollTop = scrollTop;

      setPos({
        scrollY: scrollTop,
        scrollProgress: Math.max(0, Math.min(1, progress)),
        velocity,
        isAtEnd: maxScroll > 0 && scrollTop >= maxScroll - 2,
      });
    };

    const handleScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', handleScroll);
    };
  }, [ref]);

  return pos;
}
