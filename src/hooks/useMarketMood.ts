import { useMemo } from 'react';
import { useMarketSnapshot } from './useMarketSnapshot';

export type MarketMoodType = 'bullish' | 'bearish' | 'volatile' | 'neutral';

interface MarketMood {
  mood: MarketMoodType;
  intensity: number; // 0-1
}

export function useMarketMood(): MarketMood {
  const { data } = useMarketSnapshot();

  return useMemo(() => {
    if (!data) return { mood: 'neutral' as const, intensity: 0 };

    const fg = data.fearGreedValue ?? 50;
    const vix = data.tickers.vix?.price ?? 0;

    // High VIX (> 25) signals volatility
    if (vix > 25) {
      return { mood: 'volatile' as const, intensity: Math.min(1, (vix - 25) / 25) };
    }

    // Fear & Greed drives bullish/bearish
    if (fg >= 60) {
      return { mood: 'bullish' as const, intensity: (fg - 50) / 50 };
    }
    if (fg <= 40) {
      return { mood: 'bearish' as const, intensity: (50 - fg) / 50 };
    }

    return { mood: 'neutral' as const, intensity: 0.1 };
  }, [data]);
}
