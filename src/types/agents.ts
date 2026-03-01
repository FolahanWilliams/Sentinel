/**
 * Sentinel — Agent Pipeline Types
 */

export interface AgentResult<T> {
    success: boolean;
    data: T | null;
    error: string | null;
    duration_ms: number;
    tokens_used: number;
    model_used: string;
    grounded_search_used: boolean;
}

export interface AgentOutputs {
    event_detection: AgentResult<import('./events').DetectionResult>;
    bias_classification: AgentResult<import('./signals').BiasClassification> | null;
    sanity_check: AgentResult<import('./signals').SanityCheckResult> | null;
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
