/**
 * Sentinel — Signal Types
 */

import type { BiasType } from '@/config/constants';
export type { BiasType };

export type SignalType = 'long_overreaction' | 'short_overreaction' | 'sector_contagion' | 'earnings_overreaction' | 'bullish_catalyst' | 'information' | 'capital_allocation' | 'investment_thesis' | 'portfolio_exit';
export type LynchCategory = 'fast_grower' | 'stalwart' | 'turnaround' | 'asset_play' | 'cyclical' | 'slow_grower';
export type SignalStatus = 'active' | 'triggered' | 'stopped_out' | 'target_hit' | 'manually_closed' | 'expired';
export type OutcomeStatus = 'pending_outcome' | 'outcome_logged' | 'outcome_overdue';
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
    /** 1 = buying volume, -1 = selling volume, 0 = neutral */
    volumeDirection?: number;
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
    conviction_score: number | null;
    moat_rating: number | null;
    lynch_category: LynchCategory | null;
    margin_of_safety_pct: number | null;
    why_high_conviction: string | null;
    data_quality: DataQuality;
    user_notes: string | null;
    is_paper: boolean;
    outcome_status: OutcomeStatus;
    outcome_due_at: string | null;
    outcome_review_days: number | null;
    monetary_value: number | null;
    currency: string | null;
    created_at: string;
    updated_at: string;
}

import type { OverreactionResult, SanityCheckResult, ContagionResult, BullishCatalystResult, BiasDetectiveResult, NoiseConfidenceResult, DecisionTwinResult, SWOTResult } from './agents';
export type { OverreactionResult, SanityCheckResult, ContagionResult, BullishCatalystResult, BiasDetectiveResult, NoiseConfidenceResult, DecisionTwinResult, SWOTResult };

export interface AgentOutputsJson {
    overreaction?: OverreactionResult;
    bullish_catalyst?: BullishCatalystResult;
    red_team?: SanityCheckResult;
    contagion?: ContagionResult;
    self_critique?: any;
    sentiment_divergence?: {
        type: string;
        sentiment_avg: number;
        sentiment_trend: number;
        confidence_boost: number;
        article_count: number;
    } | null;
    gap_analysis?: {
        gap_pct: number;
        gap_type: string;
        gap_fill_target: number;
    } | null;
    position_sizing?: {
        recommended_pct: number;
        usd_value: number;
        shares: number | null;
        method: string;
        stop_loss: number | null;
        risk_reward_ratio: number | null;
    } | null;
    earnings_guard?: {
        earnings_date: string | null;
        days_until: number | null;
        penalty: number;
    } | null;
    fundamentals?: {
        pe_ratio: number | null;
        debt_to_equity: number | null;
        profit_margin: number | null;
        revenue_growth_yoy: number | null;
        short_interest_pct?: number | null;
    } | null;
    market_regime?: {
        regime: string;
        vix: number | null;
        penalty: number;
    } | null;
    backtest?: {
        signal_type_win_rate: number | null;
        ticker_win_rate: number | null;
        ticker_consecutive_losses: number;
        penalty: number;
    } | null;
    multi_timeframe?: {
        weekly_trend: string;
        weekly_rsi: number | null;
        alignment: string;
        adjustment: number;
    } | null;
    correlation_guard?: {
        sector: string;
        sector_count: number;
        total_active: number;
        penalty: number;
    } | null;
    options_flow?: {
        has_unusual_activity: boolean;
        sentiment: string;
        put_call_ratio: number | null;
        confidence_adjustment: number;
        summary: string;
    } | null;
    peer_strength?: {
        peer_avg_change: number;
        relative_strength: number;
        is_idiosyncratic: boolean;
        confidence_adjustment: number;
        peers: Array<{ ticker: string; change_pct: number }>;
    } | null;
    conflict_check?: {
        has_conflicts: boolean;
        conflict_count: number;
        penalty: number;
        summary: string;
    } | null;
    re_evaluation?: {
        last_checked: string;
        action: string;
        ta_changes: Array<{ indicator: string; previous: string | number | null; current: string | number | null }>;
    } | null;
    price_correlation?: {
        highly_correlated: Array<{ ticker: string; correlation: number }>;
        max_correlation: number;
        penalty: number;
        reason?: string | null;
    } | null;
    portfolio_context?: {
        open_exposure_pct: number;
        open_position_count: number;
        remaining_capacity_pct: number;
        was_reduced: boolean;
        reduction_reason: string | null;
    } | null;
    outcome_narrative?: {
        narrative: string;
        key_drivers: string[];
        thesis_validation: string;
        generated_at: string;
    } | null;
    conviction_filter?: {
        conviction_score: number;
        moat_rating: number;
        moat_reasoning: string;
        lynch_category: LynchCategory;
        peg_ratio: number | null;
        margin_of_safety_pct: number;
        owner_earnings_quality: {
            free_cash_flow_positive: boolean;
            debt_to_equity: number | null;
            roe: number | null;
        };
        why_high_conviction: string;
        passed: boolean;
    } | null;
    fear_greed?: {
        score: number;
        rating: string | undefined;
        confidence_adjustment: number;
    } | null;
    sector_rotation?: {
        regime: string;
        regime_reason: string;
        ticker_sector_category: string;
        growth_avg: number;
        defensive_avg: number;
        cyclical_avg: number;
    } | null;
    cross_source?: {
        quality_tier: string;
        quality_score: number;
        confirmed_sources: number;
        total_sources: number;
        confidence_adjustment: number;
        sources: Array<{ source: string; confirmed: boolean; detail: string }>;
    } | null;
    retail_vs_news?: {
        gap_type: string;
        retail_sentiment: number;
        news_sentiment: number;
        sentiment_gap: number;
        confidence_adjustment: number;
    } | null;
    source_diversity?: {
        diversity_score: number;
        source_count: number;
        tier1_count: number;
        tier2_count: number;
        tier3_count: number;
        cap_applied: boolean;
        confidence_adjustment: number;
        summary: string;
    } | null;
    // Phase 2 — P0: Bias Detective + Noise-Aware Confidence
    bias_detective?: BiasDetectiveResult | null;
    noise_confidence?: NoiseConfidenceResult | null;
    // Phase 2 — P1: Decision Twin Simulation
    decision_twin?: DecisionTwinResult | null;
    // Phase 2 — P1: SWOT Analysis
    swot?: SWOTResult | null;
    // Phase 3 — Agent Context Bus (cascading intelligence audit trail)
    context_bus?: {
        confidence_trail: Array<{
            stage: string;
            before: number;
            after: number;
            adjustment: number;
            reason: string;
        }>;
        stages_completed: string[];
    } | null;
    // Phase 3 — A/B experiment assignment
    ab_experiment?: {
        experiment_id: string;
        variant: 'control' | 'variant';
        params: Record<string, number>;
    } | null;
    // Phase 3 — Proactive thesis engine
    proactive_thesis?: {
        catalyst: string;
        urgency: 'immediate' | 'watchlist' | 'developing';
        reasoning: string;
        direction: 'long' | 'short';
    } | null;
    // Phase 3 — Conflict resolution actions
    conflict_resolution?: Array<{
        action: string;
        existingSignalId: string;
        existingTicker: string;
        reason: string;
    }> | null;
    // Legacy fields for older signals
    event_detector?: any;
    bias_classifier?: any;
    sanity_checker?: any;
    historical_matcher?: any;
    signal_synthesizer?: any;
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

export interface TradeSanityCheck {
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
    sanity_check: TradeSanityCheck;
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
    user_outcome_notes: string | null;
    user_reported_result: string | null;
    confirmed_biases: string[] | null;
    lessons_learned: string | null;
}
