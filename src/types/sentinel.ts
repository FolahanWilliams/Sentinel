/**
 * Sentinel — News Intelligence Types (from sentinel-spec.md §3)
 */

// ─── Feed Types ────────────────────────────────────────────

export type FeedCategory =
    | 'markets' | 'macro' | 'regulation' | 'tech' | 'ai'
    | 'startups' | 'vc' | 'crypto' | 'security' | 'hardware'
    | 'dev' | 'policy' | 'labor';

export interface Feed {
    name: string;
    url: string;
    category: FeedCategory;
}

// ─── Raw Article (parsed from RSS, before Gemini) ──────────

export interface RawArticle {
    title: string;
    link: string;
    pubDate: string;
    source: string;
    feedCategory: FeedCategory;
    snippet?: string;
}

// ─── Processed Article (after Gemini enrichment) ───────────

export type ArticleCategory =
    | 'ai_ml'
    | 'crypto_web3'
    | 'macro_economy'
    | 'tech_earnings'
    | 'startups_vc'
    | 'cybersecurity'
    | 'regulation_policy'
    | 'semiconductors'
    | 'markets_trading'
    | 'geopolitics'
    | 'other';

export interface ArticleTradingSignal {
    type:
    | 'earnings' | 'funding' | 'ipo' | 'merger' | 'policy_change'
    | 'product_launch' | 'hack_breach' | 'layoffs' | 'rate_decision'
    | 'partnership' | 'legal_action' | 'supply_chain';
    ticker?: string;
    direction?: 'up' | 'down' | 'volatile';
    confidence: number;
    note: string;
}

export interface ProcessedArticle {
    id: string;
    title: string;
    link: string;
    pubDate: string;
    source: string;

    summary: string;
    category: ArticleCategory;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    sentimentScore: number;
    impact: 'high' | 'medium' | 'low';
    signals: ArticleTradingSignal[];
    entities: string[];

    processedAt: string;
}

// ─── Daily Briefing ────────────────────────────────────────

export interface DailyBriefing {
    topStories: string[];
    marketMood: 'risk-on' | 'risk-off' | 'mixed';
    trendingTopics: string[];
    signalCount: {
        bullish: number;
        bearish: number;
        neutral: number;
    };
    generatedAt: string;
}

// ─── API Response ──────────────────────────────────────────

export interface SentinelMeta {
    feedsFetched: number;
    feedsFailed: string[];
    articlesRaw: number;
    articlesDeduplicated: number;
    articlesNew: number;
    articlesCached: number;
    geminiTokensUsed: number;
    processingTimeMs: number;
    costEstimateUsd: number;
}

export interface SentinelResponse {
    articles: ProcessedArticle[];
    briefing: DailyBriefing;
    meta: SentinelMeta;
}

// ─── Filter State (client-side) ────────────────────────────

export interface SentinelFilters {
    categories: ArticleCategory[];
    sentiment: 'bullish' | 'bearish' | 'all';
    highImpactOnly: boolean;
    searchQuery: string;
    sortBy: 'newest' | 'impact';
}
