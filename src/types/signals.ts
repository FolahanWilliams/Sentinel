/**
 * Sentinel — Signal Types
 */

import type { BiasType } from '@/config/constants';

export type SignalType = 'long_overreaction' | 'short_overreaction' | 'sector_contagion' | 'earnings_overreaction' | 'information';
export type SignalStatus = 'active' | 'triggered' | 'stopped_out' | 'target_hit' | 'manually_closed' | 'expired';
export type RiskLevel = 'low' | 'medium' | 'high' | 'extreme';
export type DataQuality = 'full' | 'partial' | 'stale' | 'no_quote';
export type TAAlignment = 'confirmed' | 'partial' | 'conflicting' | 'unavailable';
export type ConfluenceLevel = 'strong' | 'moderate' | 'weak' | 'none';

export interface TASnapshot {
    ticker: string;
    timestamp: string;
    rsi14: number | null;
    macd: { value: number; signal: number; histogram: number } | null;
    sma50: number | null;
    sma200: number | null;
    atr14: number | null;
    volumeRatio: number | null;
    bollingerPosition: number | null;
    zScore20: number | null;
    gapPct: number | null;
    gapType: GapType;
    trendDirection: 'bullish' | 'bearish' | 'neutral';
    taScore: number;
}

export type GapType = 'common' | 'breakaway' | 'exhaustion' | 'none';

export interface Signal {
    id: string;
    ticker: string;
    signal_type: SignalType;
    status: SignalStatus;
    confidence_score: number;
    calibrated_confidence: number | null;
    risk_level: RiskLevel;
    bias_type: BiasType;
    secondary_biases: BiasType[];
    bias_explanation: string;
    thesis: string;
    counter_argument: string;
    suggested_entry_low: number | null;
    suggested_entry_high: number | null;
    stop_loss: number | null;
    target_price: number | null;
    expected_timeframe_days: number | null;
    trailing_stop_rule: string | null;
    historical_win_rate: number | null;
    historical_avg_return: number | null;
    historical_matches_count: number | null;
    correction_probability: number | null;
    sources: string[];
    agent_outputs: AgentOutputsJson;
    ta_snapshot: TASnapshot | null;
    ta_alignment: TAAlignment | null;
    confluence_score: number | null;
    confluence_level: ConfluenceLevel | null;
    projected_roi: number | null;
    projected_win_rate: number | null;
    similar_events_count: number | null;
    data_quality: DataQuality;
    user_notes: string | null;
    is_paper: boolean;
    created_at: string;
    updated_at: string;
}

export interface AgentOutputsJson {
    event_detector?: Record<string, unknown>;
    bias_classifier?: Record<string, unknown>;
    sanity_checker?: Record<string, unknown>;
    historical_matcher?: Record<string, unknown>;
    signal_synthesizer?: Record<string, unknown>;
}

export interface BiasClassification {
    primary_bias: BiasType;
    secondary_biases: BiasType[];
    confidence: number;
    explanation: string;
    counter_argument: string;
    bias_strength: 'weak' | 'moderate' | 'strong';
    expected_correction: {
        direction: 'up' | 'down';
        magnitude_pct: number;
        timeframe_days: number;
        probability: number;
    };
}

export interface SanityCheckResult {
    pass_filter: boolean;
    overall_health: 'healthy' | 'concerning' | 'distressed';
    green_flags: string[];
    red_flags: string[];
    reasoning: string;
    fundamental_score: number;
    insider_activity: string | null;
    institutional_changes: string | null;
    structural_risks: string[];
}

export interface HistoricalMatchResult {
    matches: HistoricalMatch[];
    aggregate_stats: {
        avg_return_1d: number;
        avg_return_5d: number;
        avg_return_10d: number;
        avg_return_30d: number;
        win_rate: number;
        worst_case: number;
        best_case: number;
        sample_size: number;
    };
    pattern_confidence: number;
    caveats: string[];
    source: 'internal' | 'grounded_search' | 'mixed';
}

export interface HistoricalMatch {
    ticker: string;
    date: string;
    event_description: string;
    initial_move_pct: number;
    outcome_30d_pct: number;
    outcome: 'win' | 'loss' | 'breakeven';
    similarity_score: number;
    source_url: string | null;
}

export interface TradingSignal extends Signal {
    market_events: import('./events').MarketEvent[];
    bias_classification: BiasClassification;
    sanity_check: SanityCheckResult;
    historical_matches: HistoricalMatchResult;
    position_sizing?: PositionSizing;
}

export interface PositionSizing {
    method_used: 'fixed_pct' | 'risk_based' | 'kelly';
    suggested_shares: number;
    suggested_size_usd: number;
    portfolio_pct: number;
    risk_amount_usd: number;
    methodologies: {
        fixed_pct: { shares: number; size_usd: number };
        risk_based: { shares: number; size_usd: number };
        kelly: { shares: number; size_usd: number } | null;
    };
}

export interface SignalOutcome {
    id: string;
    signal_id: string;
    ticker: string;
    entry_price: number;
    price_at_1d: number | null;
    price_at_5d: number | null;
    price_at_10d: number | null;
    price_at_30d: number | null;
    return_at_1d: number | null;
    return_at_5d: number | null;
    return_at_10d: number | null;
    return_at_30d: number | null;
    outcome: 'win' | 'loss' | 'breakeven' | 'pending';
    hit_stop_loss: boolean;
    hit_target: boolean;
    max_drawdown: number | null;
    max_gain: number | null;
    tracked_at: string;
    completed_at: string | null;
}
