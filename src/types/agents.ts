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

export interface SanityCheckResult {
    reasoning: string;
    passes_sanity_check: boolean;
    risk_score: number;
    fatal_flaws: string[];
    macro_obstacles: string;
    counter_thesis: string;
}

/** Individual bias finding from the Bias Detective agent */
export interface BiasDetectiveFinding {
    bias_name: string;
    severity: 1 | 2 | 3;        // 1=mild, 2=moderate, 3=severe
    evidence: string;            // specific sentence(s) from the thesis that expose this bias
    penalty: number;             // confidence penalty applied for this finding
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
