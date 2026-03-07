/**
 * Sentinel — Market Data Types
 */

export interface Quote {
    ticker: string;
    /** When the ticker resolved to a different exchange symbol (e.g. FRES → FRES.L) */
    resolvedTicker?: string;
    price: number;
    change: number;
    changePercent: number;
    volume: number;
    previousClose: number;
    open: number;
    high: number;
    low: number;
    marketCap: number | null;
    timestamp: Date;
}

export interface PriceBar {
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: Date;
    vwap: number | null;
}

export interface MarketSnapshot {
    quote: Quote;
    bars_30d: PriceBar[];
    technicals: TechnicalIndicators;
    unusualActivity: UnusualActivity | null;
}

export interface TechnicalIndicators {
    rsi_14: number | null;
    sma_20: number | null;
    sma_50: number | null;
    sma_200: number | null;
    ema_12: number | null;
    ema_26: number | null;
    macd: number | null;
    macd_signal: number | null;
    bollinger_upper: number | null;
    bollinger_lower: number | null;
    atr_14: number | null;
    avg_volume_20d: number | null;
}

export interface UnusualActivity {
    volumeMultiplier: number;
    priceChangePct: number;
    gapPct: number;
    triggers: string[];
}

export interface CompanyInfo {
    ticker: string;
    name: string;
    description: string;
    sector: string;
    industry: string;
    marketCap: number;
    employees: number | null;
    website: string | null;
    exchange: string;
}

export interface FundamentalData {
    ticker: string;
    revenue_ttm: number | null;
    revenue_growth_yoy: number | null;
    eps: number | null;
    pe_ratio: number | null;
    pe_sector_avg: number | null;
    debt_to_equity: number | null;
    profit_margin: number | null;
    week_52_high: number | null;
    week_52_low: number | null;
    avg_volume: number | null;
    beta: number | null;
    dividend_yield: number | null;
    short_interest_pct: number | null;
    institutional_ownership_pct: number | null;
    next_earnings_date: string | null;
    updated_at: Date;
}

export interface NewsItem {
    title: string;
    link: string;
    source: string;
    publishedAt: string;
    summary: string;
    relatedTickers: string[];
}

export type MarketStatus = 'pre_market' | 'open' | 'after_hours' | 'closed';

export interface MarketDataProvider {
    name: string;
    getQuote(ticker: string): Promise<Quote>;
    getHistorical(ticker: string, params: HistoricalParams): Promise<PriceBar[]>;
    getCompanyInfo(ticker: string): Promise<CompanyInfo>;
    getFundamentals(ticker: string): Promise<FundamentalData>;
}

export interface HistoricalParams {
    from: Date;
    to: Date;
    interval: '1min' | '5min' | '15min' | '1hour' | '1day' | '1week';
}

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}
