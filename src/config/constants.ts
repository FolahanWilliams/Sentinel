/**
 * Sentinel — Application Constants
 *
 * Centralized configuration values, defaults, and magic numbers.
 */

// ===========================
// AI MODEL
// ===========================
export const GEMINI_MODEL = 'gemini-3-flash-preview';
export const GEMINI_MODEL_LITE = 'gemini-3.1-flash-lite';

// ===========================
// SCANNER DEFAULTS
// ===========================
export const DEFAULT_SCAN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_MIN_CONFIDENCE = 60;
export const DEFAULT_MIN_PRICE_DROP_PCT = -2.5; // Lowered from -5.0 to catch more candidates
export const DEFAULT_MIN_PRICE_RISE_PCT = 2.5; // Min % gain for bullish catalyst detection
export const DEFAULT_MIN_VOLUME_MULTIPLIER = 2.0;
export const CONFIDENCE_FLOOR = 30; // Absolute minimum after all adjustments
export const CONFIDENCE_GATE_OVERREACTION = 65; // Lowered from 75 — red team + critique still filter
export const CONFIDENCE_GATE_CATALYST = 65; // Initial gate for bullish catalyst signal
export const CONFIDENCE_GATE_CONTAGION = 70; // Initial gate for contagion signal
export const CONFIDENCE_GATE_CRITIQUE = 50; // Floor after self-critique pass
export const CONFIDENCE_EXPIRY_THRESHOLD = 40; // Below this, signal is expired by decay
export const SEVERITY_THRESHOLD = 3; // Lowered from 4 to let more events into deep analysis
export const DEFAULT_SIGNAL_TIMEFRAME_DAYS = 10; // Default expected holding period

// ===========================
// MARKET MOOD THRESHOLDS
// ===========================
export const VIX_VOLATILITY_THRESHOLD = 25;
export const FEAR_GREED_BULLISH_THRESHOLD = 60;
export const FEAR_GREED_BEARISH_THRESHOLD = 40;

// ===========================
// SCANNER SETTINGS DEFAULTS
// ===========================
export const DEFAULT_ACTIVE_SECTORS = ['Tech', 'Bio', 'Semi', 'AI'] as const;
export const DEFAULT_PAPER_MODE = true;

// ===========================
// RATE LIMITS
// ===========================
export const GEMINI_MAX_CALLS_PER_MINUTE = 30;
export const MARKET_DATA_MAX_CALLS_PER_MINUTE = 5;

// ===========================
// CACHING TTLs (milliseconds)
// ===========================
export const CACHE_TTL_QUOTE = 60 * 1000;           // 60 seconds
export const CACHE_TTL_COMPANY_INFO = 24 * 60 * 60 * 1000; // 24 hours
export const CACHE_TTL_HISTORICAL = 60 * 60 * 1000;  // 1 hour
export const CACHE_TTL_FUNDAMENTALS = 6 * 60 * 60 * 1000; // 6 hours
export const CACHE_TTL_MARKET_SNAPSHOT = 10 * 60 * 1000; // 10 minutes
export const CACHE_TTL_AI_CONTENT = 30 * 60 * 1000;     // 30 minutes
export const CACHE_TTL_TICKER_ANALYSIS = 15 * 60 * 1000; // 15 minutes
export const CACHE_TTL_UPCOMING_EVENTS = 60 * 60 * 1000; // 1 hour
export const CACHE_TTL_MARKET_TRENDS = 30 * 60 * 1000;  // 30 minutes

// ===========================
// OUTCOME TRACKING WINDOWS (days)
// ===========================
export const OUTCOME_WINDOWS = [1, 5, 10, 30] as const;
export const SIGNAL_EXPIRY_DAYS = 30;

// ===========================
// POSITION SIZING DEFAULTS
// ===========================
export const DEFAULT_STARTING_CAPITAL = 10_000;
export const DEFAULT_KELLY_FRACTION = 0.25; // Quarter Kelly
export const DEFAULT_MAX_POSITION_PCT = 10;
export const DEFAULT_MAX_EXPOSURE_PCT = 50;
export const DEFAULT_MAX_SECTOR_PCT = 25;
export const DEFAULT_RISK_PER_TRADE_PCT = 2;
export const DEFAULT_MAX_CONCURRENT_POSITIONS = 5;

// ===========================
// BUDGET DEFAULTS (USD)
// ===========================
export const DEFAULT_DAILY_BUDGET = 2.0;
export const DEFAULT_MONTHLY_BUDGET = 30.0;
export const BUDGET_ALERT_THRESHOLD_PCT = 80;

// ===========================
// RSS DEFAULTS
// ===========================
export const RSS_FETCH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
export const RSS_MAX_ARTICLE_AGE_HOURS = 24;
export const RSS_RELEVANCE_THRESHOLD = 0.3;

// ===========================
// NOTIFICATION DEFAULTS
// ===========================
export const DEFAULT_NOTIFICATION_CONFIDENCE_THRESHOLD = 70;
export const NOTIFICATION_AUTO_CLOSE_MS = 30 * 1000; // 30 seconds
export const MAX_NOTIFICATION_HISTORY = 50;

// ===========================
// UI
// ===========================
export const SIGNAL_FEED_PAGE_SIZE = 50;
export const MAX_ACTIVE_ALERTS = 5;

// ===========================
// MARKET HOURS (US Eastern)
// ===========================
export const MARKET_HOURS = {
    preMarketOpen: { hour: 4, minute: 0 },
    marketOpen: { hour: 9, minute: 30 },
    marketClose: { hour: 16, minute: 0 },
    afterHoursClose: { hour: 20, minute: 0 },
    timezone: 'America/New_York',
} as const;

// ===========================
// CONVICTION GUARDRAILS (Buffett/Lynch)
// ===========================
export const CONVICTION_HIGH_THRESHOLD = 85; // High-conviction filter cutoff
export const CONVICTION_ELITE_THRESHOLD = 90; // Elite sizing boost threshold
export const CONVICTION_LOW_THRESHOLD = 70; // Below this = reduced sizing
export const MARGIN_OF_SAFETY_MIN_PCT = 10; // Min discount from 52w high
export const MAX_CYCLICAL_EXPOSURE_PCT = 25; // Max portfolio in cyclicals
export const MAX_LOW_MOAT_EXPOSURE_PCT = 15; // Max portfolio in moat <5
export const PEG_WARNING_THRESHOLD = 1.5; // Portfolio-level PEG alert

// ===========================
// LYNCH CATEGORY LABELS
// ===========================
export const LYNCH_CATEGORY_LABELS: Record<string, string> = {
    fast_grower: 'Fast Grower',
    stalwart: 'Stalwart',
    turnaround: 'Turnaround',
    asset_play: 'Asset Play',
    cyclical: 'Cyclical',
    slow_grower: 'Slow Grower',
} as const;

// ===========================
// BIAS TAXONOMY (15 cognitive biases)
// ===========================
export const BIAS_TYPES = [
    // Core market biases (original 10)
    'overreaction',
    'anchoring',
    'herding',
    'loss_aversion',
    'availability',
    'recency',
    'confirmation',
    'disposition_effect',
    'framing',
    'representativeness',
    // Extended taxonomy (Phase 2 — Bias Detective)
    'narrative_fallacy',      // constructing a plausible story from sparse data
    'status_quo_bias',        // preference to maintain current holdings/thesis
    'overconfidence',         // excessive certainty in own analysis quality
    'regret_aversion',        // avoiding decisions that may cause regret
    'endowment_effect',       // overvaluing existing positions vs identical new ones
] as const;

export type BiasType = (typeof BIAS_TYPES)[number];

// ===========================
// BIAS DETECTIVE THRESHOLDS
// ===========================
/** Severity at or above which a bias triggers a confidence penalty */
export const BIAS_DETECTIVE_SEVERITY_THRESHOLD = 2; // 1=mild, 2=moderate, 3=severe
/** Penalty applied per severe bias detected (cumulative, but capped) */
export const BIAS_DETECTIVE_PENALTY_PER_SEVERE = 8;
/** Penalty applied per moderate bias detected */
export const BIAS_DETECTIVE_PENALTY_PER_MODERATE = 4;
/** Maximum cumulative penalty the Bias Detective can apply */
export const BIAS_DETECTIVE_MAX_PENALTY = 25;

// ===========================
// DECISION TWIN SIMULATION
// ===========================
/** Confidence boost when all 3 personas unanimously vote TAKE */
export const TWIN_UNANIMOUS_TAKE_BOOST = 8;
/** Boost when 2 TAKE + 1 CAUTION */
export const TWIN_MAJORITY_TAKE_BOOST = 3;
/** Penalty per SKIP verdict */
export const TWIN_SKIP_PENALTY = 10;
/** Max cumulative penalty from Decision Twins */
export const TWIN_MAX_PENALTY = 25;

// ===========================
// NOISE-AWARE CONFIDENCE
// ===========================
/** Std-dev above which the 3-judge panel is considered divergent → penalty */
export const NOISE_JUDGE_DIVERGENCE_THRESHOLD = 15;
/** Std-dev below which the panel is considered convergent → small boost */
export const NOISE_JUDGE_CONVERGENCE_THRESHOLD = 5;
/** Confidence penalty when judges diverge */
export const NOISE_JUDGE_DIVERGENCE_PENALTY = 10;
/** Confidence boost when judges strongly converge */
export const NOISE_JUDGE_CONVERGENCE_BOOST = 3;

// ===========================
// CATEGORY COLOR MAP
// ===========================
export const CATEGORY_COLORS: Record<string, string> = {
    technology: '#4a9eff',
    biotech: '#00d4aa',
    semiconductors: '#a855f7',
    ai_cloud: '#7c3aed',
    cybersecurity: '#06b6d4',
    fintech: '#f59e0b',
    energy: '#ef4444',
    healthcare: '#10b981',
    consumer: '#ec4899',
    industrial: '#6366f1',
} as const;

// ===========================
// SECTOR DEFINITIONS
// ===========================
export const SECTORS = [
    'Technology',
    'Biotech',
    'Semiconductors',
    'AI/Cloud',
    'Cybersecurity',
    'Fintech',
] as const;

export type Sector = (typeof SECTORS)[number];
