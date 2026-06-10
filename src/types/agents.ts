/**
 * Sentinel — Agent Pipeline Types
 */

export interface GroundingSource {
    url: string;
    title: string;
}

export interface AgentResult<T> {
    success: boolean;
    data: T | null;
    error: string | null;
    duration_ms: number;
    tokens_used: number;
    model_used: string;
    grounded_search_used: boolean;
    grounding_sources?: GroundingSource[];
}

export interface OverreactionResult {
    reasoning: string;
    is_overreaction: boolean;
    confidence_score: number;
    identified_biases: string[];
    bias_type: import('./signals').BiasType;
    secondary_biases: import('./signals').BiasType[];
    thesis: string;
    financial_impact_assessment: string;
    suggested_entry_low: number;
    suggested_entry_high: number;
    stop_loss: number;
    target_price: number;
    timeframe_days: number;
    moat_rating: number;
    lynch_category: import('./signals').LynchCategory;
    conviction_score: number;
    why_high_conviction: string;
}

export interface ContagionResult {
    reasoning: string;
    is_contagion: boolean;
    confidence_score: number;
    epicenter_ticker: string;
    bias_type: import('./signals').BiasType;
    secondary_biases: import('./signals').BiasType[];
    thesis: string;
    exposure_analysis: string;
    suggested_entry_low: number;
    suggested_entry_high: number;
    stop_loss: number;
    target_price: number;
    timeframe_days: number;
    moat_rating: number;
    lynch_category: import('./signals').LynchCategory;
    conviction_score: number;
    why_high_conviction: string;
}

export interface BullishCatalystResult {
    reasoning: string;
    is_underreaction: boolean;
    confidence_score: number;
    catalyst_type: string;
    identified_biases: string[];
    bias_type: import('./signals').BiasType;
    secondary_biases: import('./signals').BiasType[];
    thesis: string;
    catalyst_impact_assessment: string;
    suggested_entry_low: number;
    suggested_entry_high: number;
    stop_loss: number;
    target_price: number;
    timeframe_days: number;
    moat_rating: number;
    lynch_category: import('./signals').LynchCategory;
    conviction_score: number;
    why_high_conviction: string;
}

export interface MacroCausalResult {
    causal_chain: string[];
    exploitable_cognitive_bias: import('./signals').BiasType;
    bias_description: string;
    is_geopolitical_catalyst: boolean;
    confidence_score: number;
    thesis: string;
    suggested_entry_low: number;
    suggested_entry_high: number;
    stop_loss: number;
    target_price: number;
    timeframe_days: number;
    secondary_biases: import('./signals').BiasType[];
    moat_rating: number;
    lynch_category: import('./signals').LynchCategory;
    conviction_score: number;
    why_high_conviction: string;
}

export interface SanityCheckResult {
    reasoning: string;
    passes_sanity_check: boolean;
    risk_score: number;
    fatal_flaws: string[];
    macro_obstacles: string;
    counter_thesis: string;
    /**
     * Final decisive verdict from the Red Team. Newly added; optional here so
     * that signals cached before this field existed continue to deserialize.
     * When absent, scanner falls back to risk_score + passes_sanity_check alone.
     */
    verdict?: 'block' | 'warn' | 'allow';
}

/** Individual bias finding from the Bias Detective agent */
export interface BiasDetectiveFinding {
    bias_name: string;
    severity: 1 | 2 | 3;        // 1=mild, 2=moderate, 3=severe
    evidence: string;            // specific sentence(s) from the thesis that expose this bias
    penalty: number;             // confidence penalty applied for this finding
    mitigation?: string;         // suggested counter-check to mitigate this bias
}

/** Output from the Bias Detective agent (Phase 2 — P0) */
export interface BiasDetectiveResult {
    reasoning: string;
    findings: BiasDetectiveFinding[];
    total_penalty: number;       // cumulative penalty (capped at BIAS_DETECTIVE_MAX_PENALTY)
    dominant_bias: string;       // the most severe bias found, or 'none'
    bias_free: boolean;          // true when no bias above severity threshold was detected
    adjusted_confidence: number; // original_confidence − total_penalty
}

/** Single SWOT item — a point with supporting evidence */
export interface SWOTItem {
    point: string;     // concise statement (1 sentence)
    evidence: string;  // specific evidence or source cited
}

/** Structured SWOT analysis enriching the signal thesis narrative (Phase 2 — P1) */
export interface SWOTResult {
    strengths: SWOTItem[];      // 2-3: what the thesis gets right
    weaknesses: SWOTItem[];     // 2-3: structural holes or blind spots
    opportunities: SWOTItem[];  // 1-2: alpha not yet priced in
    threats: SWOTItem[];        // 2-3: risks that could invalidate the thesis
    executive_summary: string;  // 2-3 sentence trader-facing narrative
}

/** Single persona verdict from the Decision Twin simulation (Phase 2 — P1) */
export interface PersonaVerdict {
    persona: 'value_investor' | 'momentum_trader' | 'risk_manager';
    verdict: 'take' | 'caution' | 'skip';
    reasoning?: string;       // full chain-of-thought from the model (expandable in UI)
    rationale: string;        // 1-2 sentence reasoning for the verdict
    key_concern: string;      // top risk or dealbreaker
    confidence_score: number; // persona's independent confidence (0-100)
}

/** Aggregated output from the 3-persona Decision Twin simulation */
export interface DecisionTwinResult {
    value: PersonaVerdict;
    momentum: PersonaVerdict;
    risk: PersonaVerdict;
    unanimous_take: boolean;
    skip_count: number;
    caution_count: number;
    confidence_adjustment: number;  // net boost or penalty applied
    adjusted_confidence: number;    // original_confidence + adjustment
    flagged: boolean;               // true when any persona voted SKIP
    summary: string;                // one-line summary of panel verdict
}

/** Output from the Noise-Aware Confidence 3-judge panel (Phase 2 — P0) */
export interface NoiseConfidenceResult {
    scores: [number, number, number];     // raw confidence from judge_low/mid/high temps
    mean: number;
    std_dev: number;
    convergent: boolean;                  // std_dev < NOISE_JUDGE_CONVERGENCE_THRESHOLD
    divergent: boolean;                   // std_dev > NOISE_JUDGE_DIVERGENCE_THRESHOLD
    confidence_adjustment: number;        // negative = penalty, positive = boost
    adjusted_confidence: number;
    summary: string;
}

export interface AgentOutputs {
    event_detection: AgentResult<import('./events').DetectionResult>;
    bias_classification: AgentResult<import('./signals').BiasClassification> | null;
    sanity_check: AgentResult<SanityCheckResult> | null;
    historical_match: AgentResult<import('./signals').HistoricalMatchResult> | null;
    signal_synthesis: AgentResult<import('./signals').TradingSignal> | null;
}

export interface AnalysisResult {
    ticker: string;
    signal: import('./signals').TradingSignal | null;
    events_detected: number;
    agents_run: string[];
    total_duration_ms: number;
    total_tokens_used: number;
    total_estimated_cost_usd: number;
    skipped_reason: string | null;
    errors: string[];
}

export interface ScanResult {
    started_at: string;
    completed_at: string;
    tickers_scanned: number;
    events_detected: number;
    signals_generated: number;
    errors: ScanError[];
    total_duration_ms: number;
    total_cost_usd: number;
    results: AnalysisResult[];
}

export interface ScanError {
    ticker: string;
    agent: string;
    error: string;
    timestamp: string;
}

export interface ScannerStatus {
    state: 'running' | 'paused' | 'stopped' | 'scanning';
    last_scan_at: string | null;
    next_scan_at: string | null;
    current_ticker: string | null;
    tickers_remaining: number;
    scan_interval_ms: number;
    is_paper_mode: boolean;
    scans_today: number;
    total_cost_today_usd: number;
}

export interface ScanLogEntry {
    id: string;
    scan_type: 'full' | 'single' | 'manual';
    status: 'completed' | 'partial' | 'failed';
    tickers_scanned: number;
    events_detected: number;
    signals_generated: number;
    duration_ms: number;
    estimated_cost_usd: number;
    error_message: string | null;
    created_at: string;
}

// ── Pre-Mortem Agent Types ────────────────────────────

/** Single failure scenario from the Pre-Mortem Agent */
export interface PreMortemScenario {
    description: string;
    probability: number;            // 0-100
    severity: 'mild' | 'moderate' | 'severe';
    early_warning_sign: string;
}

/** Output from the Pre-Mortem Agent */
export interface PreMortemResult {
    scenarios: PreMortemScenario[];
    avg_failure_probability: number;
    highest_risk_scenario: string;
    confidence_penalty: number;
    resilience_rating: 'fragile' | 'moderate' | 'resilient';
}

// ── Toxic Combination Detector Types ──────────────────

/** A detected toxic bias combination pattern */
export interface ToxicPattern {
    name: string;
    biases: string[];
    base_risk: number;
    amplified_risk: number;
    amplifier_reason: string | null;
}

/** Output from the Toxic Combination Detector */
export interface ToxicCombinationResult {
    patterns_detected: ToxicPattern[];
    compound_risk_score: number;
    confidence_penalty: number;
    highest_risk_pattern: string | null;
    is_toxic: boolean;
}

// ── RPD Pattern Matcher Types (Klein Framework) ─────────────────────────────

/** A single historical pattern match from RPD */
export interface RPDMatch {
    signal_id: string;
    ticker: string;
    signal_type: string;
    bias_type: string;
    confidence: number;
    outcome: string;
    return_pct: number | null;
    similarity_score: number;
    created_at: string;
}

/** Output from the RPD Pattern Matcher */
export interface RPDMatchResult {
    matches: RPDMatch[];
    historical_win_rate: number | null;
    avg_return: number | null;
    confidence_adjustment: number;
    pattern_summary: string;
    sufficient_data: boolean;
}

// ── Beneficial Pattern Detector Types ───────────────────────────────────────

/** A detected beneficial compound pattern */
export interface BeneficialPattern {
    name: string;
    conditions_met: string[];
    boost: number;
}

/** Output from the Beneficial Pattern Detector */
export interface BeneficialPatternResult {
    patterns_detected: BeneficialPattern[];
    total_boost: number;    // capped at BENEFICIAL_PATTERN_MAX_BOOST
    summary: string;
}

// ── Behavioral Layer Types (Category-Defining Agents) ──────────────────────
//
// Three new agents that model OTHER market participants rather than the market.
// Together they shift Sentinel from first-order ("is this mispriced?") to
// second/third-order reasoning ("WHICH cohort is wrong, WHY, and WHEN do they
// correct?"). See src/services/behavioralLayer.ts for the orchestrator.

/** The market-participant cohort taxonomy used by Other-Mind and Cohort Sequencer. */
export type MarketParticipantCohort =
    | 'retail_yolo'           // r/wallstreetbets-style speculative retail
    | 'retail_informed'       // experienced retail, dividend/value focus
    | 'quant_factor'          // systematic factor funds (AQR, Two Sigma)
    | 'long_only_pension'     // pension funds, long-duration allocators
    | 'hedge_fund_tactical'   // discretionary tactical hedge funds
    | 'hedge_fund_macro'      // global macro hedge funds
    | 'market_maker_dealer'   // options dealers, delta-hedging flow
    | 'corporate_insider'     // insiders, buybacks, stock comp vesting
    | 'passive_index_flow'    // index funds, forced rebalances
    | 'unknown';              // escape hatch when the agent cannot classify

/** Other-Mind Simulation agent output — capability #5. */
export interface OtherMindResult {
    reasoning: string;
    counterparty_cohort: MarketParticipantCohort;
    counterparty_latency: 'minutes' | 'hours' | 'days' | 'weeks' | 'months';
    counterparty_dominant_bias: string;       // free-text, e.g. "loss aversion"
    counterparty_trigger: string;             // mechanical trigger that forced their side
    counterparty_best_case: string;           // strongest argument FOR their side (steelman)
    counterparty_weakness: string;            // falsifiable flaw in their reasoning
    correction_catalyst: string;              // what specific event/decay forces correction
    correction_window_days: number;
    edge_clarity: number;                     // 0-100 — 0 = can't name error, 100 = unambiguous
    emit_recommendation: 'emit' | 'defer' | 'suppress';
}

/** Narrative Lifecycle agent output — capability #3. */
export type NarrativePhase =
    | 'birth'
    | 'early_amplification'
    | 'late_amplification'
    | 'saturation'
    | 'exhaustion'
    | 'reversal';

export interface NarrativeLifecycleResult {
    reasoning: string;
    dominant_narrative: string;               // one-line story summary
    lifecycle_phase: NarrativePhase;
    narrative_age_days: number;               // days since first appearance (estimated)
    mentions_last_14d: number;                // raw count from market_events
    marginal_new_info_rate: number;           // 0-100; 0=pure repetition
    saturation_score: number;                 // 0-100 composite
    direction_pressure: 'long_supportive' | 'short_supportive' | 'neutral';
    confidence_adjustment: number;            // signed, applied via applyBoundedAdjustment
}

/** Cohort Reaction Sequencer agent output — capability #1. */
export type CohortReaction =
    | 'buy_aggressive'
    | 'buy_passive'
    | 'sell_aggressive'
    | 'sell_passive'
    | 'hedge'
    | 'ignore';

export type CohortSequenceStage =
    | 'pre_reaction'
    | 'first_wave'
    | 'overshoot'
    | 'rebalancing'
    | 'post_correction';

export interface CohortReactionStep {
    cohort: MarketParticipantCohort;
    reaction: CohortReaction;
    latency: 'minutes' | 'hours' | 'days' | 'weeks';
    intensity: 'low' | 'medium' | 'high' | 'extreme';
    is_mispricing: boolean;
}

export interface CohortSequenceResult {
    reasoning: string;
    reaction_sequence: CohortReactionStep[];
    primary_mispricer: MarketParticipantCohort;
    sequence_stage: CohortSequenceStage;
    correction_catalyst: string;
    confidence_in_sequence: number;           // 0-100
    confidence_adjustment: number;            // signed
}

// ── Decision Quality Index (DQI) Types ──────────────────────────────────────

/** Component breakdown of the DQI score */
export interface DQIComponents {
    bias_audit: number;
    noise_convergence: number;
    pre_mortem_resilience: number;
    twin_consensus: number;
    self_critique_quality: number;
    cross_source_quality: number;
    rpd_pattern_match: number;
    toxic_combination: number;
}

export type DQITier = 'elite' | 'high' | 'moderate' | 'low' | 'rejected';

/** Output from the Decision Quality Index calculator */
export interface DQIResult {
    score: number;              // 0-100 composite
    components: DQIComponents;
    quality_tier: DQITier;
}
