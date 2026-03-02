export interface Feed {
    name: string;
    url: string;
    category: FeedCategory;
}

export type FeedCategory =
    | 'markets' | 'macro' | 'regulation' | 'tech' | 'ai'
    | 'startups' | 'vc' | 'crypto' | 'security' | 'hardware'
    | 'dev' | 'policy' | 'labor';

export interface RawArticle {
    title: string;
    link: string;
    pubDate: string;
    source: string;
    feedCategory: FeedCategory;
    snippet?: string;
}

export interface ProcessedArticle {
    id: string;
    title: string;
    link: string;
    pub_date: string;
    source: string;

    summary: string;
    category: ArticleCategory;
    sentiment: 'bullish' | 'bearish' | 'neutral';
    sentiment_score: number;
    impact: 'high' | 'medium' | 'low';
    signals: TradingSignal[];
    entities: string[];

    processed_at: string;
}

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

export interface TradingSignal {
    type: 'earnings' | 'funding' | 'ipo' | 'merger' | 'policy_change'
    | 'product_launch' | 'hack_breach' | 'layoffs' | 'rate_decision'
    | 'partnership' | 'legal_action' | 'supply_chain';
    ticker?: string;
    direction?: 'up' | 'down' | 'volatile';
    confidence: number;
    note: string;
}

export interface SentinelResponse {
    articles: ProcessedArticle[];
    briefing: DailyBriefing;
    meta: {
        feedsFetched: number;
        feedsFailed: string[];
        articlesRaw: number;
        articlesDeduplicated: number;
        articlesNew: number;
        articlesCached: number;
        processingTimeMs: number;
    };
}

export interface DailyBriefing {
    top_stories: string[];
    market_mood: 'risk-on' | 'risk-off' | 'mixed';
    trending_topics: string[];
    signal_count: {
        bullish: number;
        bearish: number;
        neutral: number;
    };
    generated_at?: string;
}
