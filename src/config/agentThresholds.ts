/**
 * Sentinel — Centralized Agent Thresholds
 *
 * All magic numbers and configurable thresholds for the agent intelligence
 * pipeline, extracted from scattered service files into one place.
 *
 * Changing a value here propagates to all consumers without hunting
 * through scanner.ts, proactiveThesisEngine.ts, etc.
 */

// ===========================
// SCANNER COVERAGE CAPS
// ===========================
/** Max tickers for fast scan mode */
export const FAST_SCAN_TICKER_LIMIT = 5;
/** Max tickers for grounded search */
export const GROUNDED_SEARCH_MAX_TICKERS = 10;
/** Max tickers for earnings calendar search */
export const EARNINGS_CALENDAR_MAX_TICKERS = 8;
/** Max proactive theses generated per scan */
export const PROACTIVE_THESIS_MAX_CANDIDATES = 5;
/** Max earnings anticipation candidates per scan */
export const EARNINGS_ANTICIPATION_MAX_CANDIDATES = 5;
/** Max contagion satellites evaluated per epicenter */
export const CONTAGION_MAX_SATELLITES = 3;
/** Max sector rotation events injected per scan */
export const ROTATION_MAX_INJECTED_EVENTS = 5;

// ===========================
// PROACTIVE THESIS ENGINE
// ===========================
/** RSI below this triggers oversold setup detection */
export const PROACTIVE_RSI_OVERSOLD = 30;
/** RSI above this triggers overbought setup detection */
export const PROACTIVE_RSI_OVERBOUGHT = 70;
/** Z-score below this triggers mean-reversion detection */
export const PROACTIVE_Z_SCORE_EXTREME = -2.0;
/** Peer divergence (%) above this triggers dislocation detection */
export const PROACTIVE_PEER_DIVERGENCE_PCT = 5.0;
/** Minimum confidence for proactive thesis signals */
export const PROACTIVE_MIN_CONFIDENCE = 55;

// ===========================
// EARNINGS ANTICIPATION
// ===========================
/** Earliest days before earnings to generate anticipation signals */
export const EARNINGS_ANTICIPATION_MIN_DAYS = 2;
/** Latest days before earnings to generate anticipation signals */
export const EARNINGS_ANTICIPATION_MAX_DAYS = 7;
/** RSI threshold for oversold-into-earnings setup */
export const EARNINGS_ANTICIPATION_RSI_OVERSOLD = 35;
/** Min confidence for earnings anticipation signals */
export const EARNINGS_ANTICIPATION_MIN_CONFIDENCE = 60;

// ===========================
// FEAR & GREED ADJUSTMENTS
// ===========================
/** Score at/below triggers extreme fear contrarian boost */
export const FEAR_GREED_EXTREME_FEAR_THRESHOLD = 25;
/** Score at/below triggers mild fear boost */
export const FEAR_GREED_FEAR_THRESHOLD = 40;
/** Score at/above triggers extreme greed penalty */
export const FEAR_GREED_EXTREME_GREED_THRESHOLD = 75;
/** Score at/above triggers mild greed penalty */
export const FEAR_GREED_GREED_THRESHOLD = 60;
/** Confidence boost at extreme fear */
export const FEAR_GREED_EXTREME_FEAR_BOOST = 10;
/** Confidence boost at fear */
export const FEAR_GREED_FEAR_BOOST = 5;
/** Confidence penalty at extreme greed */
export const FEAR_GREED_EXTREME_GREED_PENALTY = -10;
/** Confidence penalty at greed */
export const FEAR_GREED_GREED_PENALTY = -3;

// ===========================
// FUNDAMENTALS THRESHOLDS
// ===========================
/** Debt/equity above this triggers leverage penalty */
export const FUNDAMENTALS_HIGH_LEVERAGE_DE = 3;
/** Profit margin below this triggers negative-margins penalty */
export const FUNDAMENTALS_NEGATIVE_MARGIN = -0.1;
/** P/E ratio multiplier vs sector average that triggers penalty */
export const FUNDAMENTALS_EXTREME_PE_MULT = 3;
/** Penalty for high leverage */
export const FUNDAMENTALS_LEVERAGE_PENALTY = -10;
/** Penalty for negative margins */
export const FUNDAMENTALS_MARGIN_PENALTY = -10;
/** Penalty for extreme P/E vs sector */
export const FUNDAMENTALS_PE_PENALTY = -5;

// ===========================
// ATR STOP-LOSS MULTIPLIERS
// ===========================
/** ATR multiplier for strong confluence (≥75) */
export const ATR_MULT_STRONG_CONFLUENCE = 1.0;
/** ATR multiplier for good confluence (≥55) */
export const ATR_MULT_GOOD_CONFLUENCE = 1.25;
/** ATR multiplier for moderate confluence (≥35) */
export const ATR_MULT_MODERATE_CONFLUENCE = 1.75;
/** ATR multiplier for weak confluence (<35) */
export const ATR_MULT_WEAK_CONFLUENCE = 2.0;

// ===========================
// CALIBRATION
// ===========================
/** Minimum outcomes before calibration curve is trusted */
export const CALIBRATION_MIN_OUTCOMES = 10;
/** Minimum samples per bucket before using bucket-specific win rate */
export const CALIBRATION_MIN_BUCKET_SAMPLES = 3;
/** Haircut applied to raw AI confidence when calibration data is insufficient */
export const CALIBRATION_INSUFFICIENT_DATA_HAIRCUT = 0.8;

// ===========================
// A/B TESTING
// ===========================
/** Minimum outcomes per variant before concluding experiment */
export const AB_MIN_OUTCOMES_PER_VARIANT = 5;
/** P-value threshold for statistical significance */
export const AB_SIGNIFICANCE_THRESHOLD = 0.05;
/** Default traffic split (50/50) */
export const AB_DEFAULT_TRAFFIC_SPLIT = 0.5;
/** Default minimum sample size */
export const AB_DEFAULT_MIN_SAMPLE_SIZE = 20;

// ===========================
// EVENT SEVERITY
// ===========================
/** Default severity for injected high-impact articles */
export const INJECTED_ARTICLE_SEVERITY = 5;
/** Severity for sector rotation synthetic events */
export const ROTATION_EVENT_SEVERITY = 4;

// ===========================
// THESIS INVALIDATION DETECTOR
// ===========================
/** % below stop-loss before triggering price breach invalidation */
export const INVALIDATION_PRICE_BREACH_PCT = 2;
/** % below 200-SMA before triggering technical support break */
export const INVALIDATION_SUPPORT_BREAK_PCT = 3;
/** Max active signals to check per scan cycle */
export const INVALIDATION_MAX_SIGNALS_PER_CYCLE = 15;
/** Hours between re-checking the same signal */
export const INVALIDATION_COOLDOWN_HOURS = 4;

// ===========================
// OUTCOME NARRATIVE AGENT
// ===========================
/** Max narratives to generate per scan cycle */
export const NARRATIVE_MAX_SIGNALS_PER_CYCLE = 5;
/** Minimum absolute return (%) for a narrative to be worth generating */
export const NARRATIVE_MIN_RETURN_PCT = 1.0;

// ===========================
// PEER RELATIVE STRENGTH (Enhanced)
// ===========================
/** Relative strength (%) threshold to classify a move as idiosyncratic */
export const PEER_RS_IDIOSYNCRATIC_THRESHOLD = 2.0;
/** Ticker min change (%) to detect sector-wide move */
export const PEER_RS_SECTOR_WIDE_TICKER_MIN = 3.0;
/** Peer avg min change (%) to detect sector-wide move */
export const PEER_RS_SECTOR_WIDE_PEER_MIN = 2.0;
/** Relative strength (%) for strong divergence (full boost/penalty) */
export const PEER_RS_STRONG_DIVERGENCE = 3.0;
/** Max confidence boost for strong idiosyncratic underperformance */
export const PEER_RS_MAX_BOOST = 15;
/** Max confidence penalty for sector-wide moves (negative) */
export const PEER_RS_MAX_PENALTY = -12;
