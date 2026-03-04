import { useState, useEffect } from 'react';

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night';

function getTimePeriod(): TimePeriod {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/** Ambient color config per time period */
export const TIME_THEME = {
  morning: { hueShift: -10, saturation: 1.1, brightness: 1.05 },
  afternoon: { hueShift: 0, saturation: 1.0, brightness: 1.0 },
  evening: { hueShift: 15, saturation: 1.05, brightness: 0.95 },
  night: { hueShift: 5, saturation: 0.9, brightness: 0.85 },
} as const;

export function useTimeOfDay(): TimePeriod {
  const [period, setPeriod] = useState(getTimePeriod);

  useEffect(() => {
    const interval = setInterval(() => setPeriod(getTimePeriod()), 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return period;
}
