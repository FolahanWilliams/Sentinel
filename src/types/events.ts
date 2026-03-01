/**
 * Sentinel — Market Event Types
 */

export type EventType =
    | 'earnings_miss'
    | 'earnings_beat'
    | 'guidance_cut'
    | 'guidance_raise'
    | 'analyst_downgrade'
    | 'analyst_upgrade'
    | 'fda_decision'
    | 'clinical_trial'
    | 'product_launch'
    | 'product_failure'
    | 'ceo_change'
    | 'insider_selling'
    | 'insider_buying'
    | 'sector_selloff'
    | 'macro_event'
    | 'geopolitical'
    | 'lawsuit'
    | 'recall'
    | 'partnership'
    | 'acquisition'
    | 'ipo_lockup'
    | 'short_report'
    | 'other';

export type EventSeverity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface MarketEvent {
    id: string;
    ticker: string;
    event_type: EventType;
    headline: string;
    description: string;
    severity: EventSeverity;
    source_urls: string[];
    detected_at: string;
    event_date: string | null;
    price_at_detection: number | null;
    price_change_pct: number | null;
    volume_multiplier: number | null;
    is_overreaction_candidate: boolean;
    raw_data: Record<string, unknown> | null;
    source_type: 'rss' | 'grounded_search';
}

export interface DetectionResult {
    ticker: string;
    events: MarketEvent[];
    scan_duration_ms: number;
    source: 'rss' | 'grounded_search' | 'mixed';
    tokens_used: number;
}

export interface TickerContext {
    ticker: string;
    sector: string;
    notes: string | null;
    recentPrice: number | null;
    recentVolume: number | null;
    avgVolume: number | null;
    priceChangePct: number | null;
    rssArticles?: RSSArticle[];
}

export interface RSSArticle {
    title: string;
    link: string;
    description: string | null;
    published_at: string | null;
    feed_name: string;
    feed_category: string;
    relevance_score: number;
}
