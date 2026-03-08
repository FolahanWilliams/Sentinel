export interface FearGreedIndicator {
  score: number;
  rating: string;
  timestamp: string;
}

export interface FearGreedData {
  score: number;
  rating: string;
  previousClose: number;
  previousWeek: number;
  previousMonth: number;
  previousYear: number;
  indicators: {
    marketMomentum: FearGreedIndicator;
    stockPriceStrength: FearGreedIndicator;
    stockPriceBreadth: FearGreedIndicator;
    putCallOptions: FearGreedIndicator;
    marketVolatility: FearGreedIndicator;
    junkBondDemand: FearGreedIndicator;
    safeHavenDemand: FearGreedIndicator;
  };
  lastUpdated: string;
}

export const FEAR_GREED_INDICATOR_LABELS: Record<keyof FearGreedData['indicators'], string> = {
  marketMomentum: 'Market Momentum (S&P 500)',
  stockPriceStrength: 'Stock Price Strength',
  stockPriceBreadth: 'Stock Price Breadth',
  putCallOptions: 'Put/Call Options',
  marketVolatility: 'Market Volatility (VIX)',
  junkBondDemand: 'Junk Bond Demand',
  safeHavenDemand: 'Safe Haven Demand',
};
