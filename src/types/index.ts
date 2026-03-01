/**
 * Sentinel — Core Type Definitions
 *
 * Re-exports all domain types from their respective modules.
 */

export type { Signal, SignalType, SignalStatus, BiasClassification, SanityCheckResult, HistoricalMatchResult, TradingSignal } from './signals';
export type { MarketEvent, EventType, DetectionResult, TickerContext } from './events';
export type { Quote, PriceBar, MarketSnapshot, CompanyInfo } from './market';
export type { AgentResult, AgentOutputs, AnalysisResult, ScanResult, ScannerStatus } from './agents';
export type { Database } from './database';
