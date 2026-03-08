import { useMemo } from 'react';
import { useFearGreed } from './useFearGreed';
import { useMarketSnapshot } from './useMarketSnapshot';
import { VIX_VOLATILITY_THRESHOLD, FEAR_GREED_BULLISH_THRESHOLD, FEAR_GREED_BEARISH_THRESHOLD } from '@/config/constants';

export type MarketMoodType = 'bullish' | 'bearish' | 'volatile' | 'neutral';

interface MarketMood {
  mood: MarketMoodType;
  intensity: number; // 0-1
}

export function useMarketMood(): MarketMood {
  // Primary F&G source: direct CNN data (fast, no Gemini dependency)
  const { data: fgData } = useFearGreed();
  // VIX still comes from market snapshot (needed for volatility detection)
  const { data: snapshot } = useMarketSnapshot();

  return useMemo(() => {
    // Prefer direct CNN F&G score, fall back to snapshot's copy
    const fg = fgData?.score ?? snapshot?.fearGreedValue ?? 50;
    const vix = snapshot?.tickers.vix?.price ?? 0;

    // High VIX signals volatility
    if (vix > VIX_VOLATILITY_THRESHOLD) {
      return { mood: 'volatile' as const, intensity: Math.min(1, (vix - VIX_VOLATILITY_THRESHOLD) / VIX_VOLATILITY_THRESHOLD) };
    }

    // Fear & Greed drives bullish/bearish
    if (fg >= FEAR_GREED_BULLISH_THRESHOLD) {
      return { mood: 'bullish' as const, intensity: (fg - 50) / 50 };
    }
    if (fg <= FEAR_GREED_BEARISH_THRESHOLD) {
      return { mood: 'bearish' as const, intensity: (50 - fg) / 50 };
    }

    return { mood: 'neutral' as const, intensity: 0.1 };
  }, [fgData, snapshot]);
}
