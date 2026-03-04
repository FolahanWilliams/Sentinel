/**
 * AmbientBackground — Reactive ambient orb layer
 *
 * Replaces the static CSS-only main-ambient-background pseudo-elements
 * with data-driven ambient orbs that respond to market mood and time of day.
 */

import { useEffect, useRef, useMemo } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useDeviceCapability } from '@/hooks/useDeviceCapability';
import { useTimeOfDay, TIME_THEME } from '@/hooks/useTimeOfDay';
import { useMarketMood, type MarketMoodType } from '@/hooks/useMarketMood';

/** HSL hue targets per market mood */
const MOOD_HUES: Record<MarketMoodType, { orb1Hue: number; orb2Hue: number; opacity: number }> = {
  bullish: { orb1Hue: 160, orb2Hue: 175, opacity: 0.18 },  // emerald/teal
  bearish: { orb1Hue: 10, orb2Hue: 30, opacity: 0.16 },    // red/amber
  volatile: { orb1Hue: 220, orb2Hue: 270, opacity: 0.22 },  // blue/purple brighter
  neutral: { orb1Hue: 220, orb2Hue: 270, opacity: 0.14 },   // default blue/purple
};

export function AmbientBackground() {
  const reducedMotion = useReducedMotion();
  const { isLowEnd } = useDeviceCapability();
  const timeOfDay = useTimeOfDay();
  const { mood, intensity } = useMarketMood();
  const containerRef = useRef<HTMLDivElement>(null);

  const theme = TIME_THEME[timeOfDay];
  const moodConfig = MOOD_HUES[mood];

  // Apply orb speed to CSS variable
  useEffect(() => {
    const speed = mood === 'volatile' ? 1 + intensity * 0.5 : 1;
    document.documentElement.style.setProperty('--ambient-orb-speed', String(speed));
    return () => {
      document.documentElement.style.setProperty('--ambient-orb-speed', '1');
    };
  }, [mood, intensity]);

  const orb1Style = useMemo(() => ({
    position: 'absolute' as const,
    top: '-10%',
    left: '-10%',
    width: '50vw',
    height: '50vw',
    borderRadius: '50%',
    filter: `blur(100px) hue-rotate(${theme.hueShift}deg)`,
    background: `radial-gradient(circle, hsla(${moodConfig.orb1Hue}, 70%, 55%, ${moodConfig.opacity}) 0%, transparent 60%)`,
    animation: reducedMotion ? 'none' : `float-orb-1 calc(20s / var(--ambient-orb-speed)) ease-in-out infinite`,
    opacity: theme.brightness * 0.6,
    pointerEvents: 'none' as const,
    zIndex: 0,
  }), [moodConfig, theme, reducedMotion]);

  const orb2Style = useMemo(() => ({
    position: 'absolute' as const,
    bottom: '-10%',
    right: '-10%',
    width: '60vw',
    height: '60vw',
    borderRadius: '50%',
    filter: `blur(100px) hue-rotate(${theme.hueShift}deg)`,
    background: `radial-gradient(circle, hsla(${moodConfig.orb2Hue}, 60%, 50%, ${moodConfig.opacity * 0.85}) 0%, transparent 60%)`,
    animation: reducedMotion ? 'none' : `float-orb-2 calc(25s / var(--ambient-orb-speed)) ease-in-out infinite reverse`,
    opacity: theme.brightness * 0.6,
    pointerEvents: 'none' as const,
    zIndex: 0,
  }), [moodConfig, theme, reducedMotion]);

  const orb3Style = useMemo(() => ({
    position: 'absolute' as const,
    top: '40%',
    left: '30%',
    width: '40vw',
    height: '40vw',
    borderRadius: '50%',
    filter: `blur(120px) hue-rotate(${theme.hueShift}deg)`,
    background: `radial-gradient(circle, hsla(${(moodConfig.orb1Hue + moodConfig.orb2Hue) / 2}, 50%, 45%, ${moodConfig.opacity * 0.6}) 0%, transparent 60%)`,
    animation: reducedMotion ? 'none' : `float-orb-3 calc(22s / var(--ambient-orb-speed)) ease-in-out infinite`,
    opacity: theme.brightness * 0.4,
    pointerEvents: 'none' as const,
    zIndex: 0,
  }), [moodConfig, theme, reducedMotion]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    >
      <div style={orb1Style} className="ambient-orb" />
      <div style={orb2Style} className="ambient-orb" />
      {!isLowEnd && <div style={orb3Style} className="ambient-orb" />}
    </div>
  );
}
