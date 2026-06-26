/**
 * Sentinel — Master Scanner Execution Loop
 *
 * Orchestrates the full intelligence pipeline:
 * 1. Read RSS Feeds & Parse unstructured text into Events
 * 2. Cross-reference events against Watchlist
 * 3. Fetch pre/post market Market Data jumps
 * 4. Pass high-variance events to Overreaction / Contagion agents
 * 5. Pass surviving theses to the Red Team Sanity Check
 * 6. Save final high-conviction Signals to DB
 */

import { supabase } from '@/config/supabase';
import { MarketDataService } from './marketData';
import { AgentService, type MarketContext, type PriorAgentContext } from './agents';
import { GeminiService } from './gemini';
import { AlpacaService } from './alpaca';
import { NotificationService } from './notifications';
import { RSSReaderService } from './rssReader';
import { OutcomeTracker } from './outcomeTracker';
import { isBudgetExceeded } from '@/utils/costEstimator';
import { responseValidator } from '@/utils/responseValidator';
import { TechnicalAnalysisService } from './technicalAnalysis';
import { SelfCritiqueAgent } from './selfCritique';
import { SentimentDivergenceDetector } from './sentimentDivergence';
import { EarningsGuard } from './earningsGuard';
import { calculateWeightedRoi } from '@/utils/weightedRoi';
import { CorrelationGuard } from './correlationGuard';
import { BacktestValidator, type DynamicThresholds } from './backtestValidator';
import { OptionsFlowService } from './optionsFlowService';
import { AutoLearningService } from './autoLearningService';
import { SignalDecayEngine } from './signalDecay';
import { ConfidenceCalibrator } from './confidenceCalibrator';
import { DynamicCalibrator } from './dynamicCalibrator';
import { ConflictDetector } from './conflictDetector';
import { PeerStrengthService } from './peerStrengthService';
import { SemanticDeduplicator } from './semanticDeduplicator';
import { PriceCorrelationMatrix } from './priceCorrelationMatrix';
import { PortfolioAwareSizer } from './portfolioAwareSizer';
import { ConvictionGuardrails } from './convictionGuardrails';
import { MultiTimeframeService } from './multiTimeframe';
import { CrossSourceValidator } from './crossSourceValidator';
import { RetailVsNewsSentimentDetector } from './retailVsNewsSentiment';
import { SourceDiversityScorer } from './sourceDiversityScorer';
import { NoiseAwareConfidenceService } from './noiseAwareConfidence';
import { DecisionTwinService } from './decisionTwin';
import { SWOTAnalysisService } from './swotAnalysis';
import { fetchExternalSentiment, buildScanContext } from './scannerPipeline/contextStage';
import { ProactiveThesisEngine } from './proactiveThesisEngine';
import { EarningsAnticipationAgent } from './earningsAnticipation';
import { AgentContextBus } from './agentContextBus';
import { ABTestingFramework } from './abTestingFramework';
import { enrichWithMitigations } from './biasMitigation';
import { ThesisInvalidationDetector } from './thesisInvalidationDetector';
import { OutcomeNarrativeAgent } from './outcomeNarrativeAgent';
import { PreMortemAgent } from './preMortemAgent';
import { ToxicCombinationDetector, type ToxicContextFlags } from './toxicCombinationDetector';
import { RPDPatternMatcher } from './rpdPatternMatcher';
import { BeneficialPatternDetector, type BeneficialContext } from './beneficialPatternDetector';
import { DecisionQualityIndex, type DQIInputs } from './decisionQualityIndex';
import { MarketWideScreener } from './marketWideScreener';
import { DEFAULT_MIN_PRICE_RISE_PCT, CONFIDENCE_GATE_OVERREACTION, CONFIDENCE_GATE_CATALYST, CONFIDENCE_GATE_CONTAGION, CONFIDENCE_GATE_CRITIQUE, CONFIDENCE_FLOOR, CONFIDENCE_CEILING, MAX_CUMULATIVE_PENALTY, MAX_CUMULATIVE_BOOST, SWOT_WEAKNESS_IMBALANCE_PENALTY, SWOT_SEVERE_IMBALANCE_PENALTY, ROTATION_FAVORED_SECTOR_BOOST, ROTATION_DISFAVORED_SECTOR_PENALTY, ROTATION_HEADWIND_PENALTY, SEVERITY_THRESHOLD, DQI_MINIMUM_THRESHOLD, SCREENER_MIN_DOLLAR_VOLUME, DISCOVERY_FLAT_MOVE_PCT } from '@/config/constants';
import { SP500_TICKERS, FTSE100_TICKERS } from '@/config/tickerUniverse';
import { sanitizeUntrustedText } from '@/utils/promptSanitizer';
import { isDuplicateThesis } from '@/utils/thesisDedup';
import { runPrimaryWithSelfConsistency, SELF_CONSISTENCY_TEMP } from './selfConsistency';
import { runBehavioralLayer, type BehavioralLayerResult } from './behavioralLayer';
import { BEHAVIORAL_MIN_CONFIDENCE_GATE } from '@/config/constants';
import {
    FEAR_GREED_EXTREME_FEAR_THRESHOLD, FEAR_GREED_FEAR_THRESHOLD,
    FEAR_GREED_EXTREME_GREED_THRESHOLD, FEAR_GREED_GREED_THRESHOLD,
    FEAR_GREED_EXTREME_FEAR_BOOST, FEAR_GREED_FEAR_BOOST,
    FEAR_GREED_EXTREME_GREED_PENALTY, FEAR_GREED_GREED_PENALTY,
    FUNDAMENTALS_HIGH_LEVERAGE_DE, FUNDAMENTALS_NEGATIVE_MARGIN,
    FUNDAMENTALS_EXTREME_PE_MULT, FUNDAMENTALS_LEVERAGE_PENALTY,
    FUNDAMENTALS_MARGIN_PENALTY, FUNDAMENTALS_PE_PENALTY,
    ATR_MULT_STRONG_CONFLUENCE, ATR_MULT_GOOD_CONFLUENCE,
    ATR_MULT_MODERATE_CONFLUENCE, ATR_MULT_WEAK_CONFLUENCE,
} from '@/config/agentThresholds';
import type { MultiTimeframeResult } from './technicalAnalysis';
import type { AgentOutputsJson, LynchCategory } from '@/types/signals';
import type { Json } from '@/types/database';
import type { Quote } from '@/types/market';

// ---------------------------------------------------------------------------
// In-memory TTL cache for discoverTrendingTickers
// Grounded search calls are the most expensive ($0.50/M output tokens).
// Caching for 30 minutes avoids redundant discovery within the same session.
// ---------------------------------------------------------------------------
const DISCOVERY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
/**
 * A ticker surfaced by AI discovery, with the directional read needed to route it
 * to the correct primary agent (overreaction vs. bullish catalyst) downstream.
 * `direction` is the catalyst's expected price impact; `expectedMovePct` is the
 * recent move magnitude the model observed (null when it couldn't quantify it).
 */
interface DiscoveredTicker {
    ticker: string;
    reason: string;
    catalyst: string;
    direction: 'up' | 'down' | 'neutral';
    expectedMovePct: number | null;
}
let _discoveryCache: { result: DiscoveredTicker[]; expiresAt: number } | null = null;

/**
 * Best-effort sector lookup for a ticker from the known universe (S&P 500 + FTSE 100).
 * Returns undefined for tickers outside the curated lists — the agent's sector overlay
 * is optional, so a miss simply means no sector-specific prompt injection.
 */
function lookupSectorForTicker(ticker: string): string | undefined {
    const t = ticker.toUpperCase();
    const hit = [...SP500_TICKERS, ...FTSE100_TICKERS].find(x => x.ticker.toUpperCase() === t);
    return hit?.sector;
}

/**
 * Clamp confidence within bounds, respecting cumulative adjustment limits.
 * Returns the clamped confidence and the updated cumulative penalty/boost.
 */
function applyBoundedAdjustment(
    currentConfidence: number,
    adjustment: number,
    cumulativePenalty: number,
    cumulativeBoost: number,
): { confidence: number; cumulativePenalty: number; cumulativeBoost: number } {
    let effectiveAdj = adjustment;

    if (adjustment < 0) {
        // Check if cumulative penalty budget is exhausted
        const remainingPenaltyBudget = MAX_CUMULATIVE_PENALTY - cumulativePenalty;
        if (remainingPenaltyBudget <= 0) {
            return { confidence: currentConfidence, cumulativePenalty, cumulativeBoost };
        }
        // Cap this penalty to remaining budget
        effectiveAdj = Math.max(adjustment, -remainingPenaltyBudget);
        cumulativePenalty += Math.abs(effectiveAdj);
    } else if (adjustment > 0) {
        // Check if cumulative boost budget is exhausted
        const remainingBoostBudget = MAX_CUMULATIVE_BOOST - cumulativeBoost;
        if (remainingBoostBudget <= 0) {
            return { confidence: currentConfidence, cumulativePenalty, cumulativeBoost };
        }
        effectiveAdj = Math.min(adjustment, remainingBoostBudget);
        cumulativeBoost += effectiveAdj;
    }

    const newConfidence = Math.max(CONFIDENCE_FLOOR, Math.min(CONFIDENCE_CEILING, currentConfidence + effectiveAdj));
    return { confidence: newConfidence, cumulativePenalty, cumulativeBoost };
}

// ---------------------------------------------------------------------------
// Red Team hard gate
// ---------------------------------------------------------------------------
// Today's behavior: Red Team fails a signal only if `passes_sanity_check` is
// false. That gate is easy for the model to silently bypass when the thesis
// is ambiguously bad (it just returns passes_sanity_check=true with a middling
// risk score).
//
// New behavior: in addition to passes_sanity_check, we apply a stricter check:
// if Red Team explicitly returns verdict='block', OR if risk_score is very
// low (<= 25 on a 0-100 scale where HIGHER is SAFER — see SANITY_CHECK_SCHEMA),
// we block the signal entirely. This makes Red Team's veto decisive.
//
// The verdict field is new; cached responses may not have it. In that case we
// fall back to risk_score + passes_sanity_check. See SanityCheckResult type.
// ---------------------------------------------------------------------------

/**
 * Red Team risk_score at or below this is treated as a hard block.
 *
 * Note: the risk_score convention in SANITY_CHECK_SCHEMA is "higher is safer".
 * 100 = perfectly safe, 0 = catastrophic. scanner.ts already uses `risk_score > 80`
 * to mean "low risk". A score ≤ 25 therefore indicates a trade the Red Team
 * considers deeply unsafe — block unconditionally.
 */
const RED_TEAM_BLOCK_SAFETY_THRESHOLD = 25;

/**
 * Decide whether a Red Team result should block signal emission entirely.
 * Safe to call with null/undefined data — returns allow=false with reason
 * "no red team data" so callers can treat that as a hard continue.
 */
function redTeamGate(
    sanity: import('@/types/agents').SanityCheckResult | null | undefined,
): { allow: boolean; reason: string } {
    if (!sanity) {
        return { allow: false, reason: 'no red team data' };
    }
    // Verdict is authoritative when present.
    if (sanity.verdict === 'block') {
        return { allow: false, reason: `verdict=block (safety=${sanity.risk_score})` };
    }
    // Risk score fallback — applies even when verdict=allow if the safety score
    // is catastrophic. Remember: higher risk_score = safer.
    if (typeof sanity.risk_score === 'number' && sanity.risk_score <= RED_TEAM_BLOCK_SAFETY_THRESHOLD) {
        return { allow: false, reason: `risk_score=${sanity.risk_score} ≤ ${RED_TEAM_BLOCK_SAFETY_THRESHOLD} (unsafe)` };
    }
    return { allow: true, reason: sanity.verdict || `safety=${sanity.risk_score}` };
}

/**
 * Per-ticker result of a discovery scan. `verdict` says whether the ticker
 * produced a signal, was rejected by a gauntlet stage, lacked data, or errored;
 * `stage` + `reason` make the rejection auditable in the UI (the moat, made visible).
 */
export interface ScanOutcome {
    ticker: string;
    catalyst?: string;
    verdict: 'signal' | 'rejected' | 'no_data' | 'error';
    stage: string | null;
    reason: string;
    signals: number;
}

export class ScannerService {

    /**
     * Check if a ticker has been scanned for a high-priority event in the last 24 hours.
     * Prevents redundant AI analysis and saves API credits.
     */
    private static async checkScanCooldown(ticker: string, eventType: string): Promise<boolean> {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from('signals')
            .select('id')
            .eq('ticker', ticker.toUpperCase())
            .eq('signal_type', eventType)
            .gt('created_at', twentyFourHoursAgo)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error(`[Scanner] Cooldown check failed for ${ticker}:`, error.message);
            return false;
        }

        return !!data; // Return true if a signal was already generated recently
    }

    /**
     * 200-SMA Guard: Blocks "Long" signals in a crisis regime if the stock is below its 200-day average.
     * Statistically, going long on downtrending stocks in a crash is high-risk/low-win-rate.
     */
    private static checkSMAGuard(
        direction: 'long' | 'short',
        taSnapshot: any,
        marketRegime: string
    ): { blocked: boolean; reason: string } {
        if (!taSnapshot) return { blocked: false, reason: '' };

        const currentPrice = taSnapshot.currentPrice || (taSnapshot.bollingerPosition !== undefined ? taSnapshot.sma50 : null);
        const sma200 = taSnapshot.sma200;

        if (direction === 'long' && marketRegime === 'CRISIS' && sma200 && currentPrice < sma200) {
            return {
                blocked: true,
                reason: '200-SMA Guard: Blocking long signal in CRISIS regime for stock in long-term downtrend.'
            };
        }

        return { blocked: false, reason: '' };
    }

    /**
     * Ensure a ticker exists in the watchlist table for the current user.
     * Uses select-then-insert to avoid partial-index ON CONFLICT issues.
     */
    private static async ensureWatchlistEntry(ticker: string): Promise<void> {
        const upperTicker = ticker.toUpperCase();
        try {
            const { data: existing } = await supabase
                .from('watchlist')
                .select('id')
                .eq('ticker', upperTicker)
                .limit(1)
                .maybeSingle();

            if (existing) return; // Already exists for this user (RLS-scoped)

            const { error } = await supabase.from('watchlist').insert({
                ticker: upperTicker,
                company_name: upperTicker,
                sector: 'Unknown',
                is_active: true,
                notes: 'Auto-added by AI discovery scan'
            });
            // Ignore duplicate key errors (race condition between select and insert)
            if (error && !error.message.includes('duplicate')) {
                console.warn(`[Scanner] Failed to ensure watchlist entry for ${ticker}:`, error.message);
            }
        } catch (err) {
            console.warn(`[Scanner] ensureWatchlistEntry failed for ${ticker}:`, err);
        }
    }

    /**
     * Smart Scan Prioritization — rank tickers by urgency.
     * Higher priority = more recent events + higher win rate + more RSS mentions
     * + News Intelligence (sentinel_articles) high-impact article mentions.
     */
    static async prioritizeTickers(tickers: { ticker: string; sector: string }[]): Promise<{ ticker: string; sector: string; priority: number; prioritySources: string[] }[]> {
        const tickerNames = tickers.map(t => t.ticker);
        
        try {
            // Attempt to use the optimized RPC function
            // Define the expected type from the RPC
            type TickerPriorityStats = {
                ticker: string;
                events: number;
                signals: number;
                rss: number;
                sentinel_total: number;
                sentinel_high_impact: number;
                wins: number;
                total_outcomes: number;
            };

            const { data: priorities, error } = await (supabase as any)
                .rpc('prioritize_tickers', { p_tickers: tickerNames }) as { data: TickerPriorityStats[] | null; error: any };

            if (error) throw error;

            if (priorities && priorities.length > 0) {
                const priorityMap = new Map<string, TickerPriorityStats>(
                    priorities.map((p) => [p.ticker, p])
                );
                
                return tickers.map(t => {
                    const defaultStats: TickerPriorityStats = { ticker: t.ticker, events: 0, signals: 0, rss: 0, sentinel_total: 0, sentinel_high_impact: 0, wins: 0, total_outcomes: 0 };
                    const stats = priorityMap.get(t.ticker) || defaultStats;
                    
                    const winRateBonus = stats.total_outcomes > 0 ? (stats.wins / stats.total_outcomes) * 20 : 0;
                    const sentinelBoost = (stats.sentinel_high_impact * 50) + (stats.sentinel_total * 15);
                    const priority = (stats.events * 30) + (stats.rss * 10) + winRateBonus + sentinelBoost + 10;
                    
                    const sources: string[] = [];
                    if (stats.events > 0) sources.push(`${stats.events} events`);
                    if (stats.rss > 0) sources.push(`${stats.rss} RSS`);
                    if (stats.sentinel_total > 0) sources.push(`${stats.sentinel_total} intel (${stats.sentinel_high_impact} high)`);
                    if (stats.total_outcomes > 0) sources.push(`${Math.round((stats.wins / stats.total_outcomes) * 100)}% WR`);
                    
                    return { ...t, priority: Math.round(priority), prioritySources: sources };
                }).sort((a, b) => b.priority - a.priority);
            }
        } catch (err) {
            console.warn('[Scanner] RPC prioritize_tickers failed, falling back to basic priority:', err);
        }

        // Fallback: if RPC fails (e.g., migration not run yet), return base priority
        return tickers.map(t => ({
            ...t,
            priority: 10,
            prioritySources: ['Base Priority (Fallback)']
        }));
    }

    static getScanPhase(): 'pre_market' | 'market_open' | 'midday' | 'power_hour' | 'after_hours' | 'overnight' {
        const etTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false });
        const parts = etTime.split(':');
        const hourStr = parts[0] ?? '0';
        const minuteStr = parts[1] ?? '0';
        const hour = parseInt(hourStr, 10);
        const minute = parseInt(minuteStr, 10);
        const timeVal = hour + minute / 60.0;
        
        if (timeVal >= 4 && timeVal < 9.5) return 'pre_market';
        if (timeVal >= 9.5 && timeVal < 10.5) return 'market_open';
        if (timeVal >= 10.5 && timeVal < 14.5) return 'midday';
        if (timeVal >= 14.5 && timeVal < 16) return 'power_hour';
        if (timeVal >= 16 && timeVal < 20) return 'after_hours';
        return 'overnight';
    }

    /**
     * Run the screener subset of the scan pipeline.
     */
    static async runScreenerScan() {
        return this.runScan('screener');
    }

    /**
     * Run the master scan.
     */
    static async runScan(scanType: 'full' | 'fast' | 'screener' = 'full') {
        const startTime = Date.now();
        const currentScanPhase = this.getScanPhase();
        let eventsFound = 0;
        let signalsGenerated = 0;
        const skippedTickers: string[] = [];

        console.log(`[Scanner] Initiating ${scanType.toUpperCase()} scan...`);

        try {
            // 1. Log the start of the scan
            const { data: scanLog, error: logErr } = await supabase
                .from('scan_logs')
                .insert({
                    scan_type: scanType,
                    status: 'running',
                    duration_ms: 0,
                    tickers_scanned: 0,
                    events_detected: 0,
                    signals_generated: 0,
                    estimated_cost_usd: 0,
                    // scan_phase: currentScanPhase // Removed to support older schemas
                } as any)
                .select('id')
                .single();

            if (logErr) throw logErr;

            // 2. Fetch Active Watchlist
            const { data: watchlist } = await supabase
                .from('watchlist')
                .select('ticker, sector')
                .eq('is_active', true);

            if (!watchlist || watchlist.length === 0) {
                throw new Error('Watchlist is empty. Add tickers first.');
            }

            // Budget gate — skip scan if daily budget exhausted
            // Check BEFORE any API-consuming operations (RSS sync, news, sentiment)
            const overBudget = await isBudgetExceeded();
            if (overBudget) {
                console.warn('[Scanner] Daily API budget exceeded. Skipping scan.');
                if (scanLog) {
                    await supabase.from('scan_logs').update({
                        status: 'completed',
                        error_message: 'Skipped: daily budget exceeded',
                        duration_ms: Date.now() - startTime,
                    }).eq('id', scanLog.id);
                }
                return { success: true, summary: 'Scan skipped: daily budget exceeded.' };
            }

            let tickers: string[] = [];
            let tickersToScan: any[] = [];
            const extraction: { success: boolean; data: { events: any[] } | null } = { success: true, data: { events: [] } };
            const actionableArticles: any[] = [];
            
            if (scanType === 'screener') {
                const anomalies = await MarketWideScreener.runScreener();
                if (anomalies.length === 0) {
                    // Terminal-state the scan_log before the early return, else the row is
                    // stuck at status='running' forever (mirrors the budget-gate exit above).
                    if (scanLog) {
                        await supabase.from('scan_logs').update({
                            status: 'completed',
                            error_message: 'Completed: No anomalies found',
                            duration_ms: Date.now() - startTime,
                        }).eq('id', scanLog.id);
                    }
                    return { success: true, summary: 'Scan completed: No anomalies found.' };
                }
                tickers = anomalies.map(a => a.ticker);
                tickersToScan = anomalies.map(a => ({ ticker: a.ticker }));
                extraction.data!.events = anomalies;
            } else {
                // 3. Sync RSS Feeds + Google News via Gemini (Feed the beast)
                // Moved AFTER budget gate to prevent spending quota when over budget
                await RSSReaderService.syncAllFeeds();

                // Smart Scan Prioritization — rank tickers by urgency
                const prioritized = await this.prioritizeTickers(watchlist);
                const maxTickers = scanType === 'fast' ? Math.min(5, prioritized.length) : prioritized.length;
                tickersToScan = prioritized.slice(0, maxTickers);
                tickers = tickersToScan.map(w => w.ticker);

                console.log(`[Scanner] Prioritized ${tickers.length} tickers:`, tickersToScan.map(t => {
                    const src = t.prioritySources && t.prioritySources.length > 0 ? ` [${t.prioritySources.join(', ')}]` : '';
                    return `${t.ticker}(${t.priority || 0}${src})`;
                }).join(', '));
            }

            // 3a–3g. Build scan context (external sentiment, regime, thresholds, etc.)
            await fetchExternalSentiment(tickers);
            const {
                perfContext, regimeResult, regimeCtx,
                fearGreedScore, fearGreedRating,
                sectorRotationCtx, rotationSnapshot,
                adaptiveMinConfidence, adaptiveMinPriceDrop,
                autoLearnWeights,
            } = await buildScanContext();

            // 3h. Dynamic Threshold Calibration — adjust confidence gates based on signal type win rates
            const signalTypeThresholds: Record<string, DynamicThresholds> = {};
            try {
                const signalTypes = ['long_overreaction', 'bullish_catalyst', 'sector_contagion', 'earnings_overreaction'];
                for (const st of signalTypes) {
                    signalTypeThresholds[st] = await BacktestValidator.getDynamicThresholds(st, adaptiveMinConfidence, Math.abs(adaptiveMinPriceDrop));
                }
                console.log('[Scanner] Dynamic thresholds by signal type:', Object.keys(signalTypeThresholds).map(k => `${k}: conf≥${signalTypeThresholds[k]?.recommendedMinConfidence ?? adaptiveMinConfidence}`).join(', '));
            } catch (err) {
                console.warn('[Scanner] Dynamic threshold calibration failed:', err);
            }

            // 4. Find fresh unparsed articles from the cache
            // In a real flow, we'd only grab articles from the last hour
            const { data: freshArticles } = await supabase
                .from('rss_cache')
                .select('*')
                .order('fetched_at', { ascending: false })
                .limit(30);

            // 5. Extract Events via Gemini Fast-Pass
            // Always initialize extraction so grounded search + earnings calendar can inject events

            if (scanType !== 'screener' && freshArticles && freshArticles.length > 0) {
                // A. Semantic Deduplication (TF-IDF cosine similarity — replaces Jaccard)
                const articlesWithDefaults = freshArticles.map(a => ({
                    ...a,
                    title: a.title || '',
                    description: a.description || '',
                }));
                const dedupResult = SemanticDeduplicator.deduplicate(articlesWithDefaults);
                const uniqueArticles = dedupResult.uniqueArticles;
                console.log(`[Scanner] TF-IDF dedup: ${freshArticles.length} → ${uniqueArticles.length} unique (${dedupResult.duplicatesRemoved} dupes removed).`);

                // B. Intelligent Pre-Filtering (Ask Gemini for actionable IDs)
                const preFilterPayload = uniqueArticles.map(a => ({
                    id: a.id,
                    title: a.title || 'No Title',
                    description: a.description || ''
                }));
                const filterRes = await AgentService.filterActionableNews(preFilterPayload);
                let actionableArticles = uniqueArticles;

                if (filterRes.success && filterRes.data?.actionable_ids) {
                    actionableArticles = uniqueArticles.filter(a => filterRes.data!.actionable_ids.includes(a.id));
                    console.log(`[Scanner] Pre-filter dropped ${uniqueArticles.length - actionableArticles.length} noise articles. Proceeding with ${actionableArticles.length}.`);
                } else {
                    console.warn(`[Scanner] Pre-filter failed or returned no IDs, falling back to all unique articles.`);
                }

                if (actionableArticles.length === 0) {
                    console.log('[Scanner] No actionable articles found after pre-filtering.');
                }

                const combinedText = actionableArticles.map(a => `${a.title}. ${a.description}`).join(' | ');
                if (actionableArticles.length > 0) {
                    const extractResult = await AgentService.extractEventsFromText(combinedText);
                    if (extractResult.success && extractResult.data?.events) {
                        extraction.data!.events.push(...extractResult.data.events);
                    }
                }
            } // end if (freshArticles)

            // From here on, grounded search + earnings calendar + event processing run
            // regardless of whether RSS articles were available.
            if (scanType !== 'screener') {
                // 5b. Per-Ticker Grounded Search — supplement RSS with Gemini Google Search
                // This ensures we always have fresh context, even when RSS lacks ticker-specific news.
                console.log(`[Scanner] Running per-ticker grounded search for ${tickers.length} tickers...`);
                for (const ticker of tickers.slice(0, 10)) { // Increased from 5 to 10 for broader coverage
                    try {
                        // Use grounded search WITHOUT responseSchema to avoid Supabase timeout.
                        // Google Search grounding + structured JSON causes double processing.
                        const tickerSearchResult = await GeminiService.generate<any>({
                            prompt: `Find the most significant news event for stock ticker ${ticker} from the last 48 hours. Focus on earnings, analyst ratings, product launches, M&A, regulatory decisions, tariffs, partnerships, or any catalyst that could move the stock price.

Severity scale (1-10):
- 1-3: Minor news, unlikely to move stock
- 4-5: Moderate news, could cause 2-5% move
- 6-7: Major news, likely 5-10% move
- 8-10: Extreme / breaking news, >10% move potential

Assign severity based on actual market impact potential. Earnings surprises, analyst rating changes, regulatory decisions, and M&A activity should typically be severity 5+.

Return your answer as a JSON object in this exact format (no markdown, no extra text):
{"events": [{"ticker": "${ticker}", "event_type": "earnings_miss|analyst_upgrade|product_launch|m_and_a|regulatory|tariff|partnership|price_movement|other", "headline": "one-line headline", "severity": 6}]}

If there is genuinely no major news, return: {"events": []}`,
                            requireGroundedSearch: true,
                            temperature: 0.1,
                            // NO responseSchema — let Gemini return plain text to avoid timeout
                        });

                        // Parse the plain text response manually
                        if (tickerSearchResult.success && tickerSearchResult.data) {
                            try {
                                const rawText = typeof tickerSearchResult.data === 'string'
                                    ? tickerSearchResult.data
                                    : JSON.stringify(tickerSearchResult.data);
                                // Extract JSON from the response (handle markdown code blocks)
                                const jsonMatch = rawText.match(/\{[\s\S]*"events"[\s\S]*\}/);
                                if (jsonMatch) {
                                    const parsed = JSON.parse(jsonMatch[0]);
                                    if (parsed.events && parsed.events.length > 0) {
                                        if (!extraction.data) extraction.data = { events: [] };
                                        if (!extraction.data.events) extraction.data.events = [];
                                        for (const ev of parsed.events) {
                                            ev.ticker = ticker;
                                            extraction.data.events.push(ev);
                                        }
                                        console.log(`[Scanner] Grounded search found ${parsed.events.length} events for ${ticker}`);
                                    }
                                }
                            } catch (parseErr) {
                                console.warn(`[Scanner] Grounded search parse failed for ${ticker} (non-fatal):`, parseErr);
                            }
                        }
                    } catch (gsErr) {
                        console.warn(`[Scanner] Grounded search failed for ${ticker} (non-fatal):`, gsErr);
                    }
                }

                // 5c. SENTINEL INTELLIGENCE BRIDGE — promote high-impact sentinel article signals to scanner events
                // This closes the gap between the news intelligence pipeline and the scanner pipeline.
                try {
                    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                    const { data: sentinelSignals } = await supabase
                        .from('sentinel_articles' as any)
                        .select('title, summary, impact, signals, affected_tickers')
                        .eq('impact', 'high')
                        .gte('processed_at', oneDayAgo)
                        .limit(20) as any;

                    if (sentinelSignals && sentinelSignals.length > 0) {
                        let injectedCount = 0;
                        for (const article of sentinelSignals) {
                            const articleSignals = Array.isArray(article.signals) ? article.signals : [];
                            for (const sig of articleSignals as Array<{ ticker?: string; type?: string; direction?: string; confidence?: number }>) {
                                if (!sig.ticker || !tickers.includes(sig.ticker.toUpperCase())) continue;
                                // Check if this ticker already has an event from RSS/grounded search
                                const alreadyHasEvent = extraction.data?.events?.some(
                                    (e: any) => e.ticker === sig.ticker?.toUpperCase()
                                );
                                if (alreadyHasEvent) continue;

                                if (!extraction.data) extraction.data = { events: [] };
                                if (!extraction.data.events) extraction.data.events = [];
                                extraction.data.events.push({
                                    ticker: sig.ticker.toUpperCase(),
                                    event_type: sig.type || 'other',
                                    headline: `[Intel] ${article.title?.slice(0, 120) || 'High-impact intelligence signal'}`,
                                    severity: 5, // High-impact articles default to moderate-high severity
                                });
                                injectedCount++;
                            }
                        }
                        if (injectedCount > 0) {
                            console.log(`[Scanner] Sentinel bridge injected ${injectedCount} events from ${sentinelSignals.length} high-impact articles.`);
                        }
                    }
                } catch (sentinelBridgeErr) {
                    console.warn('[Scanner] Sentinel bridge failed (non-fatal):', sentinelBridgeErr);
                }

                // 5d. EARNINGS CALENDAR PROACTIVE SCAN — inject events for tickers with earnings in next 3 days
                // This catches pre-earnings setups before news hits RSS
                try {
                    const earningsSearchTickers = tickers.slice(0, 8); // Cap to control cost
                    const earningsSearchResult = await GeminiService.generate<any>({
                        prompt: `Check which of these stock tickers have earnings reports scheduled in the next 3 business days: ${earningsSearchTickers.join(', ')}

For each ticker with upcoming earnings, provide:
- The expected earnings date
- Whether consensus expects a beat or miss (based on recent analyst revisions, whisper numbers, or sector trends)
- A severity score (5 = standard earnings, 6 = historically volatile earnings, 7 = pivotal quarter)

Return your answer as JSON (no markdown):
{"upcoming_earnings": [{"ticker": "AAPL", "earnings_date": "2026-03-10", "consensus_expectation": "beat expected due to strong iPhone demand", "severity": 6}]}

If none of these tickers have earnings in the next 3 days, return: {"upcoming_earnings": []}`,
                        requireGroundedSearch: true,
                        temperature: 0.1,
                    });

                    if (earningsSearchResult.success && earningsSearchResult.data) {
                        try {
                            const rawText = typeof earningsSearchResult.data === 'string'
                                ? earningsSearchResult.data
                                : JSON.stringify(earningsSearchResult.data);
                            const jsonMatch = rawText.match(/\{[\s\S]*"upcoming_earnings"[\s\S]*\}/);
                            if (jsonMatch) {
                                const parsed = JSON.parse(jsonMatch[0]);
                                if (parsed.upcoming_earnings?.length > 0) {
                                    if (!extraction.data) extraction.data = { events: [] };
                                    if (!extraction.data.events) extraction.data.events = [];
                                    for (const earning of parsed.upcoming_earnings) {
                                        if (!tickers.includes(earning.ticker)) continue;
                                        // Don't duplicate if we already have an event for this ticker
                                        const alreadyHas = extraction.data.events.some((e: any) => e.ticker === earning.ticker);
                                        if (alreadyHas) continue;

                                        extraction.data.events.push({
                                            ticker: earning.ticker,
                                            event_type: 'upcoming_earnings',
                                            headline: `[Earnings] ${earning.ticker} reports earnings ~${earning.earnings_date}. ${earning.consensus_expectation}`,
                                            severity: earning.severity || 5,
                                        });
                                    }
                                    console.log(`[Scanner] Earnings calendar injected ${parsed.upcoming_earnings.length} upcoming earnings events`);
                                }
                            }
                        } catch (parseErr) {
                            console.warn('[Scanner] Earnings calendar parse failed (non-fatal):', parseErr);
                        }
                    }
                } catch (earningsCalErr) {
                    console.warn('[Scanner] Earnings calendar scan failed (non-fatal):', earningsCalErr);
                }

                // 5e. SECTOR ROTATION EVENT INJECTION — when rotation is active,
                // inject synthetic events for watchlist tickers in favored sectors
                if (rotationSnapshot && rotationSnapshot.regime !== 'neutral') {
                    const SECTOR_KEYWORD_MAP: Record<string, string[]> = {
                        Technology: ['tech', 'software', 'saas', 'cloud', 'ai'],
                        Semiconductors: ['semi', 'chip', 'semiconductor'],
                        Biotech: ['bio', 'pharma', 'drug', 'therapeutics'],
                        Healthcare: ['health', 'medical', 'hospital'],
                        Energy: ['energy', 'oil', 'gas', 'solar', 'wind'],
                        Financials: ['bank', 'fintech', 'insurance', 'finance'],
                    };

                    // Determine which sector categories are favored
                    const favoredCategories: string[] = [];
                    if (rotationSnapshot.regime === 'risk_on') {
                        favoredCategories.push('Growth');
                    } else if (rotationSnapshot.regime === 'risk_off') {
                        favoredCategories.push('Defensive');
                    } else if (rotationSnapshot.regime === 'rotation') {
                        // Identify which category is leading
                        const avgs = [
                            { cat: 'Growth', avg: rotationSnapshot.growthAvg },
                            { cat: 'Defensive', avg: rotationSnapshot.defensiveAvg },
                            { cat: 'Cyclical', avg: rotationSnapshot.cyclicalAvg },
                        ].sort((a, b) => b.avg - a.avg);
                        if (avgs[0] && avgs[0].avg > 0.3) {
                            favoredCategories.push(avgs[0].cat);
                        }
                    }

                    if (favoredCategories.length > 0) {
                        // Map favored ETF categories to watchlist ticker sectors
                        const favoredSectorNames = rotationSnapshot.topInflows.map(s => s.name);
                        let rotationInjected = 0;
                        for (const t of tickersToScan) {
                            // Check if this ticker's sector matches a favored sector
                            const tickerSectorLower = (t.sector || '').toLowerCase();
                            const isFavored = favoredSectorNames.some(sectorName => {
                                const keywords = SECTOR_KEYWORD_MAP[sectorName] || [sectorName.toLowerCase()];
                                return keywords.some(kw => tickerSectorLower.includes(kw));
                            });

                            if (!isFavored) continue;

                            // Don't duplicate if we already have an event for this ticker
                            const alreadyHas = extraction.data?.events?.some(
                                (e: any) => e.ticker === t.ticker
                            );
                            if (alreadyHas) continue;

                            if (!extraction.data) extraction.data = { events: [] };
                            if (!extraction.data.events) extraction.data.events = [];
                            extraction.data.events.push({
                                ticker: t.ticker,
                                event_type: 'sector_tailwind',
                                headline: `[Rotation] ${rotationSnapshot.regime.replace('_', ' ').toUpperCase()}: Money flowing into ${favoredSectorNames.join(', ')}. ${t.ticker} in favored sector.`,
                                severity: 4, // Moderate — rotation is a slow signal
                            });
                            rotationInjected++;
                            if (rotationInjected >= 5) break; // Cap to avoid flooding
                        }
                        if (rotationInjected > 0) {
                            console.log(`[Scanner] Sector rotation injected ${rotationInjected} events (${rotationSnapshot.regime}, favoring ${favoredSectorNames.join(', ')})`);
                        }
                    }
                }

                // ── Item 6: Event-level deduplication (RSS + grounded search) ─────────────
                // After ALL injection sources, deduplicate events by (ticker, event_type),
                // keeping the highest-severity entry per pair to avoid double-billing.
                if (extraction.data?.events && extraction.data.events.length > 0) {
                    const deduped = new Map<string, any>();
                    for (const ev of extraction.data.events) {
                        const key = `${ev.ticker}:${ev.event_type}`;
                        const existing = deduped.get(key);
                        if (!existing || (ev.severity ?? 0) > (existing.severity ?? 0)) {
                            deduped.set(key, ev);
                        }
                    }
                    const beforeDedup = extraction.data.events.length;
                    extraction.data.events = Array.from(deduped.values());
                    if (beforeDedup > extraction.data.events.length) {
                        console.log(`[Scanner] Event dedup (ticker×type): ${beforeDedup} → ${extraction.data.events.length} (${beforeDedup - extraction.data.events.length} duplicates removed)`);
                    }
                }

                // Build a lookup of article descriptions by ticker for full context.
                // Each article title/description is sanitized before being stored so
                // that all downstream agent prompts receive prompt-injection-hardened
                // text (see src/utils/promptSanitizer.ts). Ticker matching still uses
                // the raw text so tags/HTML inside bodies never hide a ticker mention.
                const articleContextByTicker: Record<string, string> = {};
                // ── Item 3: Article age tracking per ticker ──────────────────────────────
                // Freshness penalty schedule (hours): 0-4 → 0, 4-12 → -5, 12-24 → -10, >24 → skip (unless grounded search corroborates)
                const articleAgeByTicker: Record<string, number> = {}; // hours
                const nowMs = Date.now();
                for (const article of actionableArticles) {
                    const rawText = `${article.title || ''}. ${article.description || ''}`;
                    const safeText = sanitizeUntrustedText(rawText, 800);
                    const fetchedAt = article.fetched_at ? new Date(article.fetched_at).getTime() : nowMs;
                    const ageHours = (nowMs - fetchedAt) / 3600_000;
                    for (const t of tickers) {
                        // Match tickers against the raw body so hidden-in-HTML mentions still match
                        if (rawText.toLowerCase().includes(t.toLowerCase())) {
                            articleContextByTicker[t] = articleContextByTicker[t]
                                ? `${articleContextByTicker[t]} | ${safeText}`
                                : safeText;
                            // Track the OLDEST article for this ticker (worst-case freshness)
                            if (articleAgeByTicker[t] === undefined || ageHours > articleAgeByTicker[t]) {
                                articleAgeByTicker[t] = ageHours;
                            }
                        }
                    }
                }

                // Check for events even if the original extraction failed —
                // per-ticker grounded search may have populated extraction.data.events
                if (extraction.data?.events && extraction.data.events.length > 0) {
                    console.log(`[Scanner] Extracted ${extraction.data.events.length} events:`, extraction.data.events.map((e: any) => `${e.ticker}(${e.event_type}, sev=${e.severity})`).join(', '));

                    for (const ev of extraction.data.events) {
                        // Only care about events concerning our watchlist
                        if (tickers.includes(ev.ticker)) {
                            eventsFound++;

                            // Save Event to DB — use insert, fallback to select if duplicate
                            let savedEvent: { id: string } | null = null;
                            const { data: insertedEvent, error: insertError } = await supabase.from('market_events').insert({
                                ticker: ev.ticker,
                                event_type: ev.event_type,
                                headline: ev.headline,
                                severity: ev.severity,
                                is_overreaction_candidate: ev.severity >= SEVERITY_THRESHOLD,
                                source_type: 'rss'
                            }).select('id').single();

                            if (insertedEvent) {
                                savedEvent = insertedEvent;
                            } else if (insertError) {
                                // Likely a duplicate — try to find the existing event
                                const { data: existing } = await supabase.from('market_events')
                                    .select('id')
                                    .eq('ticker', ev.ticker)
                                    .eq('headline', ev.headline)
                                    .limit(1)
                                    .maybeSingle();
                                savedEvent = existing;
                            }

                            // 6. Trigger Deep Analysis Pipeline if moderate-to-severe
                            if (savedEvent && ev.severity >= SEVERITY_THRESHOLD) {
                                console.log(`[Scanner] Deep analysis triggered for ${ev.ticker} (severity=${ev.severity}): ${ev.headline}`);
                                // Fetch live quote for context
                                let quote: any;
                                try {
                                    quote = await MarketDataService.getQuote(ev.ticker);
                                } catch (e: any) {
                                    console.warn(`[Scanner] Quote fetch failed for ${ev.ticker}:`, e.message);
                                }

                                const priceDrop = quote?.changePercent ?? 0;

                                // Build enriched market context for the agent
                                const marketContext: MarketContext = {
                                    fiftyTwoWeekHigh: quote?.fiftyTwoWeekHigh,
                                    fiftyTwoWeekLow: quote?.fiftyTwoWeekLow,
                                    avgVolume: quote?.avgVolume,
                                    currentVolume: quote?.volume,
                                    sectorPerformance: quote?.sectorPerformance,
                                    fearGreedScore,
                                    fearGreedRating,
                                };

                                // Gather real article context for this ticker. Fall back to the
                                // sanitized event type + headline when no article context exists.
                                const eventContext = articleContextByTicker[ev.ticker]
                                    || `Event: ${sanitizeUntrustedText(ev.event_type, 80)} — ${sanitizeUntrustedText(ev.headline, 200)}`;

                                // Skip ticker if no real price data available
                                if (!quote?.price) {
                                    console.warn(`[Scanner] Skipping ${ev.ticker} — no live quote available (data_quality: no_quote)`);
                                    skippedTickers.push(ev.ticker);
                                    continue;
                                }

                                // Feature 9: Minimum Liquidity Gate
                                const dollarVol = quote.price * (quote.volume || quote.avgVolume || 0);
                                if (dollarVol > 0 && dollarVol < SCREENER_MIN_DOLLAR_VOLUME) {
                                    console.warn(`[Scanner] Liquidity gate rejected ${ev.ticker}: $${dollarVol.toLocaleString()} < $${SCREENER_MIN_DOLLAR_VOLUME.toLocaleString()}`);
                                    skippedTickers.push(ev.ticker);
                                    continue;
                                }

                                // Skip if price drop doesn't meet adaptive threshold for current regime
                                // Only gate negative moves — positive or flat prices pass through
                                if (priceDrop < 0 && priceDrop > adaptiveMinPriceDrop) {
                                    console.log(`[Scanner] Skipping ${ev.ticker} — price drop ${priceDrop.toFixed(1)}% doesn't meet adaptive threshold ${adaptiveMinPriceDrop}%`);
                                    continue;
                                }

                                // 6a-6h. PARALLEL DATA ENRICHMENT
                                // Fire all independent data fetches concurrently instead of sequentially.
                                // This cuts per-event pre-fetch time from ~5-8s to ~1-2s.
                                const [
                                    taResult,
                                    histResult,
                                    earningsResult,
                                    fundResult,
                                    optionsResult,
                                    peerResult,
                                ] = await Promise.allSettled([
                                    // 6a. TA snapshot
                                    TechnicalAnalysisService.getSnapshot(ev.ticker),
                                    // 6b. Historical context
                                    supabase.from('signals')
                                        .select('signal_type, confidence_score, thesis, created_at, signal_outcomes(outcome, return_at_5d)')
                                        .eq('ticker', ev.ticker)
                                        .order('created_at', { ascending: false })
                                        .limit(5),
                                    // 6e. Earnings guard
                                    EarningsGuard.check(ev.ticker),
                                    // 6f. Fundamentals
                                    MarketDataService.getFundamentals(ev.ticker),
                                    // 6g. Options flow
                                    OptionsFlowService.analyze(ev.ticker),
                                    // 6h. Peer strength
                                    PeerStrengthService.analyze(ev.ticker, priceDrop),
                                    // 6i. RPD Pattern Matcher moved to after signal type is determined (Item 1 fix)
                                ]);

                                // Item 1: rpdMatchResult initialized to null here; the actual RPD call
                                // runs before step 7.10b using the real signalType + dominant bias.
                                let rpdMatchResult: import('@/types/agents').RPDMatchResult | null = null;

                                // Unpack TA (6a)
                                const earlyTaSnapshot = taResult.status === 'fulfilled' ? taResult.value : null;
                                let earlyTaContext = '';
                                if (earlyTaSnapshot) {
                                    try { earlyTaContext = TechnicalAnalysisService.formatForPrompt(earlyTaSnapshot); } catch { /* non-fatal */ }
                                }

                                // Unpack historical context (6b)
                                let historicalCtx = '';
                                if (histResult.status === 'fulfilled') {
                                    const pastSignals = histResult.value.data;
                                    if (pastSignals && pastSignals.length > 0) {
                                        const lines = pastSignals.map((s: any) => {
                                            const outcome = s.signal_outcomes?.[0];
                                            const ret = outcome?.return_at_5d != null ? `${Number(outcome.return_at_5d) > 0 ? '+' : ''}${Number(outcome.return_at_5d).toFixed(1)}%` : 'pending';
                                            return `- ${s.signal_type} (conf: ${s.confidence_score}) → ${outcome?.outcome || 'pending'} (5d: ${ret})`;
                                        });
                                        historicalCtx = `\n\nHISTORICAL SIGNALS FOR ${ev.ticker} (last ${pastSignals.length}):\n${lines.join('\n')}\nUse this history to calibrate — if past signals for this ticker failed, be MORE skeptical.`;
                                    }
                                }

                                // 6c. Sentiment divergence (depends on TA zScore)
                                let divergenceCtx = '';
                                let divergenceResult = null;
                                try {
                                    const zScore = earlyTaSnapshot?.zScore20 ?? null;
                                    divergenceResult = await SentimentDivergenceDetector.analyze(ev.ticker, zScore);
                                    divergenceCtx = SentimentDivergenceDetector.formatForPrompt(divergenceResult);
                                    if (divergenceResult.divergenceType !== 'neutral') {
                                        console.log(`[Scanner] Sentiment divergence for ${ev.ticker}: ${divergenceResult.divergenceType} (boost=${divergenceResult.confidenceBoost})`);
                                    }
                                } catch { /* non-fatal */ }

                                // 6d. Gap-Fill Detection (depends on TA snapshot)
                                let gapCtx = '';
                                const gapFill = TechnicalAnalysisService.evaluateGapFill(earlyTaSnapshot, quote.previousClose ?? 0);
                                if (gapFill.isCandidate) {
                                    gapCtx = `\nGAP ANALYSIS: ${ev.ticker} gapped ${gapFill.gapPct > 0 ? 'UP' : 'DOWN'} ${Math.abs(gapFill.gapPct).toFixed(1)}% (${gapFill.gapType} gap). Gap-fill target: $${Number(gapFill.gapFillTarget).toFixed(2)}. Common and exhaustion gaps have high fill probability within 1-3 days.`;
                                    console.log(`[Scanner] Gap detected for ${ev.ticker}: ${gapFill.gapType} gap ${gapFill.gapPct.toFixed(1)}%`);
                                }

                                // 6e. EARNINGS GUARD
                                let earningsCtx = '';
                                let earningsGuardResult = null;
                                if (earningsResult.status === 'fulfilled') {
                                    earningsGuardResult = earningsResult.value;
                                    if (earningsGuardResult.shouldBlock) {
                                        console.warn(`[Scanner] EARNINGS GUARD blocked ${ev.ticker}: ${earningsGuardResult.reason}`);
                                        continue;
                                    }
                                    earningsCtx = EarningsGuard.formatForPrompt(earningsGuardResult);
                                }

                                // 6e.5. SCAN COOLDOWN GUARD — skip if we generated a similar signal in the last 24h
                                const isPositiveEvent = priceDrop >= 0 || ['analyst_upgrade', 'product_launch', 'fda_approval', 'partnership', 'guidance_raise', 'contract_win', 'sector_tailwind', 'upcoming_earnings'].includes(ev.event_type);
                                const estSignalType = isPositiveEvent ? 'bullish_catalyst' : 'long_overreaction';
                                const inCooldown = await ScannerService.checkScanCooldown(ev.ticker, estSignalType);
                                if (inCooldown) {
                                    console.log(`[Scanner] COOLDOWN: Skipping ${ev.ticker} (already analyzed for ${estSignalType} in last 24h)`);
                                    continue;
                                }

                                // Unpack fundamentals (6f)
                                let fundamentalsCtx = '';
                                let fundamentalsData = null;
                                if (fundResult.status === 'fulfilled') {
                                    fundamentalsData = fundResult.value;
                                    try {
                                        fundamentalsCtx = MarketDataService.formatFundamentalsForPrompt(fundamentalsData);
                                        if (fundamentalsData) {
                                            const de = fundamentalsData.debt_to_equity;
                                            const pm = fundamentalsData.profit_margin;
                                            if (de !== null && de > 3) {
                                                console.log(`[Scanner] Fundamental warning for ${ev.ticker}: debt/equity=${de} (high leverage)`);
                                            }
                                            if (pm !== null && pm < -0.1) {
                                                console.log(`[Scanner] Fundamental warning for ${ev.ticker}: profit_margin=${(pm * 100).toFixed(1)}% (negative)`);
                                            }
                                        }
                                    } catch { /* non-fatal */ }
                                }

                                // Unpack options flow (6g)
                                let optionsFlowCtx = '';
                                let optionsFlowResult: import('./optionsFlowService').OptionsFlowResult | null = null;
                                if (optionsResult.status === 'fulfilled') {
                                    optionsFlowResult = optionsResult.value;
                                    try {
                                        optionsFlowCtx = OptionsFlowService.formatForPrompt(optionsFlowResult);
                                        if (optionsFlowResult.hasUnusualActivity) {
                                            console.log(`[Scanner] Options flow for ${ev.ticker}: ${optionsFlowResult.sentiment} (adj=${optionsFlowResult.confidenceAdjustment})`);
                                        }
                                    } catch { /* non-fatal */ }
                                }

                                // Unpack peer strength (6h)
                                let peerStrengthCtx = '';
                                let peerStrengthResult: import('./peerStrengthService').PeerStrengthResult | null = null;
                                if (peerResult.status === 'fulfilled') {
                                    peerStrengthResult = peerResult.value;
                                    try {
                                        peerStrengthCtx = PeerStrengthService.formatForPrompt(peerStrengthResult);
                                        if (peerStrengthResult.peers.length > 0) {
                                            console.log(`[Scanner] Peer strength for ${ev.ticker}: relative=${peerStrengthResult.relativeStrength.toFixed(1)}%, idiosyncratic=${peerStrengthResult.isIdiosyncratic}`);
                                        }
                                    } catch { /* non-fatal */ }
                                }

                                // Combine TA + divergence + gap + earnings + fundamentals + regime + options + peers into unified context
                                const enrichedTaContext = earlyTaContext + divergenceCtx + gapCtx + earningsCtx + fundamentalsCtx + regimeCtx + sectorRotationCtx + optionsFlowCtx + peerStrengthCtx;

                                // Ticker sector (used for sector-specific prompt overlay and R/R calibration)
                                const tickerSector = tickersToScan.find(t => t.ticker === ev.ticker)?.sector || 'Unknown';

                                // ── Item 3: News Freshness Penalty ────────────────────────────────────────
                                // Stale events are one of the biggest false-signal sources — market has already
                                // partially adjusted. Apply penalty before the agent call to reduce confidence.
                                // Events from grounded search (no article age tracked) are exempt.
                                const newsAgeHours = articleAgeByTicker[ev.ticker] ?? null;
                                let newsFreshnessPenalty = 0;
                                if (newsAgeHours !== null) {
                                    if (newsAgeHours > 24) {
                                        // Very stale — skip unless grounded search injects newer citation
                                        // We don't have a "grounded corroboration" flag here, so skip entirely
                                        console.warn(`[Scanner] News freshness gate: ${ev.ticker} event is ${newsAgeHours.toFixed(1)}h old — skipping (>24h without grounded search corroboration)`);
                                        continue;
                                    } else if (newsAgeHours > 12) {
                                        newsFreshnessPenalty = -10;
                                    } else if (newsAgeHours > 4) {
                                        newsFreshnessPenalty = -5;
                                    }
                                }

                                // Pipeline A: Overreaction Analysis (negative events)
                                // Pipeline B: Bullish Catalyst Analysis (positive events)
                                let analysis: import('@/types/agents').AgentResult<import('@/types/agents').OverreactionResult>;
                                let signalType: import('@/types/signals').SignalType = 'long_overreaction';
                                let catalystAgentUsed = false;

                                // Shared base inputs used by both the first primary call and any
                                // self-consistency re-runs. Capturing them once avoids drift between
                                // the first sample and the re-samples.
                                const primaryBaseInput = {
                                    ticker: ev.ticker,
                                    eventHeadline: ev.headline,
                                    eventDesc: eventContext,
                                    currentPrice: quote.price,
                                    performanceContext: perfContext,
                                    marketContext: marketContext,
                                    taContext: enrichedTaContext,
                                    historicalContext: historicalCtx,
                                    regime: regimeResult?.regime,
                                    sector: tickerSector,
                                };

                                // Closure that runs the CURRENT primary path at a given temperature.
                                // Bound after the first call so self-consistency re-uses the same branch.
                                let rerunPrimary: (() => Promise<import('@/types/agents').AgentResult<import('@/types/agents').OverreactionResult>>) | null = null;

                                if (isPositiveEvent && priceDrop >= DEFAULT_MIN_PRICE_RISE_PCT * -1) {
                                    // Positive catalyst path — check if market under-reacted
                                    const catalystResult = await AgentService.evaluateBullishCatalyst({
                                        ...primaryBaseInput,
                                        priceChangePct: priceDrop,
                                    });

                                    // Normalize catalyst result to overreaction shape for unified downstream processing
                                    if (catalystResult.success && catalystResult.data?.is_underreaction) {
                                        analysis = {
                                            ...catalystResult,
                                            data: {
                                                ...catalystResult.data,
                                                is_overreaction: true, // normalized — signals "this is actionable"
                                                financial_impact_assessment: catalystResult.data.catalyst_impact_assessment,
                                            }
                                        } as any;
                                        signalType = 'bullish_catalyst';
                                        catalystAgentUsed = true;
                                        console.log(`[Scanner] Bullish catalyst result for ${ev.ticker}: is_underreaction=true, confidence=${catalystResult.data.confidence_score}, catalyst=${catalystResult.data.catalyst_type}`);

                                        // Re-run closure: same normalization applied so downstream sees
                                        // a comparable shape across all samples.
                                        rerunPrimary = async () => {
                                            const r = await AgentService.evaluateBullishCatalyst({
                                                ...primaryBaseInput,
                                                priceChangePct: priceDrop,
                                                temperature: SELF_CONSISTENCY_TEMP,
                                            });
                                            if (r.success && r.data?.is_underreaction) {
                                                return {
                                                    ...r,
                                                    data: {
                                                        ...r.data,
                                                        is_overreaction: true,
                                                        financial_impact_assessment: r.data.catalyst_impact_assessment,
                                                    }
                                                } as any;
                                            }
                                            // If a re-run disagrees on direction (not an underreaction),
                                            // synthesize an is_overreaction=false shape so the self-consistency
                                            // direction check can detect the disagreement.
                                            return { ...r, data: r.data ? { ...r.data, is_overreaction: false } : null } as any;
                                        };
                                    } else {
                                        // Catalyst agent didn't fire — fall back to overreaction analysis
                                        console.log(`[Scanner] Bullish catalyst: no underreaction for ${ev.ticker}, falling back to overreaction agent`);
                                        const overreactionInput = {
                                            ...primaryBaseInput,
                                            priceDropPct: priceDrop,
                                        };
                                        analysis = await AgentService.evaluateOverreaction(overreactionInput);
                                        rerunPrimary = () => AgentService.evaluateOverreaction({
                                            ...overreactionInput,
                                            temperature: SELF_CONSISTENCY_TEMP,
                                        });
                                    }
                                } else {
                                    // Negative event path — standard overreaction analysis
                                    const overreactionInput = {
                                        ...primaryBaseInput,
                                        priceDropPct: priceDrop,
                                    };
                                    analysis = await AgentService.evaluateOverreaction(overreactionInput);
                                    rerunPrimary = () => AgentService.evaluateOverreaction({
                                        ...overreactionInput,
                                        temperature: SELF_CONSISTENCY_TEMP,
                                    });
                                }

                                // Conditional self-consistency — only fires if first-sample confidence
                                // falls in the uncertainty zone [55, 78]. Passthrough otherwise (no cost).
                                // In SELF_CONSISTENCY_DRY_RUN mode, re-runs happen but outputs are unchanged.
                                // See src/services/selfConsistency.ts.
                                if (rerunPrimary) {
                                    try {
                                        const consistency = await runPrimaryWithSelfConsistency({
                                            firstSample: analysis,
                                            rerun: rerunPrimary,
                                            extractConfidence: (d: any) => (d?.confidence_score ?? 0),
                                            extractDirection: (d: any) => (d?.is_overreaction ? 'long' : 'none'),
                                            tag: `${ev.ticker}/${signalType}`,
                                        });
                                        if (consistency.abort) {
                                            // Directional disagreement — signal is ambiguous, skip entirely.
                                            continue;
                                        }
                                        analysis = consistency.finalSample;
                                    } catch (scErr: any) {
                                        console.warn(`[Scanner] Self-consistency failed for ${ev.ticker} (non-fatal):`, scErr?.message || scErr);
                                    }
                                }

                                // Validate agent response before acting on it
                                const validation = responseValidator.validate(analysis.data);
                                if (!validation.valid) {
                                    console.warn(`[Scanner] ${catalystAgentUsed ? 'Catalyst' : 'Overreaction'} response failed validation for ${ev.ticker}:`, validation.warnings);
                                }

                                // ── Item 5: R/R Gate — penalize or block poor risk/reward ──────────────────
                                // If validation computed an R/R ratio, apply penalty/block based on threshold.
                                const rrRatio = validation.rrRatio;
                                if (analysis.success && analysis.data && rrRatio !== undefined) {
                                    if (rrRatio < 1.0) {
                                        // Fatal: R/R < 1.0 means we risk more than we could win — block the signal
                                        console.warn(`[Scanner] R/R gate BLOCKED ${ev.ticker}: R/R=${rrRatio.toFixed(2)} < 1.0 (reward doesn't cover risk)`);
                                        continue;
                                    } else if (rrRatio < 1.5) {
                                        // Insufficient R/R — apply −10 penalty
                                        const rrPenaltyBefore = analysis.data.confidence_score;
                                        analysis.data.confidence_score = Math.max(0, rrPenaltyBefore - 10);
                                        console.log(`[Scanner] R/R penalty for ${ev.ticker}: R/R=${rrRatio.toFixed(2)} → confidence ${rrPenaltyBefore} → ${analysis.data.confidence_score}`);
                                    }
                                }

                                // ── Item 3: Apply news freshness penalty ─────────────────────────────────
                                if (newsFreshnessPenalty !== 0 && analysis.success && analysis.data) {
                                    const freshnessBefore = analysis.data.confidence_score;
                                    analysis.data.confidence_score = Math.max(0, freshnessBefore + newsFreshnessPenalty);
                                    console.log(`[Scanner] Freshness penalty for ${ev.ticker} (${newsAgeHours?.toFixed(1)}h old): ${freshnessBefore} → ${analysis.data.confidence_score} (${newsFreshnessPenalty})`);
                                }

                                // A/B Test assignment for this ticker
                                const abAssignments = await ABTestingFramework.assignVariants(ev.ticker);

                                // Diagnostic logging — show WHY signals are accepted/rejected
                                // A/B test can override confidence gates
                                const gate = ABTestingFramework.getParam(
                                    abAssignments,
                                    catalystAgentUsed ? 'confidence_gate_catalyst' : 'confidence_gate_overreaction',
                                    catalystAgentUsed ? CONFIDENCE_GATE_CATALYST : CONFIDENCE_GATE_OVERREACTION
                                );
                                if (analysis.success) {
                                    console.log(`[Scanner] ${catalystAgentUsed ? 'Catalyst' : 'Overreaction'} result for ${ev.ticker}: pass=${analysis.data?.is_overreaction}, confidence=${analysis.data?.confidence_score}, thesis="${(analysis.data?.thesis || '').slice(0, 80)}..."`);
                                } else {
                                    console.warn(`[Scanner] ${catalystAgentUsed ? 'Catalyst' : 'Overreaction'} agent FAILED for ${ev.ticker}: ${analysis.error}`);
                                }

                                if (analysis.success && validation.valid && analysis.data?.is_overreaction && analysis.data.confidence_score > gate) {

                                    // Initialize Agent Context Bus for cascading intelligence
                                    const agentCtx = AgentContextBus.create(ev.ticker, ev.headline, signalType);
                                    AgentContextBus.setPrimaryAgent(agentCtx, analysis.data, catalystAgentUsed ? 'BULLISH_CATALYST_AGENT' : 'OVERREACTION_AGENT');
                                    agentCtx.regime = regimeResult?.regime;

                                    // 6.5. TA CONFIRMATION LAYER — use pre-fetched TA snapshot
                                    let taSnapshot = earlyTaSnapshot;
                                    let taAlignment: import('@/types/signals').TAAlignment = 'unavailable';
                                    try {
                                        if (!taSnapshot) {
                                            taSnapshot = await TechnicalAnalysisService.getSnapshot(ev.ticker);
                                        }
                                        taAlignment = TechnicalAnalysisService.evaluateAlignment(taSnapshot, 'long');

                                        // Block signal if TA shows buying into exhaustion
                                        // Bullish catalysts get a pass — breakout stocks naturally look overbought
                                        if (!catalystAgentUsed) {
                                            const blockCheck = TechnicalAnalysisService.shouldBlockLong(taSnapshot);
                                            if (blockCheck.blocked) {
                                                console.warn(`[Scanner] TA BLOCKED signal for ${ev.ticker}: ${blockCheck.reason}`);
                                                continue;
                                            }
                                        }

                                        // Reduce confidence if TA conflicts
                                        if (taAlignment === 'conflicting') {
                                            const taBefore = analysis.data.confidence_score;
                                            analysis.data.confidence_score = Math.max(0, taBefore - 20);
                                            console.log(`[Scanner] TA conflicting for ${ev.ticker} — confidence reduced to ${analysis.data.confidence_score}`);
                                            AgentContextBus.recordAdjustment(agentCtx, 'ta_alignment', taBefore, analysis.data.confidence_score, 'ta_conflicting');
                                        } else if (taAlignment === 'partial') {
                                            const taBefore = analysis.data.confidence_score;
                                            analysis.data.confidence_score = Math.max(0, taBefore - 10);
                                            AgentContextBus.recordAdjustment(agentCtx, 'ta_alignment', taBefore, analysis.data.confidence_score, 'ta_partial');
                                        }
                                    } catch (taErr) {
                                        console.warn(`[Scanner] TA fetch failed for ${ev.ticker}, proceeding without TA:`, taErr);
                                    }

                                    // Record TA adjustment in context bus
                                    agentCtx.taSnapshot = earlyTaSnapshot;
                                    agentCtx.taAlignment = taAlignment;

                                    // 7. SANITY CHECK (Red Team) — with cascading context from ALL upstream agents
                                    const priorContext: PriorAgentContext = {
                                        agentName: catalystAgentUsed ? 'BULLISH_CATALYST_AGENT' : 'OVERREACTION_AGENT',
                                        confidence: analysis.data.confidence_score,
                                        thesis: analysis.data.thesis,
                                        reasoning: analysis.data.reasoning || analysis.data.thesis,
                                        identifiedBiases: analysis.data.identified_biases || [],
                                        convictionScore: analysis.data.conviction_score,
                                        moatRating: analysis.data.moat_rating,
                                        financialImpact: analysis.data.financial_impact_assessment,
                                    };
                                    // Inject cascading context from bias detective (if it ran before red team)
                                    const sanity = await AgentService.runSanityCheck({
                                        ticker: ev.ticker,
                                        originalThesis: analysis.data.thesis,
                                        targetPrice: analysis.data.target_price,
                                        stopLoss: analysis.data.stop_loss,
                                        agentType: signalType,
                                        performanceContext: perfContext,
                                        taContext: enrichedTaContext,
                                        priorAgentContext: priorContext,
                                        regime: regimeResult?.regime
                                    });

                                    // Log sanity check result
                                    if (sanity.success) {
                                        console.log(`[Scanner] Sanity check for ${ev.ticker}: passes=${sanity.data?.passes_sanity_check}, risk=${sanity.data?.risk_score}, verdict=${sanity.data?.verdict ?? 'n/a'}`);
                                    } else {
                                        console.warn(`[Scanner] Sanity check FAILED for ${ev.ticker}: ${sanity.error}`);
                                    }

                                    if (sanity.success && sanity.data) {
                                        AgentContextBus.setRedTeam(agentCtx, sanity.data);
                                    }

                                    // Red Team HARD GATE — block on verdict='block' or catastrophic risk_score.
                                    // Stricter than passes_sanity_check alone; see redTeamGate() helper above.
                                    if (sanity.success && sanity.data) {
                                        const gate = redTeamGate(sanity.data);
                                        if (!gate.allow) {
                                            console.warn(`[Scanner] RED TEAM BLOCKED ${ev.ticker}: ${gate.reason}`);
                                            continue;
                                        }
                                    }

                                    if (sanity.success && sanity.data?.passes_sanity_check) {
                                        // Cumulative adjustment tracking — caps total penalty/boost across all stages
                                        const originalConfidenceBeforeAdjustments = analysis.data.confidence_score;
                                        let cumulativePenalty = 0;
                                        let cumulativeBoost = 0;

                                        // ── BEHAVIORAL LAYER (Category-Defining) ─────────────────────────
                                        // Three new agents that model OTHER market participants:
                                        //   1. Other-Mind Simulation — names the weak counterparty (HARD gate)
                                        //   2. Narrative Lifecycle   — phases the dominant story (SOFT adjust)
                                        //   3. Cohort Sequencer      — predicts temporal reaction order (SOFT adjust)
                                        // All three fire in parallel via Promise.allSettled.
                                        // Pre-gated on confidence >= BEHAVIORAL_MIN_CONFIDENCE_GATE to save API
                                        // spend on signals destined to be filtered downstream anyway.
                                        // See src/services/behavioralLayer.ts for the orchestrator.
                                        let behavioralOutput: BehavioralLayerResult | null = null;
                                        if (analysis.data.confidence_score >= BEHAVIORAL_MIN_CONFIDENCE_GATE) {
                                            try {
                                                const bhDirection: 'long' | 'short' = (
                                                    signalType === 'long_overreaction' ||
                                                    signalType === 'bullish_catalyst' ||
                                                    signalType === 'sector_contagion'
                                                ) ? 'long' : 'short';

                                                behavioralOutput = await runBehavioralLayer({
                                                    ticker: ev.ticker,
                                                    signalType,
                                                    direction: bhDirection,
                                                    thesis: analysis.data.thesis,
                                                    reasoning: analysis.data.reasoning || analysis.data.thesis,
                                                    eventHeadline: ev.headline,
                                                    eventDesc: eventContext,
                                                    priceChangePct: priceDrop,
                                                    taSnapshot: earlyTaSnapshot,
                                                    marketRegime: regimeResult?.regime,
                                                    fearGreedScore,
                                                });

                                                // Hard gate — only Other-Mind can block, and only when NOT in dry-run
                                                if (behavioralOutput.emitBlock.blocked) {
                                                    console.warn(`[BehavioralLayer] BLOCKED ${ev.ticker}: ${behavioralOutput.emitBlock.reason}`);
                                                    continue;
                                                }

                                                // Soft adjustments — Narrative + Cohort, bounded per-agent
                                                if (behavioralOutput.totalAdjustment !== 0) {
                                                    const before = analysis.data.confidence_score;
                                                    const bounded = applyBoundedAdjustment(
                                                        before,
                                                        behavioralOutput.totalAdjustment,
                                                        cumulativePenalty,
                                                        cumulativeBoost,
                                                    );
                                                    analysis.data.confidence_score = bounded.confidence;
                                                    cumulativePenalty = bounded.cumulativePenalty;
                                                    cumulativeBoost = bounded.cumulativeBoost;
                                                    AgentContextBus.recordAdjustment(
                                                        agentCtx,
                                                        'behavioral_layer',
                                                        before,
                                                        analysis.data.confidence_score,
                                                        `narr+cohort adjustment`,
                                                    );
                                                    console.log(`[BehavioralLayer] ${ev.ticker}: adjustment=${behavioralOutput.totalAdjustment}, ${before} → ${analysis.data.confidence_score}`);
                                                }

                                                // Write each sub-agent to the bus independently so downstream
                                                // agents (Bias Detective, Red Team cascade) can see them.
                                                if (behavioralOutput.otherMind) {
                                                    AgentContextBus.setOtherMind(agentCtx, behavioralOutput.otherMind);
                                                }
                                                if (behavioralOutput.narrative) {
                                                    AgentContextBus.setNarrative(agentCtx, behavioralOutput.narrative);
                                                }
                                                if (behavioralOutput.cohortSequence) {
                                                    AgentContextBus.setCohortSequence(agentCtx, behavioralOutput.cohortSequence);
                                                }
                                            } catch (blErr) {
                                                console.warn(`[BehavioralLayer] failed for ${ev.ticker} (non-fatal):`, blErr);
                                            }
                                        } else {
                                            console.log(`[BehavioralLayer] ${ev.ticker}: pre-gated (confidence ${analysis.data.confidence_score} < ${BEHAVIORAL_MIN_CONFIDENCE_GATE})`);
                                        }

                                        // 7.4.5. BIAS DETECTIVE — audit primary agent's reasoning for cognitive biases
                                        let biasDetectiveOutput: import('@/types/agents').BiasDetectiveResult | null = null;
                                        try {
                                            const biasResult = await AgentService.runBiasDetective(
                                                analysis.data.thesis,
                                                analysis.data.reasoning || analysis.data.thesis,
                                                analysis.data.confidence_score,
                                                catalystAgentUsed ? 'BULLISH_CATALYST_AGENT' : 'OVERREACTION_AGENT'
                                            );
                                            if (biasResult.success && biasResult.data) {
                                                biasDetectiveOutput = biasResult.data;
                                                // Enrich findings with actionable mitigation suggestions
                                                enrichWithMitigations(biasDetectiveOutput.findings);
                                                AgentContextBus.setBiasDetective(agentCtx, biasResult.data);
                                                if (biasResult.data.total_penalty > 0) {
                                                    const before = analysis.data.confidence_score;
                                                    const bounded = applyBoundedAdjustment(before, -biasResult.data.total_penalty, cumulativePenalty, cumulativeBoost);
                                                    analysis.data.confidence_score = bounded.confidence;
                                                    cumulativePenalty = bounded.cumulativePenalty;
                                                    cumulativeBoost = bounded.cumulativeBoost;
                                                    AgentContextBus.recordAdjustment(agentCtx, 'bias_detective', before, analysis.data.confidence_score, `dominant: ${biasResult.data.dominant_bias}`);
                                                    console.log(`[Scanner] Bias Detective penalised ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (dominant: ${biasResult.data.dominant_bias}, penalty: -${biasResult.data.total_penalty})`);
                                                } else {
                                                    console.log(`[Scanner] Bias Detective: ${ev.ticker} is bias-free (dominant: ${biasResult.data.dominant_bias})`);
                                                }
                                            }
                                        } catch (biasErr) {
                                            console.warn(`[Scanner] Bias Detective failed for ${ev.ticker} (non-fatal):`, biasErr);
                                        }

                                        // 7.4.6. TOXIC COMBINATION DETECTOR — compound bias risk
                                        let toxicComboOutput: import('@/types/agents').ToxicCombinationResult | null = null;
                                        try {
                                            if (biasDetectiveOutput && biasDetectiveOutput.findings.length > 0) {
                                                const toxicCtx: ToxicContextFlags = {
                                                    taAlignment: taAlignment,
                                                    sourceCount: undefined, // sourceDiversityResult computed later in pipeline
                                                    debtToEquity: fundamentalsData?.debt_to_equity ?? null,
                                                    profitMargin: fundamentalsData?.profit_margin ?? null,
                                                    regime: regimeResult?.regime,
                                                    volumeRatio: earlyTaSnapshot?.volumeRatio ?? null,
                                                };
                                                toxicComboOutput = ToxicCombinationDetector.detect(biasDetectiveOutput.findings, toxicCtx);
                                                AgentContextBus.setToxicCombination(agentCtx, toxicComboOutput);
                                                if (toxicComboOutput.is_toxic) {
                                                    const before = analysis.data.confidence_score;
                                                    const bounded = applyBoundedAdjustment(before, toxicComboOutput.confidence_penalty, cumulativePenalty, cumulativeBoost);
                                                    analysis.data.confidence_score = bounded.confidence;
                                                    cumulativePenalty = bounded.cumulativePenalty;
                                                    cumulativeBoost = bounded.cumulativeBoost;
                                                    AgentContextBus.recordAdjustment(agentCtx, 'toxic_combination', before, analysis.data.confidence_score, `${toxicComboOutput.highest_risk_pattern}`);
                                                    console.log(`[Scanner] Toxic Combo for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${toxicComboOutput.highest_risk_pattern}, risk=${toxicComboOutput.compound_risk_score})`);
                                                }
                                            }
                                        } catch (toxicErr) {
                                            console.warn(`[Scanner] Toxic Combination Detector failed for ${ev.ticker} (non-fatal):`, toxicErr);
                                        }

                                        // 7.5. SELF-CRITIQUE — second-pass confidence adjustment (with cascading context)
                                        let critiqueOutput = null;
                                        try {
                                            const selfCritiqueCascadeCtx = AgentContextBus.buildPromptContext(agentCtx, 'self_critique');
                                            const critique = await SelfCritiqueAgent.critique(
                                                ev.ticker,
                                                analysis.data.thesis + selfCritiqueCascadeCtx,
                                                analysis.data.reasoning || analysis.data.thesis,
                                                analysis.data.confidence_score,
                                                sanity.data.counter_thesis,
                                                signalType
                                            );
                                            critiqueOutput = critique;
                                            // Store in context bus
                                            agentCtx.selfCritique = {
                                                criticalFlaws: critique.criticalFlaws || [],
                                                minorFlaws: critique.minorFlaws || [],
                                                adjustedConfidence: critique.adjustedConfidence,
                                            };
                                            if (critique.hasFlaws && critique.adjustedConfidence < analysis.data.confidence_score) {
                                                const before = analysis.data.confidence_score;
                                                const critiqueAdj = critique.adjustedConfidence - before; // Convert absolute → delta
                                                const bounded = applyBoundedAdjustment(before, critiqueAdj, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Self-critique adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${critique.criticalFlaws.length} critical, ${critique.minorFlaws.length} minor flaws)`);
                                                AgentContextBus.recordAdjustment(agentCtx, 'self_critique', before, analysis.data.confidence_score, `${critique.criticalFlaws.length} critical flaws`);
                                            }
                                            // Drop signal if critique brings confidence below threshold
                                            if (critique.adjustedConfidence < CONFIDENCE_GATE_CRITIQUE) {
                                                console.warn(`[Scanner] Self-critique dropped signal for ${ev.ticker} — adjusted confidence ${critique.adjustedConfidence} below threshold`);
                                                continue;
                                            }
                                        } catch (critiqueErr) {
                                            console.warn(`[Scanner] Self-critique failed for ${ev.ticker} (non-fatal):`, critiqueErr);
                                        }

                                        // 7.5.2. PRE-MORTEM AGENT (Klein technique)
                                        let preMortemOutput: import('@/types/agents').PreMortemResult | null = null;
                                        try {
                                            const preMortemCascadeCtx = AgentContextBus.buildPromptContext(agentCtx, 'pre_mortem');
                                            preMortemOutput = await PreMortemAgent.analyze(
                                                ev.ticker,
                                                analysis.data.thesis,
                                                analysis.data.reasoning || analysis.data.thesis,
                                                analysis.data.confidence_score,
                                                signalType,
                                                preMortemCascadeCtx || undefined,
                                            );
                                            AgentContextBus.setPreMortem(agentCtx, preMortemOutput);
                                            if (preMortemOutput.confidence_penalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, preMortemOutput.confidence_penalty, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                AgentContextBus.recordAdjustment(agentCtx, 'pre_mortem', before, analysis.data.confidence_score, `resilience=${preMortemOutput.resilience_rating}, avg_fail=${preMortemOutput.avg_failure_probability}%`);
                                                console.log(`[Scanner] Pre-Mortem for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (resilience=${preMortemOutput.resilience_rating}, top risk="${preMortemOutput.highest_risk_scenario.slice(0, 80)}")`);
                                            } else {
                                                console.log(`[Scanner] Pre-Mortem for ${ev.ticker}: resilient — no penalty (avg failure prob ${preMortemOutput.avg_failure_probability}%)`);
                                            }
                                        } catch (preMortemErr) {
                                            console.warn(`[Scanner] Pre-Mortem failed for ${ev.ticker} (non-fatal):`, preMortemErr);
                                        }

                                        // 7.5.5. NOISE-AWARE CONFIDENCE — 3-judge panel to measure LLM certainty
                                        let noiseConfidenceOutput: import('@/types/agents').NoiseConfidenceResult | null = null;
                                        try {
                                            const noiseCascadeCtx = AgentContextBus.buildPromptContext(agentCtx, 'noise_panel');
                                            const noiseResult = await NoiseAwareConfidenceService.evaluate(
                                                analysis.data.thesis,
                                                analysis.data.reasoning || analysis.data.thesis,
                                                analysis.data.confidence_score,
                                                catalystAgentUsed ? 'BULLISH_CATALYST_AGENT' : 'OVERREACTION_AGENT',
                                                noiseCascadeCtx || undefined,
                                            );
                                            noiseConfidenceOutput = noiseResult;
                                            AgentContextBus.setNoisePanel(agentCtx, noiseResult);
                                            if (noiseResult.confidence_adjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, noiseResult.confidence_adjustment, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                AgentContextBus.recordAdjustment(agentCtx, 'noise_panel', before, analysis.data.confidence_score, noiseResult.summary);
                                                console.log(`[Scanner] Noise-Aware Confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${noiseResult.summary})`);
                                            }
                                        } catch (noiseErr) {
                                            console.warn(`[Scanner] Noise-Aware Confidence failed for ${ev.ticker} (non-fatal):`, noiseErr);
                                        }

                                        // 7.5.8. DECISION TWIN SIMULATION — 3 investor personas evaluate the thesis
                                        let decisionTwinOutput: import('@/types/agents').DecisionTwinResult | null = null;
                                        try {
                                            decisionTwinOutput = await DecisionTwinService.simulate({
                                                ticker: ev.ticker,
                                                thesis: analysis.data.thesis,
                                                reasoning: analysis.data.reasoning || analysis.data.thesis,
                                                confidence: analysis.data.confidence_score,
                                                targetPrice: analysis.data.target_price,
                                                stopLoss: analysis.data.stop_loss,
                                                currentPrice: quote.price,
                                                entryHigh: analysis.data.suggested_entry_high,
                                                signalType,
                                                // Value inputs
                                                moatRating: analysis.data.moat_rating,
                                                lynchCategory: analysis.data.lynch_category,
                                                convictionScore: analysis.data.conviction_score,
                                                peRatio: fundamentalsData?.pe_ratio ?? null,
                                                debtToEquity: fundamentalsData?.debt_to_equity ?? null,
                                                profitMargin: fundamentalsData?.profit_margin ?? null,
                                                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                                                // Momentum inputs
                                                taSnapshot: earlyTaSnapshot,
                                                // Risk inputs
                                                vix: regimeResult?.vixLevel ?? null,
                                                regime: regimeResult?.regime,
                                                // Cascading context from upstream agents
                                                cascadingContext: AgentContextBus.buildPromptContext(agentCtx, 'decision_twin') || undefined,
                                            });

                                            AgentContextBus.setDecisionTwin(agentCtx, decisionTwinOutput);
                                            if (decisionTwinOutput.confidence_adjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, decisionTwinOutput.confidence_adjustment, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                AgentContextBus.recordAdjustment(agentCtx, 'decision_twin', before, analysis.data.confidence_score, decisionTwinOutput.summary);
                                                console.log(`[Scanner] Decision Twin for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${decisionTwinOutput.summary})`);
                                            } else {
                                                console.log(`[Scanner] Decision Twin for ${ev.ticker}: no adjustment. ${decisionTwinOutput.summary}`);
                                            }

                                            // If all 3 personas voted SKIP, suppress the signal entirely
                                            if (decisionTwinOutput.skip_count === 3) {
                                                console.warn(`[Scanner] Decision Twin suppressed ${ev.ticker}: all 3 personas voted SKIP`);
                                                continue;
                                            }
                                        } catch (twinErr) {
                                            console.warn(`[Scanner] Decision Twin failed for ${ev.ticker} (non-fatal):`, twinErr);
                                        }

                                        // 7.6. SENTIMENT DIVERGENCE BOOST — adjust confidence based on narrative-price divergence
                                        if (divergenceResult && divergenceResult.confidenceBoost !== 0) {
                                            const before = analysis.data.confidence_score;
                                            const weightedDivBoost = AutoLearningService.applyWeight('sentiment_divergence', divergenceResult.confidenceBoost, autoLearnWeights);
                                            const bounded = applyBoundedAdjustment(before, weightedDivBoost, cumulativePenalty, cumulativeBoost);
                                            analysis.data.confidence_score = bounded.confidence;
                                            cumulativePenalty = bounded.cumulativePenalty;
                                            cumulativeBoost = bounded.cumulativeBoost;
                                            AgentContextBus.recordAdjustment(agentCtx, 'sentiment_divergence', before, analysis.data.confidence_score, divergenceResult.divergenceType);
                                            console.log(`[Scanner] Divergence ${divergenceResult.divergenceType} adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${weightedDivBoost > 0 ? '+' : ''}${weightedDivBoost})`);
                                        }

                                        // 7.7. EARNINGS CALENDAR PENALTY — reduce confidence near earnings
                                        if (earningsGuardResult && earningsGuardResult.confidencePenalty !== 0) {
                                            const before = analysis.data.confidence_score;
                                            const bounded = applyBoundedAdjustment(before, earningsGuardResult.confidencePenalty, cumulativePenalty, cumulativeBoost);
                                            analysis.data.confidence_score = bounded.confidence;
                                            cumulativePenalty = bounded.cumulativePenalty;
                                            cumulativeBoost = bounded.cumulativeBoost;
                                            AgentContextBus.recordAdjustment(agentCtx, 'earnings_guard', before, analysis.data.confidence_score, earningsGuardResult.reason || 'earnings proximity');
                                            console.log(`[Scanner] Earnings guard adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${earningsGuardResult.confidencePenalty})`);
                                        }

                                        // 7.8. FUNDAMENTALS PENALTY — reduce confidence for weak fundamentals
                                        if (fundamentalsData) {
                                            let fundPenalty = 0;
                                            const de = fundamentalsData.debt_to_equity;
                                            const pm = fundamentalsData.profit_margin;
                                            const pe = fundamentalsData.pe_ratio;
                                            const peAvg = fundamentalsData.pe_sector_avg;

                                            if (de !== null && de > FUNDAMENTALS_HIGH_LEVERAGE_DE) fundPenalty += FUNDAMENTALS_LEVERAGE_PENALTY;
                                            if (pm !== null && pm < FUNDAMENTALS_NEGATIVE_MARGIN) fundPenalty += FUNDAMENTALS_MARGIN_PENALTY;
                                            if (pe !== null && peAvg !== null && pe > peAvg * FUNDAMENTALS_EXTREME_PE_MULT) fundPenalty += FUNDAMENTALS_PE_PENALTY;

                                            if (fundPenalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, fundPenalty, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                AgentContextBus.recordAdjustment(agentCtx, 'fundamentals', before, analysis.data.confidence_score, `penalty=${fundPenalty}`);
                                                console.log(`[Scanner] Fundamentals penalty for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${fundPenalty})`);
                                            }
                                        }

                                        // 7.9. MARKET REGIME PENALTY — reduce confidence in crisis/correction
                                        if (regimeResult && regimeResult.confidencePenalty !== 0) {
                                            const before = analysis.data.confidence_score;
                                            const bounded = applyBoundedAdjustment(before, regimeResult.confidencePenalty, cumulativePenalty, cumulativeBoost);
                                            analysis.data.confidence_score = bounded.confidence;
                                            cumulativePenalty = bounded.cumulativePenalty;
                                            cumulativeBoost = bounded.cumulativeBoost;
                                            AgentContextBus.recordAdjustment(agentCtx, 'market_regime', before, analysis.data.confidence_score, regimeResult.regime);
                                            console.log(`[Scanner] Market regime (${regimeResult.regime}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${regimeResult.confidencePenalty})`);
                                        }

                                        // 7.9b. SECTOR ROTATION CONFIDENCE OVERLAY — adjust based on sector favorability
                                        if (rotationSnapshot && rotationSnapshot.regime !== 'neutral') {
                                            const tickerSectorCat = tickersToScan.find(t => t.ticker === ev.ticker)?.sector || '';
                                            // Map ticker sector to rotation category (Growth, Defensive, Cyclical)
                                            const sectorCategoryMap: Record<string, string> = {
                                                'Technology': 'Growth', 'Tech': 'Growth', 'Semiconductors': 'Growth', 'Semi': 'Growth',
                                                'AI/Cloud': 'Growth', 'AI': 'Growth', 'Cybersecurity': 'Growth',
                                                'Healthcare': 'Defensive', 'Bio': 'Defensive', 'Biotech': 'Defensive',
                                                'Consumer Staples': 'Defensive', 'Utilities': 'Defensive',
                                                'Energy': 'Cyclical', 'Industrials': 'Cyclical', 'Financials': 'Cyclical', 'Fintech': 'Cyclical',
                                            };
                                            const tickerRotationCat = sectorCategoryMap[tickerSectorCat] || 'Growth';
                                            const isFavored = rotationSnapshot.topInflows.some(s =>
                                                sectorCategoryMap[s.name] === tickerRotationCat
                                            );
                                            const isDisfavored = rotationSnapshot.topOutflows.some(s =>
                                                sectorCategoryMap[s.name] === tickerRotationCat
                                            );

                                            let rotationAdj = 0;
                                            let rotationReason = '';
                                            if (rotationSnapshot.regime === 'risk_on' && tickerRotationCat === 'Growth' && isFavored) {
                                                rotationAdj = ROTATION_FAVORED_SECTOR_BOOST;
                                                rotationReason = 'risk_on + growth favored';
                                            } else if (rotationSnapshot.regime === 'risk_off' && tickerRotationCat === 'Growth') {
                                                rotationAdj = -ROTATION_DISFAVORED_SECTOR_PENALTY;
                                                rotationReason = 'risk_off + growth headwind';
                                            } else if (rotationSnapshot.regime === 'risk_off' && tickerRotationCat === 'Defensive' && isFavored) {
                                                rotationAdj = ROTATION_FAVORED_SECTOR_BOOST;
                                                rotationReason = 'risk_off + defensive favored';
                                            } else if (rotationSnapshot.regime === 'rotation' && isFavored) {
                                                rotationAdj = ROTATION_FAVORED_SECTOR_BOOST;
                                                rotationReason = 'rotation + sector favored';
                                            } else if (rotationSnapshot.regime === 'rotation' && isDisfavored) {
                                                rotationAdj = -ROTATION_HEADWIND_PENALTY;
                                                rotationReason = 'rotation + sector disfavored';
                                            }

                                            if (rotationAdj !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, rotationAdj, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                AgentContextBus.recordAdjustment(agentCtx, 'sector_rotation_overlay', before, analysis.data.confidence_score, rotationReason);
                                                console.log(`[Scanner] Sector rotation overlay for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${rotationReason}, ${rotationAdj > 0 ? '+' : ''}${rotationAdj})`);
                                            }
                                        }

                                        // 7.10. BACKTEST VALIDATION — check historical performance of this signal type + ticker
                                        let backtestResult: import('./backtestValidator').BacktestResult | null = null;
                                        try {
                                            backtestResult = await BacktestValidator.validate(signalType, ev.ticker);
                                            if (backtestResult.shouldSuppress) {
                                                console.warn(`[Scanner] BACKTEST suppressed ${ev.ticker}: ${backtestResult.reason}`);
                                                continue;
                                            }
                                            if (backtestResult.confidencePenalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, backtestResult.confidencePenalty, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Backtest adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${backtestResult.confidencePenalty})`);
                                                AgentContextBus.recordAdjustment(agentCtx, 'backtest_validation', before, analysis.data.confidence_score, backtestResult.reason);
                                            }
                                            if (backtestResult.degradingEdge) {
                                                console.warn(`[Scanner] DEGRADING EDGE for ${ev.ticker}: recent win rate (${((backtestResult.recencyWeightedWinRate ?? 0) * 100).toFixed(0)}%) significantly below historical (${((backtestResult.signalTypeWinRate ?? 0) * 100).toFixed(0)}%)`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.10b. RPD PATTERN CONFIDENCE ADJUSTMENT (Klein framework)
                                        // Item 1 fix: call RPD here with the real signalType + dominant bias (not hard-coded defaults)
                                        try {
                                            const dominantBias = analysis.data.identified_biases?.[0] ?? 'recency_bias';
                                            rpdMatchResult = await RPDPatternMatcher.match(
                                                ev.ticker,
                                                signalType,
                                                dominantBias,
                                                tickerSector,
                                                regimeResult?.regime,
                                                analysis.data.confidence_score,
                                            );
                                            if (rpdMatchResult.sufficient_data) {
                                                console.log(`[Scanner] RPD pattern for ${ev.ticker} (type=${signalType}, bias=${dominantBias}): ${rpdMatchResult.pattern_summary}`);
                                            }
                                        } catch { /* non-fatal */ }

                                        if (rpdMatchResult && rpdMatchResult.confidence_adjustment !== 0) {
                                            const before = analysis.data.confidence_score;
                                            const bounded = applyBoundedAdjustment(before, rpdMatchResult.confidence_adjustment, cumulativePenalty, cumulativeBoost);
                                            analysis.data.confidence_score = bounded.confidence;
                                            cumulativePenalty = bounded.cumulativePenalty;
                                            cumulativeBoost = bounded.cumulativeBoost;
                                            AgentContextBus.recordAdjustment(agentCtx, 'rpd_pattern', before, analysis.data.confidence_score, rpdMatchResult.pattern_summary);
                                            console.log(`[Scanner] RPD Pattern for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${rpdMatchResult.pattern_summary})`);
                                        }

                                        // 7.11. MULTI-TIMEFRAME CONFIRMATION — check weekly trend alignment
                                        let mtfResult: MultiTimeframeResult | null = null;
                                        try {
                                            mtfResult = await TechnicalAnalysisService.getMultiTimeframeConfirmation(ev.ticker, 'long');
                                            if (mtfResult.confidenceAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, mtfResult.confidenceAdjustment, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Multi-timeframe (${mtfResult.alignment}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${mtfResult.confidenceAdjustment > 0 ? '+' : ''}${mtfResult.confidenceAdjustment})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.11b. GEMINI MULTI-TIMEFRAME — deeper 3-timeframe trend confirmation via AI
                                        // For bullish catalysts, full MTF alignment gets a bonus multiplier
                                        try {
                                            const signalBias = analysis.data.bias_type || 'bullish';
                                            const geminiMtf = await MultiTimeframeService.analyze(ev.ticker, signalBias);
                                            if (geminiMtf.confidenceBonus !== 0) {
                                                // Bullish catalyst + 3/3 alignment = extra +5 bonus (momentum confirmation)
                                                let mtfBonus = geminiMtf.confidenceBonus;
                                                if (catalystAgentUsed && geminiMtf.alignedCount === geminiMtf.totalChecked && geminiMtf.totalChecked === 3) {
                                                    mtfBonus += 5;
                                                    console.log(`[Scanner] MTF catalyst boost for ${ev.ticker}: +5 extra (3/3 alignment with bullish catalyst)`);
                                                }
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, mtfBonus, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Gemini MTF (${geminiMtf.alignedCount}/${geminiMtf.totalChecked} aligned) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${mtfBonus > 0 ? '+' : ''}${mtfBonus})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.12. CORRELATION GUARD — penalize sector concentration
                                        let correlationResult: import('./correlationGuard').CorrelationGuardResult | null = null;
                                        try {
                                            correlationResult = await CorrelationGuard.check(ev.ticker, tickerSector);
                                            if (correlationResult.shouldBlock) {
                                                console.warn(`[Scanner] CORRELATION GUARD blocked ${ev.ticker}: ${correlationResult.reason}`);
                                                continue;
                                            }
                                            if (correlationResult.confidencePenalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, correlationResult.confidencePenalty, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Correlation guard adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${correlationResult.confidencePenalty})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.12b. PRICE CORRELATION — check actual price correlation with existing signals
                                        let priceCorr: { highlyCorrelatedTickers: Array<{ ticker: string; correlation: number }>; maxCorrelation: number; confidencePenalty: number; reason: string } | null = null;
                                        try {
                                            priceCorr = await PriceCorrelationMatrix.check(ev.ticker);
                                            if (priceCorr.confidencePenalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, priceCorr.confidencePenalty, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Price correlation penalty for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${priceCorr.confidencePenalty}, max_corr=${priceCorr.maxCorrelation.toFixed(2)})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.13. SIGNAL FRESHNESS — skip if a fresh duplicate exists
                                        try {
                                            const hasFresh = await SignalDecayEngine.hasFreshSignal(ev.ticker, signalType);
                                            if (hasFresh) {
                                                console.log(`[Scanner] Skipping ${ev.ticker} — fresh active signal already exists for this type.`);
                                                continue;
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.14. OPTIONS FLOW — adjust confidence based on institutional positioning
                                        if (optionsFlowResult && optionsFlowResult.confidenceAdjustment !== 0) {
                                            const before = analysis.data.confidence_score;
                                            const bounded = applyBoundedAdjustment(before, optionsFlowResult.confidenceAdjustment, cumulativePenalty, cumulativeBoost);
                                            analysis.data.confidence_score = bounded.confidence;
                                            cumulativePenalty = bounded.cumulativePenalty;
                                            cumulativeBoost = bounded.cumulativeBoost;
                                            console.log(`[Scanner] Options flow (${optionsFlowResult.sentiment}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${optionsFlowResult.confidenceAdjustment > 0 ? '+' : ''}${optionsFlowResult.confidenceAdjustment})`);
                                        }

                                        // 7.15. PEER RELATIVE STRENGTH — adjust based on idiosyncratic vs sector-wide move
                                        if (peerStrengthResult && peerStrengthResult.confidenceAdjustment !== 0) {
                                            const before = analysis.data.confidence_score;
                                            const bounded = applyBoundedAdjustment(before, peerStrengthResult.confidenceAdjustment, cumulativePenalty, cumulativeBoost);
                                            analysis.data.confidence_score = bounded.confidence;
                                            cumulativePenalty = bounded.cumulativePenalty;
                                            cumulativeBoost = bounded.cumulativeBoost;
                                            console.log(`[Scanner] Peer strength (${peerStrengthResult.isIdiosyncratic ? 'idiosyncratic' : 'sector-wide'}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${peerStrengthResult.confidenceAdjustment > 0 ? '+' : ''}${peerStrengthResult.confidenceAdjustment})`);
                                        }

                                        // 7.16. THESIS CONFLICT DETECTION — check for contradictions with active signals
                                        const tickerSectorForConflict = tickersToScan.find(t => t.ticker === ev.ticker)?.sector || 'Unknown';
                                        let conflictResult: import('./conflictDetector').ConflictResult | null = null;
                                        try {
                                            conflictResult = await ConflictDetector.checkConflicts(
                                                ev.ticker,
                                                'long', // overreaction signals are long plays
                                                analysis.data.thesis,
                                                tickerSectorForConflict
                                            );
                                            if (conflictResult.shouldBlock) {
                                                console.warn(`[Scanner] CONFLICT DETECTOR blocked ${ev.ticker}: ${conflictResult.summary}`);
                                                continue;
                                            }
                                            if (conflictResult.confidencePenalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, conflictResult.confidencePenalty, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Conflict detection adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${conflictResult.confidencePenalty})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.16b. FEAR & GREED CONTRARIAN — boost confidence when buying in fear, penalize in greed
                                        let fearGreedAdjustment = 0;
                                        if (fearGreedScore !== undefined) {
                                            if (fearGreedScore <= FEAR_GREED_EXTREME_FEAR_THRESHOLD) {
                                                fearGreedAdjustment = FEAR_GREED_EXTREME_FEAR_BOOST;
                                            } else if (fearGreedScore <= FEAR_GREED_FEAR_THRESHOLD) {
                                                fearGreedAdjustment = FEAR_GREED_FEAR_BOOST;
                                            } else if (fearGreedScore >= FEAR_GREED_EXTREME_GREED_THRESHOLD) {
                                                fearGreedAdjustment = FEAR_GREED_EXTREME_GREED_PENALTY;
                                            } else if (fearGreedScore >= FEAR_GREED_GREED_THRESHOLD) {
                                                fearGreedAdjustment = FEAR_GREED_GREED_PENALTY;
                                            }
                                            if (fearGreedAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, fearGreedAdjustment, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Fear & Greed (${fearGreedScore} ${fearGreedRating}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${fearGreedAdjustment > 0 ? '+' : ''}${fearGreedAdjustment})`);
                                            }
                                        }

                                        // 7.16c. RETAIL vs NEWS SENTIMENT GAP — detect contrarian retail/institutional divergence
                                        let retailVsNewsResult: import('./retailVsNewsSentiment').RetailVsNewsResult | null = null;
                                        try {
                                            retailVsNewsResult = await RetailVsNewsSentimentDetector.analyze(ev.ticker);
                                            if (retailVsNewsResult.confidenceAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, retailVsNewsResult.confidenceAdjustment, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Retail vs News (${retailVsNewsResult.gapType}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${retailVsNewsResult.confidenceAdjustment > 0 ? '+' : ''}${retailVsNewsResult.confidenceAdjustment})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.16d. CROSS-SOURCE VALIDATION — composite quality score from all independent sources
                                        let crossSourceResult: import('./crossSourceValidator').CrossSourceResult | null = null;
                                        try {
                                            const tickerSectorForCross = tickersToScan.find(t => t.ticker === ev.ticker)?.sector || 'Unknown';
                                            crossSourceResult = await CrossSourceValidator.validate(
                                                ev.ticker,
                                                'long',
                                                tickerSectorForCross,
                                                taAlignment,
                                                null, // confluence computed after cross-source check
                                                optionsFlowResult?.sentiment ?? null,
                                                peerStrengthResult?.isIdiosyncratic ?? null,
                                                divergenceResult,
                                                null, // rotationSnapshot — injected at scan level, not stored in local var for signal scope
                                            );
                                            if (crossSourceResult.confidenceAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, crossSourceResult.confidenceAdjustment, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Cross-source (${crossSourceResult.qualityTier}, ${crossSourceResult.confirmedSources}/${crossSourceResult.totalSources}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${crossSourceResult.confidenceAdjustment > 0 ? '+' : ''}${crossSourceResult.confidenceAdjustment})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.16e. SOURCE DIVERSITY GATE — cap confidence for thin news coverage
                                        // Single-source or low-diversity signals are capped at 65% confidence.
                                        // Requires minimum 5 diversity points (e.g., 1 Tier-1 source + 1 other)
                                        // for signals above the cap threshold.
                                        let sourceDiversityResult: import('./sourceDiversityScorer').SourceDiversityResult | null = null;
                                        try {
                                            // Build source list from all available context (RSS articles, grounded search, sentinel intel)
                                            const signalSources: string[] = [
                                                ...(actionableArticles
                                                    .filter((a: any) => {
                                                        const text = `${a.title || ''}. ${a.description || ''}`;
                                                        return text.toLowerCase().includes(ev.ticker.toLowerCase());
                                                    })
                                                    .map((a: any) => a.source_url || a.feed_url || a.title || '')
                                                ),
                                            ];
                                            const { result: divResult } = SourceDiversityScorer.applyGate(
                                                signalSources,
                                                analysis.data.confidence_score,
                                            );
                                            sourceDiversityResult = divResult;
                                            if (divResult.confidenceAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, divResult.confidenceAdjustment, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                console.log(`[Scanner] Source diversity gate for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${divResult.summary})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.16f. BENEFICIAL PATTERN DETECTOR — counterbalance over-penalization
                                        let beneficialResult: import('@/types/agents').BeneficialPatternResult | null = null;
                                        try {
                                            const beneficialCtx: BeneficialContext = {
                                                fearGreedScore: fearGreedScore ?? undefined,
                                                moatRating: analysis.data.moat_rating ?? null,
                                                noiseStdDev: noiseConfidenceOutput?.std_dev ?? null,
                                                mtfAlignedCount: undefined,
                                                volumeRatio: earlyTaSnapshot?.volumeRatio ?? null,
                                                optionsFlowSentiment: optionsFlowResult?.sentiment ?? null,
                                                peerIsIdiosyncratic: peerStrengthResult?.isIdiosyncratic ?? undefined,
                                                priceCorrelationMax: priceCorr?.maxCorrelation ?? undefined,
                                                convictionScore: analysis.data.conviction_score ?? null,
                                                rpdHistoricalWinRate: rpdMatchResult?.historical_win_rate ?? null,
                                                rpdSufficientData: rpdMatchResult?.sufficient_data ?? false,
                                                biasFree: biasDetectiveOutput ? biasDetectiveOutput.findings.length === 0 : false,
                                            };
                                            beneficialResult = BeneficialPatternDetector.detect(beneficialCtx);
                                            if (beneficialResult.total_boost > 0) {
                                                const before = analysis.data.confidence_score;
                                                const bounded = applyBoundedAdjustment(before, beneficialResult.total_boost, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                AgentContextBus.recordAdjustment(agentCtx, 'beneficial_patterns', before, analysis.data.confidence_score, beneficialResult.summary);
                                                console.log(`[Scanner] Beneficial patterns for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${beneficialResult.summary})`);
                                            }
                                        } catch (bpErr) {
                                            console.warn(`[Scanner] Beneficial Pattern Detector failed for ${ev.ticker} (non-fatal):`, bpErr);
                                        }

                                        // Pre-SWOT drop check: bail early if already below threshold
                                        // Use dynamic threshold if available for this signal type, otherwise fall back to adaptive
                                        const dynamicThreshold = signalTypeThresholds[signalType];
                                        const minConfidenceForType = dynamicThreshold?.recommendedMinConfidence ?? adaptiveMinConfidence;
                                        if (analysis.data.confidence_score < minConfidenceForType) {
                                            console.warn(`[Scanner] Signal for ${ev.ticker} dropped — confidence ${analysis.data.confidence_score} below ${minConfidenceForType} (${dynamicThreshold?.source ?? 'adaptive'}) after adjustments`);
                                            continue;
                                        }

                                        // 7.17. MARGIN-OF-SAFETY GUARDRAIL — Buffett hard gate
                                        // Skip for bullish catalysts — breakout stocks are near highs by definition
                                        if (!catalystAgentUsed) {
                                            const mosCheck = ConvictionGuardrails.checkMarginOfSafety(
                                                quote.price,
                                                quote.fiftyTwoWeekHigh,
                                                analysis.data.confidence_score,
                                            );
                                            if (!mosCheck.passed) {
                                                console.warn(`[Scanner] Margin-of-safety gate blocked ${ev.ticker}: ${mosCheck.reason}`);
                                                continue;
                                            }
                                            if (mosCheck.warnings.length > 0) {
                                                console.log(`[Scanner] MoS warnings for ${ev.ticker}: ${mosCheck.warnings.join('; ')}`);
                                            }
                                        }

                                        // Compute margin-of-safety percentage for signal record
                                        const marginOfSafetyPct = quote.fiftyTwoWeekHigh && quote.fiftyTwoWeekHigh > 0
                                            ? Math.round(((quote.fiftyTwoWeekHigh - quote.price) / quote.fiftyTwoWeekHigh) * 1000) / 10
                                            : null;

                                        // 7.18. PORTFOLIO-LEVEL GUARDRAILS — check cyclical/moat exposure limits
                                        try {
                                            const portfolioGuardrails = await ConvictionGuardrails.checkPortfolioGuardrails();
                                            if (portfolioGuardrails.blocked) {
                                                console.warn(`[Scanner] Portfolio guardrails blocked ${ev.ticker}: ${portfolioGuardrails.warnings.join('; ')}`);
                                                continue;
                                            }
                                            if (portfolioGuardrails.warnings.length > 0) {
                                                console.log(`[Scanner] Portfolio warnings for ${ev.ticker}: ${portfolioGuardrails.warnings.join('; ')}`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.19. SWOT ANALYSIS — narrative enrichment WITH confidence feedback
                                        let swotOutput: import('@/types/agents').SWOTResult | null = null;
                                        try {
                                            swotOutput = await SWOTAnalysisService.analyze({
                                                ticker: ev.ticker,
                                                headline: ev.headline,
                                                thesis: analysis.data.thesis,
                                                reasoning: analysis.data.reasoning || analysis.data.thesis,
                                                confidence: analysis.data.confidence_score,
                                                signalType,
                                                counterThesis: sanity.data?.counter_thesis ?? null,
                                                criticalFlaws: critiqueOutput?.criticalFlaws ?? [],
                                                decisionTwin: decisionTwinOutput,
                                                moatRating: analysis.data.moat_rating,
                                                lynchCategory: analysis.data.lynch_category,
                                                peRatio: fundamentalsData?.pe_ratio ?? null,
                                                debtToEquity: fundamentalsData?.debt_to_equity ?? null,
                                                profitMargin: fundamentalsData?.profit_margin ?? null,
                                                taSnapshot: earlyTaSnapshot,
                                            });
                                            console.log(`[Scanner] SWOT generated for ${ev.ticker}: "${swotOutput.executive_summary.slice(0, 80)}..."`);

                                            // SWOT confidence feedback — penalize when weaknesses significantly outnumber strengths
                                            const strengthCount = swotOutput.strengths.length;
                                            const weaknessCount = swotOutput.weaknesses.length;
                                            const threatCount = swotOutput.threats.length;
                                            if (weaknessCount > strengthCount && threatCount > 1) {
                                                const before = analysis.data.confidence_score;
                                                // Severe: weaknesses >= 2× strengths
                                                const swotPenalty = weaknessCount >= strengthCount * 2
                                                    ? -SWOT_SEVERE_IMBALANCE_PENALTY
                                                    : -SWOT_WEAKNESS_IMBALANCE_PENALTY;
                                                const bounded = applyBoundedAdjustment(before, swotPenalty, cumulativePenalty, cumulativeBoost);
                                                analysis.data.confidence_score = bounded.confidence;
                                                cumulativePenalty = bounded.cumulativePenalty;
                                                cumulativeBoost = bounded.cumulativeBoost;
                                                AgentContextBus.recordAdjustment(agentCtx, 'swot_feedback', before, analysis.data.confidence_score,
                                                    `W=${weaknessCount} > S=${strengthCount}, T=${threatCount}: penalty ${swotPenalty}`);
                                                console.log(`[Scanner] SWOT feedback for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (W=${weaknessCount} > S=${strengthCount}, T=${threatCount})`);
                                            }
                                        } catch (swotErr) {
                                            console.warn(`[Scanner] SWOT failed for ${ev.ticker} (non-fatal):`, swotErr);
                                        }

                                        // Log cumulative adjustment summary (after all stages including SWOT)
                                        if (cumulativePenalty > 0 || cumulativeBoost > 0) {
                                            console.log(`[Scanner] Cumulative adjustments for ${ev.ticker}: penalty=${cumulativePenalty}/${MAX_CUMULATIVE_PENALTY}, boost=${cumulativeBoost}/${MAX_CUMULATIVE_BOOST} (original=${originalConfidenceBeforeAdjustments}, final=${analysis.data.confidence_score})`);
                                        }

                                        // Final drop check — after ALL adjustments including SWOT feedback
                                        if (analysis.data.confidence_score < adaptiveMinConfidence) {
                                            console.warn(`[Scanner] Signal for ${ev.ticker} dropped — confidence ${analysis.data.confidence_score} below ${adaptiveMinConfidence} after all adjustments (including SWOT)`);
                                            continue;
                                        }

                                        // 7.20. DECISION QUALITY INDEX — composite quality score
                                        let dqiResult: import('@/types/agents').DQIResult | null = null;
                                        try {
                                            const dqiInputs: DQIInputs = {
                                                biasTotalPenalty: biasDetectiveOutput?.total_penalty ?? 0,
                                                biasFree: biasDetectiveOutput ? biasDetectiveOutput.findings.length === 0 : true,
                                                noiseStdDev: noiseConfidenceOutput?.std_dev ?? null,
                                                preMortemAvgProbability: preMortemOutput?.avg_failure_probability ?? null,
                                                twinTakeCount: decisionTwinOutput
                                                    ? [decisionTwinOutput.value.verdict, decisionTwinOutput.momentum.verdict, decisionTwinOutput.risk.verdict]
                                                        .filter(v => v === 'take').length
                                                    : undefined,
                                                criticalFlawCount: critiqueOutput?.criticalFlaws?.length ?? undefined,
                                                minorFlawCount: critiqueOutput?.minorFlaws?.length ?? undefined,
                                                crossSourceQualityScore: crossSourceResult?.qualityScore ?? null,
                                                rpdHistoricalWinRate: rpdMatchResult?.historical_win_rate ?? null,
                                                rpdSufficientData: rpdMatchResult?.sufficient_data ?? false,
                                                toxicCompoundRiskScore: toxicComboOutput?.compound_risk_score ?? undefined,
                                            };
                                            dqiResult = DecisionQualityIndex.compute(dqiInputs);
                                            console.log(`[Scanner] DQI for ${ev.ticker}: ${dqiResult.score}/100 (${dqiResult.quality_tier}) — bias=${dqiResult.components.bias_audit}, noise=${dqiResult.components.noise_convergence}, pre_mortem=${dqiResult.components.pre_mortem_resilience}, twin=${dqiResult.components.twin_consensus}`);

                                            // DQI gate — suppress signals below minimum quality threshold
                                            if (!DecisionQualityIndex.passesGate(dqiResult)) {
                                                console.warn(`[Scanner] DQI gate REJECTED ${ev.ticker}: score ${dqiResult.score} < ${DQI_MINIMUM_THRESHOLD} (tier: ${dqiResult.quality_tier})`);
                                                continue;
                                            }
                                        } catch (dqiErr) {
                                            console.warn(`[Scanner] DQI computation failed for ${ev.ticker} (non-fatal):`, dqiErr);
                                        }

                                        // 8. Candidate cleared every gate. (Counted only after a
                                        // confirmed persist below — see the savedSignal block.)
                                        const entryPrice = quote.price;

                                        // TA Confluence scoring — computed early for dynamic stop sizing
                                        const confluence = TechnicalAnalysisService.computeConfluence(
                                            taSnapshot, 'long', analysis.data.confidence_score
                                        );
                                        console.log(`[Scanner] Confluence for ${ev.ticker}: score=${confluence.score}, level=${confluence.level}`);

                                        // ATR-based stop-loss with DYNAMIC multiplier based on confluence
                                        let stopLoss = analysis.data.stop_loss;
                                        let trailingStopRule: string | null = null;
                                        if (taSnapshot?.atr14) {
                                            // Dynamic stop: tighter for strong confluence, wider for weak
                                            let atrMult = 1.5;
                                            if (confluence.score >= 75) atrMult = ATR_MULT_STRONG_CONFLUENCE;
                                            else if (confluence.score >= 55) atrMult = ATR_MULT_GOOD_CONFLUENCE;
                                            else if (confluence.score >= 35) atrMult = ATR_MULT_MODERATE_CONFLUENCE;
                                            else atrMult = ATR_MULT_WEAK_CONFLUENCE;

                                            const atrStop = entryPrice - (taSnapshot.atr14 * atrMult);
                                            if (!stopLoss || atrStop > stopLoss) {
                                                stopLoss = Math.round(atrStop * 100) / 100;
                                            }
                                            const breakevenTarget = entryPrice + taSnapshot.atr14;
                                            trailingStopRule = `Dynamic stop (${atrMult}x ATR, confluence=${confluence.level}). Move to breakeven ($${Number(entryPrice).toFixed(2)}) after +1x ATR ($${Number(breakevenTarget).toFixed(2)}). Trail by ${atrMult}x ATR.`;
                                        }

                                        // Gap-fill target: if there's a fillable gap, use it as a conservative target
                                        // when the Gemini target is further away
                                        if (gapFill.isCandidate && gapFill.gapFillTarget && gapFill.gapPct < 0) {
                                            // Gap DOWN with fill candidate — gap-fill target is above current price
                                            const gapTarget = gapFill.gapFillTarget;
                                            if (analysis.data.target_price && gapTarget < analysis.data.target_price) {
                                                // Gap-fill is a closer, more conservative target — note it in the trailing stop
                                                trailingStopRule = (trailingStopRule || '') +
                                                    ` Gap-fill interim target: $${Number(gapTarget).toFixed(2)} (${gapFill.gapType} gap, ${Math.abs(gapFill.gapPct).toFixed(1)}%).`;
                                            }
                                        }

                                        // Calibrated confidence (dynamic isotonic regression when data available, fallback to static buckets)
                                        let calibratedConfidence: number | null = null;
                                        try {
                                            calibratedConfidence = await DynamicCalibrator.getCalibratedProbabilityAsync(analysis.data.confidence_score);
                                        } catch {
                                            // Fallback to legacy static calibrator
                                            try {
                                                calibratedConfidence = await ConfidenceCalibrator.getCalibratedWinRateBySector(
                                                    analysis.data.confidence_score,
                                                    tickerSector || 'Unknown'
                                                );
                                            } catch { /* non-fatal — leave calibrated null; never store raw confidence as calibrated */
                                                calibratedConfidence = null;
                                            }
                                        }

                                        // LOW-COST ACCURACY GUARD: 200-SMA Guard in CRISIS
                                        const smaGuard = ScannerService.checkSMAGuard(
                                            signalType === 'long_overreaction' || signalType === 'bullish_catalyst' ? 'long' : 'short',
                                            taSnapshot,
                                            regimeResult?.regime || 'NORMAL'
                                        );

                                        if (smaGuard.blocked) {
                                            console.warn(`[Scanner] ACCURACY GUARD: Blocking signal for ${ev.ticker} due to: ${smaGuard.reason}`);
                                            continue;
                                        }

                                        // Weighted Similarity ROI — multi-factor matching
                                        let projectedRoi: number | null = null;
                                        let projectedWinRate: number | null = null;
                                        let similarEventsCount: number | null = null;
                                        try {
                                            const taAlignStr = typeof taAlignment === 'string' ? taAlignment : 'unavailable';
                                            const roiResult = await calculateWeightedRoi(
                                                signalType,
                                                'recency_bias',
                                                analysis.data.confidence_score,
                                                taAlignStr,
                                                confluence.level
                                            );
                                            projectedRoi = roiResult.projectedRoi;
                                            projectedWinRate = roiResult.projectedWinRate;
                                            similarEventsCount = roiResult.similarEventsCount;
                                            if (roiResult.avgSimilarity !== null) {
                                                console.log(`[Scanner] Weighted ROI for ${ev.ticker}: ${projectedRoi}% (${roiResult.bestHorizon}, sim=${roiResult.avgSimilarity}, n=${similarEventsCount})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // Thesis deduplication — reject a near-duplicate of any active
                                        // signal on the same ticker + signal_type from the last 24h.
                                        // See src/utils/thesisDedup.ts. Errors are non-fatal.
                                        const dedupCheck = await isDuplicateThesis(ev.ticker, signalType, analysis.data.thesis);
                                        if (dedupCheck.duplicate) {
                                            console.log(`[Scanner] Thesis dedup REJECTED ${ev.ticker}: matched ${dedupCheck.matchedSignalId} (${dedupCheck.reason})`);
                                            continue;
                                        }

                                        const { data: savedSignal, error: signalInsertErr } = await (supabase as any).from('signals').insert({
                                            ticker: ev.ticker,
                                            signal_type: signalType,
                                            confidence_score: analysis.data.confidence_score,
                                            calibrated_confidence: calibratedConfidence,
                                            risk_level: sanity.data.risk_score > 80 ? 'low' : 'medium',
                                            bias_type: (analysis.data as any).bias_type || 'recency_bias',
                                            thesis: analysis.data.thesis,
                                            counter_argument: sanity.data.counter_thesis,
                                            suggested_entry_low: analysis.data.suggested_entry_low,
                                            suggested_entry_high: analysis.data.suggested_entry_high,
                                            stop_loss: stopLoss,
                                            target_price: analysis.data.target_price,
                                            trailing_stop_rule: trailingStopRule,
                                            ta_snapshot: taSnapshot as unknown as Json,
                                            ta_alignment: taAlignment,
                                            confluence_score: confluence.score,
                                            confluence_level: confluence.level,
                                            projected_roi: projectedRoi,
                                            projected_win_rate: projectedWinRate,
                                            similar_events_count: similarEventsCount,
                                            data_quality: 'full',
                                            agent_outputs: { scan_phase: currentScanPhase,
                                                overreaction: catalystAgentUsed ? undefined : analysis.data,
                                                bullish_catalyst: catalystAgentUsed ? analysis.data as any : undefined,
                                                red_team: sanity.data,
                                                self_critique: critiqueOutput,
                                                sentiment_divergence: divergenceResult ? {
                                                    type: divergenceResult.divergenceType,
                                                    sentiment_avg: divergenceResult.sentimentAvg,
                                                    sentiment_trend: divergenceResult.sentimentTrend,
                                                    confidence_boost: divergenceResult.confidenceBoost,
                                                    article_count: divergenceResult.articleCount,
                                                } : null,
                                                gap_analysis: gapFill.isCandidate ? {
                                                    gap_pct: gapFill.gapPct,
                                                    gap_type: gapFill.gapType,
                                                    gap_fill_target: gapFill.gapFillTarget,
                                                } : null,
                                                earnings_guard: earningsGuardResult?.hasUpcomingEarnings ? {
                                                    earnings_date: earningsGuardResult.earningsDate,
                                                    days_until: earningsGuardResult.daysUntilEarnings,
                                                    penalty: earningsGuardResult.confidencePenalty,
                                                } : null,
                                                fundamentals: fundamentalsData ? {
                                                    pe_ratio: fundamentalsData.pe_ratio,
                                                    debt_to_equity: fundamentalsData.debt_to_equity,
                                                    profit_margin: fundamentalsData.profit_margin,
                                                    revenue_growth_yoy: fundamentalsData.revenue_growth_yoy,
                                                    short_interest_pct: fundamentalsData.short_interest_pct,
                                                } : null,
                                                market_regime: regimeResult ? {
                                                    regime: regimeResult.regime,
                                                    vix: regimeResult.vixLevel,
                                                    penalty: regimeResult.confidencePenalty,
                                                } : null,
                                                backtest: backtestResult ? {
                                                    signal_type_win_rate: backtestResult.signalTypeWinRate,
                                                    ticker_win_rate: backtestResult.tickerWinRate,
                                                    ticker_consecutive_losses: backtestResult.tickerConsecutiveLosses,
                                                    penalty: backtestResult.confidencePenalty,
                                                    recency_weighted_win_rate: backtestResult.recencyWeightedWinRate,
                                                    degrading_edge: backtestResult.degradingEdge,
                                                } : null,
                                                multi_timeframe: mtfResult ? {
                                                    weekly_trend: mtfResult.weeklyTrend,
                                                    weekly_rsi: mtfResult.weeklyRsi,
                                                    alignment: mtfResult.alignment,
                                                    adjustment: mtfResult.confidenceAdjustment,
                                                } : null,
                                                correlation_guard: correlationResult ? {
                                                    sector: correlationResult.sector,
                                                    sector_count: correlationResult.sectorSignalCount,
                                                    total_active: correlationResult.totalActiveSignals,
                                                    penalty: correlationResult.confidencePenalty,
                                                } : null,
                                                price_correlation: priceCorr && priceCorr.highlyCorrelatedTickers.length > 0 ? {
                                                    highly_correlated: priceCorr.highlyCorrelatedTickers,
                                                    max_correlation: priceCorr.maxCorrelation,
                                                    penalty: priceCorr.confidencePenalty,
                                                    reason: priceCorr.reason,
                                                } : null,
                                                options_flow: optionsFlowResult?.hasUnusualActivity ? {
                                                    has_unusual_activity: true,
                                                    sentiment: optionsFlowResult.sentiment,
                                                    put_call_ratio: optionsFlowResult.putCallRatio,
                                                    confidence_adjustment: optionsFlowResult.confidenceAdjustment,
                                                    summary: optionsFlowResult.summary,
                                                } : null,
                                                peer_strength: peerStrengthResult && peerStrengthResult.peers.length > 0 ? {
                                                    peer_avg_change: peerStrengthResult.peerAvgChange,
                                                    sector_etf_change: peerStrengthResult.sectorEtfChange,
                                                    relative_strength: peerStrengthResult.relativeStrength,
                                                    relative_to_sector: peerStrengthResult.relativeToSector,
                                                    is_idiosyncratic: peerStrengthResult.isIdiosyncratic,
                                                    momentum_divergence: peerStrengthResult.momentumDivergence,
                                                    volume_signal: peerStrengthResult.volumeSignal,
                                                    confidence_adjustment: peerStrengthResult.confidenceAdjustment,
                                                    peers: peerStrengthResult.peers.map(p => ({ ticker: p.ticker, change_pct: p.changePercent })),
                                                } : null,
                                                conflict_check: conflictResult?.hasConflicts ? {
                                                    has_conflicts: true,
                                                    conflict_count: conflictResult.conflicts.length,
                                                    penalty: conflictResult.confidencePenalty,
                                                    summary: conflictResult.summary,
                                                } : null,
                                                conflict_resolution: conflictResult?.resolutions?.filter(r => r.action !== 'none').length
                                                    ? conflictResult.resolutions.filter(r => r.action !== 'none')
                                                    : null,
                                                fear_greed: fearGreedScore !== undefined ? {
                                                    score: fearGreedScore,
                                                    rating: fearGreedRating,
                                                    confidence_adjustment: fearGreedAdjustment,
                                                } : null,
                                                conviction_filter: analysis.data.conviction_score != null ? {
                                                    conviction_score: analysis.data.conviction_score,
                                                    moat_rating: analysis.data.moat_rating,
                                                    lynch_category: analysis.data.lynch_category as LynchCategory,
                                                    why_high_conviction: analysis.data.why_high_conviction,
                                                    margin_of_safety_pct: marginOfSafetyPct,
                                                } : null,
                                                sector_rotation: regimeResult ? {
                                                    regime: regimeResult.regime,
                                                    regime_reason: regimeResult.reason ?? '',
                                                    ticker_sector_category: tickerSector || 'Unknown',
                                                    growth_avg: 0,
                                                    defensive_avg: 0,
                                                    cyclical_avg: 0,
                                                } : null,
                                                cross_source: crossSourceResult ? {
                                                    quality_tier: crossSourceResult.qualityTier,
                                                    quality_score: crossSourceResult.qualityScore,
                                                    confirmed_sources: crossSourceResult.confirmedSources,
                                                    total_sources: crossSourceResult.totalSources,
                                                    confidence_adjustment: crossSourceResult.confidenceAdjustment,
                                                    sources: crossSourceResult.sources.map(s => ({
                                                        source: s.source,
                                                        confirmed: s.confirmed,
                                                        detail: s.detail,
                                                    })),
                                                } : null,
                                                retail_vs_news: retailVsNewsResult && retailVsNewsResult.gapType !== 'insufficient_data' ? {
                                                    gap_type: retailVsNewsResult.gapType,
                                                    retail_sentiment: retailVsNewsResult.retailSentiment,
                                                    news_sentiment: retailVsNewsResult.newsSentiment,
                                                    sentiment_gap: retailVsNewsResult.sentimentGap,
                                                    confidence_adjustment: retailVsNewsResult.confidenceAdjustment,
                                                } : null,
                                                source_diversity: sourceDiversityResult ? {
                                                    diversity_score: sourceDiversityResult.diversityScore,
                                                    source_count: sourceDiversityResult.sourceCount,
                                                    tier1_count: sourceDiversityResult.tier1Count,
                                                    tier2_count: sourceDiversityResult.tier2Count,
                                                    tier3_count: sourceDiversityResult.tier3Count,
                                                    cap_applied: sourceDiversityResult.capApplied,
                                                    confidence_adjustment: sourceDiversityResult.confidenceAdjustment,
                                                    summary: sourceDiversityResult.summary,
                                                } : null,
                                                bias_detective: biasDetectiveOutput,
                                                noise_confidence: noiseConfidenceOutput,
                                                decision_twin: decisionTwinOutput,
                                                swot: swotOutput,
                                                // Reasoning-audit features
                                                pre_mortem: preMortemOutput,
                                                toxic_combination: toxicComboOutput,
                                                // Behavioral Layer (category-defining)
                                                other_mind: behavioralOutput?.otherMind ?? null,
                                                narrative_lifecycle: behavioralOutput?.narrative ?? null,
                                                cohort_sequence: behavioralOutput?.cohortSequence ?? null,
                                                rpd_pattern: rpdMatchResult ? {
                                                    matches: rpdMatchResult.matches.length,
                                                    historical_win_rate: rpdMatchResult.historical_win_rate,
                                                    avg_return: rpdMatchResult.avg_return,
                                                    confidence_adjustment: rpdMatchResult.confidence_adjustment,
                                                    pattern_summary: rpdMatchResult.pattern_summary,
                                                    sufficient_data: rpdMatchResult.sufficient_data,
                                                } : null,
                                                beneficial_patterns: beneficialResult && beneficialResult.patterns_detected.length > 0 ? {
                                                    patterns: beneficialResult.patterns_detected.map(p => p.name),
                                                    total_boost: beneficialResult.total_boost,
                                                    summary: beneficialResult.summary,
                                                } : null,
                                                dqi: dqiResult ? {
                                                    score: dqiResult.score,
                                                    quality_tier: dqiResult.quality_tier,
                                                    components: dqiResult.components,
                                                } : null,
                                                     // Agent Context Bus — cascading intelligence audit trail
                                                context_bus: AgentContextBus.serialize(agentCtx),
                                                // A/B experiment assignment (if any)
                                                ab_experiment: abAssignments.length > 0 && abAssignments[0] ? {
                                                    experiment_id: abAssignments[0].experimentId,
                                                    variant: abAssignments[0].variant,
                                                    params: abAssignments[0].params,
                                                } : null,
                                                // Signal quality metadata (Item 3 + 5)
                                                news_age_hours: newsAgeHours !== null ? Math.round(newsAgeHours * 10) / 10 : null,
                                                rr_ratio: rrRatio !== undefined ? Math.round(rrRatio * 100) / 100 : null,
                                            } as unknown as Json,
                                            dqi_score: dqiResult?.score ?? null,
                                            dqi_components: dqiResult?.components ? (dqiResult.components as unknown as Json) : null,
                                            margin_of_safety_pct: marginOfSafetyPct,
                                            conviction_score: typeof analysis.data.conviction_score === 'number'
                                                ? Math.max(0, Math.min(100, Math.round(analysis.data.conviction_score))) : null,
                                            moat_rating: typeof analysis.data.moat_rating === 'number'
                                                ? Math.max(1, Math.min(10, Math.round(analysis.data.moat_rating))) : null,
                                            lynch_category: ['fast_grower', 'stalwart', 'turnaround', 'asset_play', 'cyclical', 'slow_grower']
                                                .includes(analysis.data.lynch_category) ? analysis.data.lynch_category : null,
                                            why_high_conviction: analysis.data.why_high_conviction || null,
                                            status: 'active',
                                            secondary_biases: [],
                                            sources: [],
                                            is_paper: false,
                                            // outcome_status: 'pending_outcome', // Removed to support older schemas
                                            outcome_due_at: new Date(Date.now() + (analysis.data.timeframe_days || 30) * 2 * 24 * 60 * 60 * 1000).toISOString(),
                                            outcome_review_days: (analysis.data.timeframe_days || 30) * 2
                                        }).select().single();

                                        if (signalInsertErr) {
                                            console.error(`[Scanner] Failed to save signal for ${ev.ticker}:`, signalInsertErr.message);
                                        }

                                        // 8b. Seed outcome tracking row so OutcomeTracker can follow this
                                        // signal. Count the signal only after a confirmed persist — it was
                                        // previously incremented before the dedup gate + a failable insert,
                                        // over-counting dropped/failed signals in scan_logs.signals_generated.
                                        if (savedSignal) {
                                            signalsGenerated++;

                                            // Invalidate correlation + conflict caches
                                            CorrelationGuard.invalidateCache();
                                            ConflictDetector.invalidateCache();
                                            PriceCorrelationMatrix.invalidateCache();

                                            // Dispatch alert rules
                                            NotificationService.checkAndDispatchAlerts(savedSignal);

                                            const { error: seedErr } = await supabase.from('signal_outcomes').insert({
                                                signal_id: savedSignal.id,
                                                ticker: ev.ticker,
                                                entry_price: entryPrice,
                                                outcome: 'pending',
                                                hit_stop_loss: false,
                                                hit_target: false,
                                            });
                                            if (seedErr) console.warn(`[Scanner] Outcome seed failed for ${ev.ticker} (${savedSignal.id}):`, seedErr.message);
                                        }

                                        // 9. Position sizing recommendation (portfolio-aware V2 with dynamic stops)
                                        try {
                                            const tickerSectorForSizing = tickersToScan.find(t => t.ticker === ev.ticker)?.sector || 'Unknown';
                                            const sizing = await PortfolioAwareSizer.calculateSize(
                                                analysis.data.confidence_score,
                                                entryPrice,
                                                analysis.data.target_price,
                                                signalType,
                                                taSnapshot,
                                                ev.ticker,
                                                tickerSectorForSizing,
                                                confluence.score,
                                                typeof analysis.data.conviction_score === 'number' ? analysis.data.conviction_score : undefined,
                                            );
                                            console.log(`[Scanner] Position size for ${ev.ticker}: ${sizing.recommendedPct}% ($${sizing.usdValue}) via ${sizing.method}${sizing.wasReduced ? ` [REDUCED: ${sizing.reductionReason}]` : ''}${sizing.stopLoss ? ` | SL: $${sizing.stopLoss}` : ''}`);

                                            // Persist position sizing into agent_outputs
                                            if (savedSignal) {
                                                const existingOutputs = (savedSignal.agent_outputs as unknown as AgentOutputsJson) || {};
                                                await supabase.from('signals').update({
                                                    agent_outputs: { scan_phase: currentScanPhase,
                                                        ...existingOutputs,
                                                        position_sizing: {
                                                            recommended_pct: sizing.recommendedPct,
                                                            usd_value: sizing.usdValue,
                                                            shares: sizing.shares ?? null,
                                                            method: sizing.method,
                                                            stop_loss: sizing.stopLoss,
                                                            risk_reward_ratio: sizing.riskRewardRatio,
                                                        },
                                                    } as any,
                                                }).eq('id', savedSignal.id);

                                                // SECURE PAPER TRADE EXECUTION 
                                                // Trigger auto-execution if conviction and calibration thresholds are met
                                                if ((calibratedConfidence ?? 0) >= 85 && sizing.shares && sizing.shares > 0) {
                                                    console.log(`[Scanner] Auto-executing Alpaca bracket order for ${sizing.shares}x ${ev.ticker} (Confidence: ${calibratedConfidence})`);
                                                    await AlpacaService.submitBracketOrder(
                                                        ev.ticker,
                                                        sizing.shares,
                                                        'buy',
                                                        entryPrice,
                                                        analysis.data.target_price,
                                                        sizing.stopLoss || stopLoss
                                                    );
                                                }
                                            }
                                        } catch { /* non-fatal */ }
                                    }

                                    // ─── 10. CONTAGION PIPELINE ───
                                    // After overreaction analysis, check if sector peers are
                                    // dropping in sympathy with no real exposure
                                    try {
                                        const epicenterSector = tickersToScan.find(t => t.ticker === ev.ticker)?.sector;
                                        if (epicenterSector) {
                                            // Find same-sector peers (excluding epicenter)
                                            const sectorPeers = tickers.filter(
                                                t => t !== ev.ticker &&
                                                    tickersToScan.find(w => w.ticker === t)?.sector === epicenterSector
                                            );

                                            if (sectorPeers.length > 0) {
                                                // Ask Gemini which peers are likely contagion candidates
                                                const discovery = await AgentService.discoverSatellites(
                                                    ev.ticker,
                                                    ev.headline,
                                                    epicenterSector,
                                                    sectorPeers
                                                );

                                                const satellites = discovery.success
                                                    ? (discovery.data?.satellites || []).filter(s => s.expected_exposure === 'none' || s.expected_exposure === 'low')
                                                    : [];

                                                console.log(`[Scanner] Contagion: ${satellites.length} satellite candidates for ${ev.ticker} event`);

                                                // Evaluate each satellite
                                                for (const sat of satellites.slice(0, 3)) { // Cap at 3 to control API cost
                                                    let satQuote: Quote | null = null;
                                                    try {
                                                        satQuote = await MarketDataService.getQuote(sat.ticker);
                                                    } catch (e: any) {
                                                        console.warn(`[Scanner] Contagion: skipping ${sat.ticker}, no quote:`, e.message);
                                                        continue;
                                                    }

                                                    const satDrop = satQuote.changePercent;
                                                    // Only evaluate if satellite is actually dropping
                                                    if (satDrop >= -1) continue;

                                                    const contagion = await AgentService.evaluateContagion({
                                                        epicenterTicker: ev.ticker,
                                                        satelliteTicker: sat.ticker,
                                                        epicenterNews: ev.headline,
                                                        satelliteDropPct: satDrop,
                                                        performanceContext: perfContext
                                                    });

                                                    if (contagion.success && contagion.data?.is_contagion && contagion.data.confidence_score > CONFIDENCE_GATE_CONTAGION) {
                                                        // Sanity check the contagion trade
                                                        const contagionSanity = await AgentService.runSanityCheck({
                                                            ticker: sat.ticker,
                                                            originalThesis: contagion.data.thesis,
                                                            targetPrice: contagion.data.target_price,
                                                            stopLoss: contagion.data.stop_loss,
                                                            agentType: 'CONTAGION_AGENT',
                                                            performanceContext: perfContext
                                                        });

                                                        if (contagionSanity.success && contagionSanity.data?.passes_sanity_check) {
                                                            // Margin-of-safety check for contagion
                                                            const contagionMos = ConvictionGuardrails.checkMarginOfSafety(
                                                                satQuote.price,
                                                                (satQuote as any).fiftyTwoWeekHigh ?? 0,
                                                                contagion.data.confidence_score,
                                                            );
                                                            if (!contagionMos.passed) {
                                                                console.warn(`[Scanner] MoS gate blocked contagion ${sat.ticker}: ${contagionMos.reason}`);
                                                                continue;
                                                            }

                                                            const contagionMarginPct = (satQuote as any).fiftyTwoWeekHigh && (satQuote as any).fiftyTwoWeekHigh > 0
                                                                ? Math.round((((satQuote as any).fiftyTwoWeekHigh - satQuote.price) / (satQuote as any).fiftyTwoWeekHigh) * 1000) / 10
                                                                : null;

                                                            // Confluence for contagion signal
                                                            const satSnapshot = await TechnicalAnalysisService.getSnapshot(sat.ticker);
                                                            const contagionConfluence = TechnicalAnalysisService.computeConfluence(
                                                                satSnapshot, 'long', contagion.data.confidence_score
                                                            );

                                                            const { data: savedContagionSignal, error: contagionInsertErr } = await supabase.from('signals').insert({
                                                                ticker: sat.ticker,
                                                                signal_type: 'sector_contagion',
                                                                confidence_score: contagion.data.confidence_score,
                                                                risk_level: contagionSanity.data.risk_score > 80 ? 'low' : 'medium',
                                                                bias_type: contagion.data.bias_type || 'representativeness_heuristic',
                                                                thesis: contagion.data.thesis,
                                                                counter_argument: contagionSanity.data.counter_thesis,
                                                                suggested_entry_low: contagion.data.suggested_entry_low,
                                                                suggested_entry_high: contagion.data.suggested_entry_high,
                                                                stop_loss: contagion.data.stop_loss,
                                                                target_price: contagion.data.target_price,
                                                                confluence_score: contagionConfluence.score,
                                                                confluence_level: contagionConfluence.level,
                                                                agent_outputs: { scan_phase: currentScanPhase,
                                                                    contagion: contagion.data,
                                                                    red_team: contagionSanity.data,
                                                                    epicenter: { ticker: ev.ticker, headline: ev.headline }
                                                                } as unknown as Json,
                                                                ta_snapshot: satSnapshot as unknown as Json,
                                                                status: 'active',
                                                                calibrated_confidence: await (async () => {
                                                                    try {
                                                                        const curve = await ConfidenceCalibrator.getCachedCurve();
                                                                        const score = contagion.data?.confidence_score ?? 0;
                                                                        return ConfidenceCalibrator.getCalibratedWinRate(score, curve);
                                                                    } catch { return null; /* never store raw confidence as calibrated */ }
                                                                })(),
                                                                margin_of_safety_pct: contagionMarginPct,
                                                                conviction_score: typeof contagion.data?.conviction_score === 'number'
                                                                    ? Math.max(0, Math.min(100, Math.round(contagion.data.conviction_score))) : null,
                                                                moat_rating: typeof contagion.data?.moat_rating === 'number'
                                                                    ? Math.max(1, Math.min(10, Math.round(contagion.data.moat_rating))) : null,
                                                                lynch_category: ['fast_grower', 'stalwart', 'turnaround', 'asset_play', 'cyclical', 'slow_grower']
                                                                    .includes(contagion.data.lynch_category) ? contagion.data.lynch_category : null,
                                                                why_high_conviction: contagion.data.why_high_conviction || null,
                                                                data_quality: 'partial',
                                                                secondary_biases: ['herding'],
                                                                sources: [],
                                                                is_paper: false,
                                                                // outcome_status: 'pending_outcome', // Removed to support older schemas
                                                                outcome_due_at: new Date(Date.now() + (contagion.data.timeframe_days || 60) * 24 * 60 * 60 * 1000).toISOString(),
                                                                outcome_review_days: (contagion.data.timeframe_days || 60)
                                                            }).select().single();

                                                            if (contagionInsertErr) {
                                                                console.error(`[Scanner] Failed to save contagion signal for ${sat.ticker}:`, contagionInsertErr.message);
                                                            }

                                                            // Seed outcome tracking — count only after a confirmed persist.
                                                            if (savedContagionSignal) {
                                                                signalsGenerated++;
                                                                ConflictDetector.invalidateCache();
                                                                CorrelationGuard.invalidateCache();
                                                                PriceCorrelationMatrix.invalidateCache();
                                                                NotificationService.checkAndDispatchAlerts(savedContagionSignal);

                                                                const { error: contagionSeedErr } = await supabase.from('signal_outcomes').insert({
                                                                    signal_id: savedContagionSignal.id,
                                                                    ticker: sat.ticker,
                                                                    entry_price: satQuote.price,
                                                                    outcome: 'pending',
                                                                    hit_stop_loss: false,
                                                                    hit_target: false,
                                                                });
                                                                if (contagionSeedErr) console.warn(`[Scanner] Contagion outcome seed failed for ${sat.ticker}:`, contagionSeedErr.message);
                                                            }

                                                            console.log(`[Scanner] Contagion signal: ${sat.ticker} (sympathy drop from ${ev.ticker})`);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    } catch (contagionErr: any) {
                                        console.error(`[Scanner] Contagion pipeline error for ${ev.ticker}:`, contagionErr.message);
                                        // Non-fatal — don't kill the scan
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 11. Update pending outcomes (check stops/targets/intervals)
            try {
                await OutcomeTracker.updatePendingOutcomes();
            } catch (outcomeErr: any) {
                console.warn('[Scanner] Outcome tracker error:', outcomeErr.message);
            }

            // 11a1. Thesis Invalidation — actively check open signals for thesis-breaking events
            try {
                void ThesisInvalidationDetector.checkActiveSignals().catch(e =>
                    console.warn('[Scanner] Thesis invalidation check failed (non-fatal):', e)
                );
            } catch { /* non-fatal */ }

            // 11a2. Outcome Narratives — generate post-mortem analysis for completed signals
            try {
                void OutcomeNarrativeAgent.generatePendingNarratives().catch(e =>
                    console.warn('[Scanner] Outcome narrative generation failed (non-fatal):', e)
                );
            } catch { /* non-fatal */ }

            // 11b. Auto-Learning — automatic trigger (replaces manual 20-outcome check)
            try {
                void AutoLearningService.checkAndTrigger().catch(e =>
                    console.warn('[Scanner] Auto-learning check failed (non-fatal):', e)
                );
                // Causal learning: pairwise bias interaction + stratified causal analysis
                void AutoLearningService.detectPairwiseInteractions().catch(e =>
                    console.warn('[Scanner] Pairwise interaction detection failed (non-fatal):', e)
                );
                void AutoLearningService.runStratifiedAnalysis().catch(e =>
                    console.warn('[Scanner] Stratified analysis failed (non-fatal):', e)
                );
            } catch { /* non-fatal */ }

            // 11b2. A/B Test Auto-Promotion — check for experiments ready to conclude
            try {
                void ABTestingFramework.autoPromoteWinners().catch(e =>
                    console.warn('[Scanner] A/B auto-promotion check failed (non-fatal):', e)
                );
            } catch { /* non-fatal */ }

            // 11c. Proactive Thesis Generation — generate trade hypotheses without events
            // Runs AFTER reactive scan to use remaining budget on proactive setups
            try {
                const proactiveResult = await ProactiveThesisEngine.scan(
                    tickersToScan.map(t => ({ ticker: t.ticker, sector: t.sector })),
                    regimeResult?.regime,
                );
                if (proactiveResult.theses.length > 0) {
                    console.log(`[Scanner] Proactive engine found ${proactiveResult.theses.length} setups`);
                    for (const thesis of proactiveResult.theses) {
                        try {
                            await this.ensureWatchlistEntry(thesis.ticker);

                            // Quality Gate 1: Conflict Detection — check for contradictions with active signals
                            const tickerSectorForConflict = tickersToScan.find(t => t.ticker === thesis.ticker)?.sector || 'Unknown';
                            let proactiveConflictResult: import('./conflictDetector').ConflictResult | null = null;
                            try {
                                proactiveConflictResult = await ConflictDetector.checkConflicts(
                                    thesis.ticker,
                                    thesis.direction,
                                    thesis.thesis,
                                    tickerSectorForConflict,
                                );
                                if (proactiveConflictResult.shouldBlock) {
                                    console.warn(`[Scanner] Proactive thesis for ${thesis.ticker} BLOCKED by conflict detector: ${proactiveConflictResult.summary}`);
                                    continue;
                                }
                                // Apply conflict penalty
                                if (proactiveConflictResult.confidencePenalty !== 0) {
                                    thesis.confidence = Math.max(CONFIDENCE_FLOOR, thesis.confidence + proactiveConflictResult.confidencePenalty);
                                    console.log(`[Scanner] Proactive conflict penalty for ${thesis.ticker}: ${proactiveConflictResult.confidencePenalty}`);
                                }
                            } catch { /* non-fatal */ }

                            // Quality Gate 2: Sanity Check (Red Team) — attack the proactive thesis.
                            // FAIL CLOSED: a thesis that can't clear — or even reach — the Red Team is
                            // dropped, never saved. Red Team killing flawed signals is the structural
                            // difference between Sentinel and a normal signal generator; it must never be
                            // advisory. Mirrors the reactive + single-ticker gates (redTeamGate()).
                            let proactiveSanity: import('@/types/agents').SanityCheckResult | null = null;
                            try {
                                const sanityResult = await AgentService.runSanityCheck({
                                    ticker: thesis.ticker,
                                    originalThesis: thesis.thesis,
                                    targetPrice: thesis.target_price,
                                    stopLoss: thesis.stop_loss,
                                    agentType: 'PROACTIVE_THESIS_ENGINE'
                                });
                                if (sanityResult.success && sanityResult.data) {
                                    proactiveSanity = sanityResult.data;
                                } else {
                                    console.warn(`[Scanner] Proactive Red Team unavailable for ${thesis.ticker}: ${sanityResult.error ?? 'no data'} — dropping (fail closed)`);
                                }
                            } catch (sanityErr: any) {
                                console.warn(`[Scanner] Proactive Red Team threw for ${thesis.ticker}: ${sanityErr?.message ?? sanityErr} — dropping (fail closed)`);
                            }
                            if (!proactiveSanity) {
                                continue; // no adversarial verdict obtained → do not ship the thesis
                            }
                            if (!proactiveSanity.passes_sanity_check) {
                                console.warn(`[Scanner] Proactive thesis for ${thesis.ticker} FAILED sanity check: ${proactiveSanity.fatal_flaws?.join(', ')}`);
                                continue;
                            }
                            const proactiveRtGate = redTeamGate(proactiveSanity);
                            if (!proactiveRtGate.allow) {
                                console.warn(`[Scanner] RED TEAM BLOCKED proactive ${thesis.ticker}: ${proactiveRtGate.reason}`);
                                continue;
                            }

                            // Quality Gate 3: Minimum confidence after adjustments
                            if (thesis.confidence < adaptiveMinConfidence) {
                                console.warn(`[Scanner] Proactive thesis for ${thesis.ticker} below min confidence (${thesis.confidence} < ${adaptiveMinConfidence})`);
                                continue;
                            }

                            // Quality Gate 4: Run proactive theses through core intelligence pipeline
                            const proactiveCtx = AgentContextBus.create(thesis.ticker, `[PROACTIVE] ${thesis.catalyst}`, thesis.catalyst);
                            let proactiveBiasOutput: import('@/types/agents').BiasDetectiveResult | null = null;
                            let proactiveNoiseOutput: import('@/types/agents').NoiseConfidenceResult | null = null;
                            let proactiveTwinOutput: import('@/types/agents').DecisionTwinResult | null = null;
                            let proactiveSwotOutput: import('@/types/agents').SWOTResult | null = null;
                            let proactiveCumulativePenalty = 0;
                            let proactiveCumulativeBoost = 0;

                            // 4a. Bias Detective — check proactive reasoning for cognitive biases
                            try {
                                const biasResult = await AgentService.runBiasDetective(
                                    thesis.thesis, thesis.reasoning, thesis.confidence, 'PROACTIVE_THESIS_ENGINE'
                                );
                                if (biasResult.success && biasResult.data) {
                                    proactiveBiasOutput = biasResult.data;
                                    enrichWithMitigations(proactiveBiasOutput.findings);
                                    AgentContextBus.setBiasDetective(proactiveCtx, biasResult.data);
                                    if (biasResult.data.total_penalty > 0) {
                                        const before = thesis.confidence;
                                        const bounded = applyBoundedAdjustment(before, -biasResult.data.total_penalty, proactiveCumulativePenalty, proactiveCumulativeBoost);
                                        thesis.confidence = bounded.confidence;
                                        proactiveCumulativePenalty = bounded.cumulativePenalty;
                                        proactiveCumulativeBoost = bounded.cumulativeBoost;
                                        AgentContextBus.recordAdjustment(proactiveCtx, 'bias_detective', before, thesis.confidence, `dominant: ${biasResult.data.dominant_bias}`);
                                        console.log(`[Scanner] Proactive Bias Detective for ${thesis.ticker}: ${before} → ${thesis.confidence}`);
                                    }
                                }
                            } catch { /* non-fatal */ }

                            // 4b. Noise-Aware Confidence — 3-judge panel
                            try {
                                const noiseCascadeCtx = AgentContextBus.buildPromptContext(proactiveCtx, 'noise_panel');
                                proactiveNoiseOutput = await NoiseAwareConfidenceService.evaluate(
                                    thesis.thesis, thesis.reasoning, thesis.confidence, 'PROACTIVE_THESIS_ENGINE', noiseCascadeCtx || undefined,
                                );
                                AgentContextBus.setNoisePanel(proactiveCtx, proactiveNoiseOutput);
                                if (proactiveNoiseOutput.confidence_adjustment !== 0) {
                                    const before = thesis.confidence;
                                    const bounded = applyBoundedAdjustment(before, proactiveNoiseOutput.confidence_adjustment, proactiveCumulativePenalty, proactiveCumulativeBoost);
                                    thesis.confidence = bounded.confidence;
                                    proactiveCumulativePenalty = bounded.cumulativePenalty;
                                    proactiveCumulativeBoost = bounded.cumulativeBoost;
                                    AgentContextBus.recordAdjustment(proactiveCtx, 'noise_panel', before, thesis.confidence, proactiveNoiseOutput.summary);
                                    console.log(`[Scanner] Proactive Noise Panel for ${thesis.ticker}: ${before} → ${thesis.confidence}`);
                                }
                            } catch { /* non-fatal */ }

                            // 4c. Decision Twin — 3 investor personas
                            try {
                                proactiveTwinOutput = await DecisionTwinService.simulate({
                                    ticker: thesis.ticker,
                                    thesis: thesis.thesis,
                                    reasoning: thesis.reasoning,
                                    confidence: thesis.confidence,
                                    targetPrice: thesis.target_price,
                                    stopLoss: thesis.stop_loss,
                                    currentPrice: thesis.suggested_entry_high || thesis.suggested_entry_low,
                                    signalType: thesis.catalyst,
                                    cascadingContext: AgentContextBus.buildPromptContext(proactiveCtx, 'decision_twin') || undefined,
                                });
                                AgentContextBus.setDecisionTwin(proactiveCtx, proactiveTwinOutput);
                                if (proactiveTwinOutput.confidence_adjustment !== 0) {
                                    const before = thesis.confidence;
                                    const bounded = applyBoundedAdjustment(before, proactiveTwinOutput.confidence_adjustment, proactiveCumulativePenalty, proactiveCumulativeBoost);
                                    thesis.confidence = bounded.confidence;
                                    proactiveCumulativePenalty = bounded.cumulativePenalty;
                                    proactiveCumulativeBoost = bounded.cumulativeBoost;
                                    AgentContextBus.recordAdjustment(proactiveCtx, 'decision_twin', before, thesis.confidence, proactiveTwinOutput.summary);
                                    console.log(`[Scanner] Proactive Decision Twin for ${thesis.ticker}: ${before} → ${thesis.confidence} (${proactiveTwinOutput.summary})`);
                                }
                                // Suppress if all 3 personas voted SKIP
                                if (proactiveTwinOutput.skip_count === 3) {
                                    console.warn(`[Scanner] Proactive thesis for ${thesis.ticker} suppressed: all 3 personas voted SKIP`);
                                    continue;
                                }
                            } catch { /* non-fatal */ }

                            // 4d. SWOT Analysis with confidence feedback
                            try {
                                proactiveSwotOutput = await SWOTAnalysisService.analyze({
                                    ticker: thesis.ticker,
                                    headline: `[PROACTIVE: ${thesis.catalyst}]`,
                                    thesis: thesis.thesis,
                                    reasoning: thesis.reasoning,
                                    confidence: thesis.confidence,
                                    signalType: thesis.catalyst,
                                    decisionTwin: proactiveTwinOutput,
                                });
                                const sCount = proactiveSwotOutput.strengths.length;
                                const wCount = proactiveSwotOutput.weaknesses.length;
                                const tCount = proactiveSwotOutput.threats.length;
                                if (wCount > sCount && tCount > 1) {
                                    const before = thesis.confidence;
                                    const swotPenalty = wCount >= sCount * 2 ? -SWOT_SEVERE_IMBALANCE_PENALTY : -SWOT_WEAKNESS_IMBALANCE_PENALTY;
                                    const bounded = applyBoundedAdjustment(before, swotPenalty, proactiveCumulativePenalty, proactiveCumulativeBoost);
                                    thesis.confidence = bounded.confidence;
                                    proactiveCumulativePenalty = bounded.cumulativePenalty;
                                    proactiveCumulativeBoost = bounded.cumulativeBoost;
                                    AgentContextBus.recordAdjustment(proactiveCtx, 'swot_feedback', before, thesis.confidence, `W=${wCount} > S=${sCount}`);
                                    console.log(`[Scanner] Proactive SWOT feedback for ${thesis.ticker}: ${before} → ${thesis.confidence}`);
                                }
                            } catch { /* non-fatal */ }

                            // Re-check confidence after pipeline enrichment
                            if (thesis.confidence < adaptiveMinConfidence) {
                                console.warn(`[Scanner] Proactive thesis for ${thesis.ticker} dropped after pipeline enrichment (${thesis.confidence} < ${adaptiveMinConfidence})`);
                                continue;
                            }

                            // Save proactive thesis as a fully enriched signal
                            const { data: savedProactiveSignal, error: proactiveInsertErr } = await supabase.from('signals').insert({
                                ticker: thesis.ticker,
                                signal_type: thesis.direction === 'short' ? 'short_overreaction' : 'long_overreaction',
                                status: 'active',
                                confidence_score: thesis.confidence,
                                risk_level: thesis.confidence >= 75 ? 'low' : thesis.confidence >= 60 ? 'medium' : 'high',
                                thesis: `[PROACTIVE: ${thesis.catalyst}] ${thesis.thesis}`,
                                bias_type: 'overreaction',
                                secondary_biases: [],
                                bias_explanation: thesis.reasoning,
                                counter_argument: '',
                                suggested_entry_low: thesis.suggested_entry_low,
                                suggested_entry_high: thesis.suggested_entry_high,
                                stop_loss: thesis.stop_loss,
                                target_price: thesis.target_price,
                                expected_timeframe_days: thesis.timeframe_days,
                                sources: ['proactive_thesis_engine'],
                                agent_outputs: {
                                    proactive_thesis: {
                                        catalyst: thesis.catalyst,
                                        urgency: thesis.urgency,
                                        reasoning: thesis.reasoning,
                                        direction: thesis.direction,
                                    },
                                    conflict_check: proactiveConflictResult?.hasConflicts ? {
                                        has_conflicts: true,
                                        conflict_count: proactiveConflictResult.conflicts.length,
                                        penalty: proactiveConflictResult.confidencePenalty,
                                        summary: proactiveConflictResult.summary,
                                    } : null,
                                    conflict_resolution: proactiveConflictResult?.resolutions?.filter(r => r.action !== 'none').length
                                        ? proactiveConflictResult.resolutions.filter(r => r.action !== 'none')
                                        : null,
                                    red_team: proactiveSanity,
                                    bias_detective: proactiveBiasOutput,
                                    noise_confidence: proactiveNoiseOutput,
                                    decision_twin: proactiveTwinOutput,
                                    swot: proactiveSwotOutput,
                                    context_bus: AgentContextBus.serialize(proactiveCtx),
                                } as any,
                                data_quality: 'full',
                                is_paper: false,
                            }).select().single();

                            if (proactiveInsertErr) {
                                console.warn(`[Scanner] Failed to save proactive signal for ${thesis.ticker}:`, proactiveInsertErr.message);
                            }
                            // Count + seed outcome tracking only after a confirmed persist. Without the
                            // seed row OutcomeTracker can never close these signals — they were previously
                            // orphaned (live signals with no trackable outcome, invisible to calibration).
                            if (savedProactiveSignal) {
                                signalsGenerated++;
                                const proactiveEntry = thesis.suggested_entry_high ?? thesis.suggested_entry_low;
                                if (proactiveEntry != null) {
                                    const { error: proactiveSeedErr } = await supabase.from('signal_outcomes').insert({
                                        signal_id: savedProactiveSignal.id,
                                        ticker: thesis.ticker,
                                        entry_price: proactiveEntry,
                                        outcome: 'pending',
                                        hit_stop_loss: false,
                                        hit_target: false,
                                    });
                                    if (proactiveSeedErr) console.warn(`[Scanner] Proactive outcome seed failed for ${thesis.ticker}:`, proactiveSeedErr.message);
                                } else {
                                    console.warn(`[Scanner] Proactive signal ${thesis.ticker} has no suggested entry — outcome seed skipped`);
                                }
                                console.log(`[Scanner] Proactive signal saved: ${thesis.ticker} (${thesis.catalyst}, ${thesis.urgency}, conf=${thesis.confidence})`);
                            }
                        } catch (saveErr) {
                            console.warn(`[Scanner] Failed to save proactive thesis for ${thesis.ticker}:`, saveErr);
                        }
                    }
                }
            } catch (proactiveErr) {
                console.warn('[Scanner] Proactive thesis engine failed (non-fatal):', proactiveErr);
            }

            // 11d. Earnings Anticipation — generate pre-earnings positioning signals
            try {
                const earningsAnticipation = await EarningsAnticipationAgent.scan(
                    tickersToScan.map(t => ({ ticker: t.ticker, sector: t.sector })),
                );
                if (earningsAnticipation.signals.length > 0) {
                    console.log(`[Scanner] Earnings Anticipation found ${earningsAnticipation.signals.length} pre-earnings setups`);
                    for (const eaSig of earningsAnticipation.signals) {
                        try {
                            await this.ensureWatchlistEntry(eaSig.ticker);

                            // Skip if fresh signal already exists for this ticker
                            const eaSignalType = eaSig.direction === 'short' ? 'short_overreaction' : 'long_overreaction';
                            const hasFresh = await SignalDecayEngine.hasFreshSignal(eaSig.ticker, eaSignalType);
                            if (hasFresh) continue;

                            // Conflict check
                            const eaSector = tickersToScan.find(t => t.ticker === eaSig.ticker)?.sector || 'Unknown';
                            const eaConflict = await ConflictDetector.checkConflicts(eaSig.ticker, eaSig.direction, eaSig.thesis, eaSector);
                            if (eaConflict.shouldBlock) {
                                console.warn(`[Scanner] Earnings anticipation for ${eaSig.ticker} blocked by conflict detector`);
                                continue;
                            }
                            if (eaConflict.confidencePenalty !== 0) {
                                eaSig.confidence = Math.max(CONFIDENCE_FLOOR, eaSig.confidence + eaConflict.confidencePenalty);
                            }

                            if (eaSig.confidence < adaptiveMinConfidence) continue;

                            const { data: savedEaSignal, error: eaInsertErr } = await supabase.from('signals').insert({
                                ticker: eaSig.ticker,
                                signal_type: eaSig.direction === 'short' ? 'short_overreaction' : 'long_overreaction',
                                status: 'active',
                                confidence_score: eaSig.confidence,
                                risk_level: eaSig.confidence >= 75 ? 'low' : eaSig.confidence >= 60 ? 'medium' : 'high',
                                thesis: `[EARNINGS ANTICIPATION: ${eaSig.setupType}] ${eaSig.thesis}`,
                                bias_type: 'overreaction',
                                secondary_biases: [],
                                bias_explanation: eaSig.reasoning,
                                counter_argument: eaSig.exit_before_earnings ? `Exit before earnings on ${eaSig.earningsDate}` : '',
                                suggested_entry_low: eaSig.suggested_entry_low,
                                suggested_entry_high: eaSig.suggested_entry_high,
                                stop_loss: eaSig.stop_loss,
                                target_price: eaSig.target_price,
                                expected_timeframe_days: eaSig.timeframe_days,
                                sources: ['earnings_anticipation_agent'],
                                agent_outputs: {
                                    earnings_anticipation: {
                                        setup_type: eaSig.setupType,
                                        earnings_date: eaSig.earningsDate,
                                        days_until_earnings: eaSig.daysUntilEarnings,
                                        exit_before_earnings: eaSig.exit_before_earnings,
                                        reasoning: eaSig.reasoning,
                                        direction: eaSig.direction,
                                    },
                                } as any,
                                data_quality: 'partial',
                                is_paper: false,
                            }).select().single();

                            if (eaInsertErr) {
                                console.warn(`[Scanner] Failed to save earnings anticipation signal for ${eaSig.ticker}:`, eaInsertErr.message);
                            }
                            // Count + seed outcome tracking only after a confirmed persist (EA signals
                            // were previously orphaned — no outcome row meant they could never close).
                            if (savedEaSignal) {
                                signalsGenerated++;
                                const eaEntry = eaSig.suggested_entry_high ?? eaSig.suggested_entry_low;
                                if (eaEntry != null) {
                                    const { error: eaSeedErr } = await supabase.from('signal_outcomes').insert({
                                        signal_id: savedEaSignal.id,
                                        ticker: eaSig.ticker,
                                        entry_price: eaEntry,
                                        outcome: 'pending',
                                        hit_stop_loss: false,
                                        hit_target: false,
                                    });
                                    if (eaSeedErr) console.warn(`[Scanner] EA outcome seed failed for ${eaSig.ticker}:`, eaSeedErr.message);
                                } else {
                                    console.warn(`[Scanner] EA signal ${eaSig.ticker} has no suggested entry — outcome seed skipped`);
                                }
                                console.log(`[Scanner] Earnings anticipation signal saved: ${eaSig.ticker} (${eaSig.setupType}, ${eaSig.daysUntilEarnings}d to earnings, conf=${eaSig.confidence})`);
                            }
                        } catch (saveErr) {
                            console.warn(`[Scanner] Failed to save earnings anticipation for ${eaSig.ticker}:`, saveErr);
                        }
                    }
                }
            } catch (eaErr) {
                console.warn('[Scanner] Earnings Anticipation agent failed (non-fatal):', eaErr);
            }

            // 11e. Signal Decay — set regime for adaptive decay
            try {
                const currentRegime = regimeResult?.regime;
                if (currentRegime) {
                    (SignalDecayEngine as any).setRegime(currentRegime);
                }
            } catch { /* non-fatal */ }

            // 12. Update Scan Log
            const durationMs = Date.now() - startTime;
            if (scanLog) {
                await supabase.from('scan_logs').update({
                    status: 'completed',
                    tickers_scanned: tickers.length,
                    events_detected: eventsFound,
                    signals_generated: signalsGenerated,
                    duration_ms: durationMs,
                }).eq('id', scanLog.id);
            }

            console.log(`[Scanner] Scan completed in ${durationMs}ms. ${signalsGenerated} signals generated.`);

            return {
                success: true,
                summary: `Scan complete: ${eventsFound} events, ${signalsGenerated} signals.`,
                tickersScanned: tickers.length,
                eventsDetected: eventsFound,
                signalsGenerated: signalsGenerated
            };

        } catch (e: any) {
            console.error('[Scanner] Fatal error:', e);

            // Attempt to update log as failed
            await supabase.from('scan_logs')
                .update({ status: 'failed', error_message: (e as Error).message })
                .eq('status', 'running'); // Best effort fallback

            return { success: false, error: e.message };
        }
    }

    /**
     * Run a manual, single-ticker scan.
     * Bypasses the active watchlist and runs the full pipeline on a specific ticker immediately.
     */
    static async runSingleTickerScan(
        ticker: string,
        isPaper: boolean = true,
        discoveryContext?: { reason: string; catalyst: string; direction: 'up' | 'down' | 'neutral'; expectedMovePct: number | null },
    ) {
        const startTime = Date.now();
        console.log(`[Scanner] Initiating manual scan for ${ticker}...`);

        try {
            // 0. Ensure ticker is in watchlist (FK constraint on market_events)
            await this.ensureWatchlistEntry(ticker);

            // 1. Log the start of the scan
            const { data: scanLog, error: logErr } = await supabase
                .from('scan_logs')
                .insert({
                    scan_type: 'manual',
                    status: 'running',
                    duration_ms: 0,
                    tickers_scanned: 1,
                    events_detected: 0,
                    signals_generated: 0,
                    estimated_cost_usd: 0
                })
                .select('id')
                .single();

            if (logErr) throw logErr;

            // 2. Fetch live quote for context to see if it's moving
            let quote;
            try {
                quote = await MarketDataService.getQuote(ticker);
            } catch (e) {
                console.warn(`[Scanner] Could not get live quote for ${ticker}`, e);
            }

            if (!quote?.price) {
                // Update scan log and return — no valid price data
                if (scanLog) {
                    await supabase.from('scan_logs').update({
                        status: 'completed',
                        error_message: `No live quote available for ${ticker}`,
                        duration_ms: Date.now() - startTime,
                    }).eq('id', scanLog.id);
                }
                return {
                    success: false,
                    verdict: 'no_data' as const,
                    stage: 'Live Quote',
                    reason: 'No live quote available — skipped to avoid a fabricated signal.',
                    summary: `No live quote available for ${ticker}. Skipping to avoid fabricated signals.`,
                    signalsGenerated: 0,
                };
            }

            const currentPrice = quote.price;
            const priceChangePct = quote.changePercent || 0;

            // 3. Grounded search for the latest, concrete event. When discovery handed us a
            // catalyst, anchor the search to it so we retrieve the SPECIFIC facts (numbers,
            // analyst reaction) rather than generic sentiment.
            const eventPrompt = discoveryContext
                ? `Find concrete, recent (last ~5 trading days) news for ${ticker} related to: ${discoveryContext.reason}. Report the specific facts — magnitude, numbers, and the analyst/market reaction.`
                : `Find the most recent, significant news event for ${ticker} from the last 48 hours. Focus on earnings, regulatory news, product launches, or major macroeconomic impacts specific to this company. If there is no major news, summarize the current market sentiment.`;

            const eventExtraction = await AgentService.extractEventsFromText(eventPrompt);
            const extractedEvent = (eventExtraction.success && eventExtraction.data?.events?.length > 0)
                ? eventExtraction.data.events[0] : null;
            const extractedEventType: string = extractedEvent?.event_type || '';

            // Event headline/description — prefer the discovery catalyst, enrich with the
            // extracted factual summary. This replaces the old "Event Type: X | Severity: Y"
            // stub the agent could never judge irrationality from.
            const eventHeadline = discoveryContext?.reason
                ? sanitizeUntrustedText(discoveryContext.reason, 200)
                : (extractedEvent?.headline || `Recent market activity for ${ticker}`);
            const descParts: string[] = [];
            if (discoveryContext) {
                descParts.push(`Discovery catalyst (${discoveryContext.catalyst}, direction=${discoveryContext.direction}): ${sanitizeUntrustedText(discoveryContext.reason, 300)}`);
            }
            if (extractedEvent?.summary) {
                descParts.push(sanitizeUntrustedText(extractedEvent.summary, 600));
            } else if (extractedEvent) {
                descParts.push(`Event: ${sanitizeUntrustedText(extractedEvent.event_type, 80)} (severity ${extractedEvent.severity}) — ${sanitizeUntrustedText(extractedEvent.headline, 200)}`);
            }
            const eventDesc = descParts.length > 0
                ? descParts.join('\n')
                : `Evaluating recent price action and news sentiment for ${ticker}.`;

            // 3b. Enriched scan context — mirror the full scan so the agent reasons over
            // market regime, mood, sector, and TA instead of a bare headline. Thin context
            // is why the single-ticker path produced weak theses the Red Team then nuked.
            let perfContext = '';
            let regimeResult: Awaited<ReturnType<typeof buildScanContext>>['regimeResult'] = null;
            let fearGreedScore: number | undefined;
            let fearGreedRating: string | undefined;
            try {
                const ctx = await buildScanContext();
                perfContext = ctx.perfContext;
                regimeResult = ctx.regimeResult;
                fearGreedScore = ctx.fearGreedScore;
                fearGreedRating = ctx.fearGreedRating;
            } catch (ctxErr) {
                console.warn(`[Scanner] buildScanContext failed for ${ticker} (non-fatal):`, ctxErr);
            }

            const marketContext: MarketContext = {
                fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
                avgVolume: quote.avgVolume,
                currentVolume: quote.volume,
                sectorPerformance: quote.sectorPerformance,
                fearGreedScore,
                fearGreedRating,
            };
            const sector = lookupSectorForTicker(ticker);

            // Early TA snapshot — fed to the primary agent as context (reused for confluence below).
            let earlySnapshot: import('@/types/signals').TASnapshot | null = null;
            let taContext = '';
            try {
                earlySnapshot = await TechnicalAnalysisService.getSnapshot(ticker);
                if (earlySnapshot) taContext = TechnicalAnalysisService.formatForPrompt(earlySnapshot);
            } catch { /* non-fatal — agent runs without TA context */ }

            // 3c. Resolve trade direction. Trust discovery's explicit read first, then the
            // catalyst keyword, then the recent price move. 'neutral' = no clear setup.
            const positiveCatalystKeys = ['upgrade', 'beat', 'approval', 'launch', 'partnership', 'guidance_raise', 'contract', 'tailwind', 'rotation', 'buyback', 'insider_buy', 'breakout', 'raise', 'acquisition_target'];
            const negativeCatalystKeys = ['miss', 'cut', 'downgrade', 'rejection', 'recall', 'lawsuit', 'investigation', 'fraud', 'warning', 'halt', 'default', 'probe', 'selloff', 'sell_off'];
            const catalystKey = (discoveryContext?.catalyst || extractedEventType || '').toLowerCase();
            const signedMove = (discoveryContext?.expectedMovePct ?? null) !== null
                ? discoveryContext!.expectedMovePct!
                : priceChangePct;
            const absMove = Math.abs(signedMove);

            let resolvedDirection: 'up' | 'down' | 'neutral' = discoveryContext?.direction ?? 'neutral';
            if (resolvedDirection === 'neutral') {
                if (positiveCatalystKeys.some(k => catalystKey.includes(k))) resolvedDirection = 'up';
                else if (negativeCatalystKeys.some(k => catalystKey.includes(k))) resolvedDirection = 'down';
                else if (absMove >= DISCOVERY_FLAT_MOVE_PCT) resolvedDirection = signedMove > 0 ? 'up' : 'down';
            }

            let signalsGenerated = 0;
            // Captures which gauntlet stage rejected the ticker (null = a signal was emitted).
            // Surfaced to the discovery ledger so the pipeline's rigor is visible, not silent.
            let rejectionStage: string | null = null;
            let rejectionReason: string | null = null;

            // 4. Save the event (upsert, fallback to insert if constraint missing)
            const savedEventType = discoveryContext ? `discovery_${discoveryContext.catalyst}` : 'manual_scan';
            const { error: upsertErr } = await supabase.from('market_events').upsert({
                ticker: ticker,
                event_type: savedEventType,
                headline: eventHeadline,
                severity: 8, // Force trigger analysis
                is_overreaction_candidate: resolvedDirection !== 'up',
                source_type: discoveryContext ? 'ai_discovery' : 'manual'
            }, { onConflict: 'ticker,headline', ignoreDuplicates: true });
            if (upsertErr) {
                console.warn('[Scanner] Upsert failed, falling back to insert:', upsertErr.message);
                await supabase.from('market_events').insert({
                    ticker: ticker,
                    event_type: savedEventType,
                    headline: eventHeadline,
                    severity: 8,
                    is_overreaction_candidate: resolvedDirection !== 'up',
                    source_type: discoveryContext ? 'ai_discovery' : 'manual'
                });
            }

            // 4b. DISLOCATION GATE — don't burn the gauntlet on a nothing-burger. With no
            // directional catalyst AND no real recent move, there's no mispricing to trade.
            if (resolvedDirection === 'neutral' && absMove < DISCOVERY_FLAT_MOVE_PCT) {
                console.log(`[Scanner] ${ticker} skipped at Dislocation gate: flat (${signedMove.toFixed(2)}%) and no directional catalyst.`);
                if (scanLog) {
                    await supabase.from('scan_logs').update({
                        status: 'completed', tickers_scanned: 1, events_detected: 1,
                        signals_generated: 0, duration_ms: Date.now() - startTime,
                    }).eq('id', scanLog.id);
                }
                return {
                    success: true,
                    verdict: 'rejected' as const,
                    stage: 'Dislocation',
                    reason: 'No actionable dislocation — price is flat and no directional catalyst to exploit.',
                    summary: `${ticker}: no signal — no tradeable dislocation (flat price, no clear catalyst).`,
                    signalsGenerated: 0,
                };
            }

            // 5. Route to the directionally-appropriate primary agent (mirror full scan):
            //    up  → Bullish Catalyst (under-priced upside)
            //    down→ Overreaction (mispriced sell-off, buy-the-dip)
            // Both are LONG setups, so downstream TA/confluence direction stays 'long'.
            const agentBaseInput = {
                ticker,
                eventHeadline,
                eventDesc,
                currentPrice,
                performanceContext: perfContext,
                marketContext,
                taContext,
                regime: regimeResult?.regime,
                sector,
            };
            let analysis: import('@/types/agents').AgentResult<import('@/types/agents').OverreactionResult>;
            let signalType: import('@/types/signals').SignalType = 'long_overreaction';
            let catalystAgentUsed = false;

            if (resolvedDirection === 'up') {
                const catalystResult = await AgentService.evaluateBullishCatalyst({
                    ...agentBaseInput,
                    priceChangePct: signedMove >= 0 ? signedMove : absMove,
                });
                if (catalystResult.success && catalystResult.data?.is_underreaction) {
                    // Normalize catalyst shape to the overreaction shape for unified downstream processing.
                    analysis = {
                        ...catalystResult,
                        data: {
                            ...catalystResult.data,
                            is_overreaction: true,
                            financial_impact_assessment: catalystResult.data.catalyst_impact_assessment,
                        },
                    } as any;
                    signalType = 'bullish_catalyst';
                    catalystAgentUsed = true;
                } else {
                    // Catalyst already priced in — normalize to a non-actionable shape so the
                    // gate below rejects cleanly with a catalyst-specific reason.
                    analysis = catalystResult.success
                        ? ({ ...catalystResult, data: catalystResult.data ? { ...catalystResult.data, is_overreaction: false } : null } as any)
                        : (catalystResult as any);
                }
            } else {
                analysis = await AgentService.evaluateOverreaction({
                    ...agentBaseInput,
                    priceDropPct: signedMove <= 0 ? signedMove : -absMove,
                });
            }

            console.log(`[Scanner] ${catalystAgentUsed ? 'Catalyst' : 'Overreaction'} result for ${ticker} (dir=${resolvedDirection}): pass=${analysis.data?.is_overreaction}, confidence=${analysis.data?.confidence_score}`);

            const primaryGate = catalystAgentUsed ? CONFIDENCE_GATE_CATALYST : CONFIDENCE_GATE_OVERREACTION;
            if (analysis.success && analysis.data?.is_overreaction && analysis.data.confidence_score > primaryGate) {
                // 6. Run Sanity Check
                const primaryAgentName = catalystAgentUsed ? 'BULLISH_CATALYST_AGENT' : 'OVERREACTION_AGENT';
                const sanity = await AgentService.runSanityCheck({
                    ticker,
                    originalThesis: analysis.data.thesis,
                    targetPrice: analysis.data.target_price,
                    stopLoss: analysis.data.stop_loss,
                    agentType: signalType,
                    performanceContext: perfContext,
                    taContext,
                    regime: regimeResult?.regime,
                    priorAgentContext: {
                        agentName: primaryAgentName,
                        confidence: analysis.data.confidence_score,
                        thesis: analysis.data.thesis,
                        reasoning: analysis.data.reasoning || analysis.data.thesis,
                        identifiedBiases: analysis.data.identified_biases || [],
                        convictionScore: analysis.data.conviction_score,
                        moatRating: analysis.data.moat_rating,
                        financialImpact: analysis.data.financial_impact_assessment,
                    },
                });

                // Red Team HARD GATE — same as primary pipeline. Single-ticker discovery
                // path is the second-most-common signal source; gate it identically.
                if (sanity.success && sanity.data) {
                    const gate = redTeamGate(sanity.data);
                    if (!gate.allow) {
                        console.warn(`[Scanner] RED TEAM BLOCKED ${ticker} (single-scan): ${gate.reason}`);
                        // Fall through to the existing passes_sanity_check branch which will
                        // skip signal emission; no explicit return needed.
                    }
                }

                if (sanity.success && sanity.data?.passes_sanity_check && redTeamGate(sanity.data).allow) {
                    // 7. TA snapshot + self-critique + calibration (matching full scan pipeline)
                    signalsGenerated = 1;

                    // 7a. TA snapshot
                    let singleTaSnapshot = null;
                    let singleTaAlignment: string = 'unavailable';
                    try {
                        singleTaSnapshot = await TechnicalAnalysisService.getSnapshot(ticker);
                        if (singleTaSnapshot) {
                            const taScore = singleTaSnapshot.taScore;
                            singleTaAlignment = taScore >= 60 ? 'confirmed' : taScore >= 40 ? 'partial' : 'conflicting';
                        }
                    } catch { /* non-fatal */ }

                    // 7a.5. BIAS DETECTIVE — audit primary agent's reasoning for cognitive biases
                    let singleBiasDetectiveOutput: import('@/types/agents').BiasDetectiveResult | null = null;
                    try {
                        const biasResult = await AgentService.runBiasDetective(
                            analysis.data.thesis,
                            analysis.data.reasoning || analysis.data.thesis,
                            analysis.data.confidence_score,
                            primaryAgentName
                        );
                        if (biasResult.success && biasResult.data) {
                            singleBiasDetectiveOutput = biasResult.data;
                            if (biasResult.data.total_penalty > 0) {
                                analysis.data.confidence_score = Math.max(CONFIDENCE_FLOOR,
                                    analysis.data.confidence_score - biasResult.data.total_penalty
                                );
                            }
                        }
                    } catch { /* non-fatal */ }

                    // 7b. Self-critique
                    let singleConfidence = analysis.data.confidence_score;
                    let critiqueOutput = null;
                    try {
                        const critique = await SelfCritiqueAgent.critique(
                            ticker,
                            analysis.data.thesis,
                            analysis.data.reasoning || analysis.data.thesis,
                            analysis.data.confidence_score,
                            sanity.data?.counter_thesis,
                            signalType
                        );
                        critiqueOutput = critique;
                        const rawAdj = critique.adjustedConfidence ?? singleConfidence;
                        const maxReduction = 30;
                        singleConfidence = Math.min(
                            singleConfidence,
                            Math.max(CONFIDENCE_FLOOR, Math.max(rawAdj, singleConfidence - maxReduction))
                        );
                    } catch { /* non-fatal */ }

                    // 7b.5. NOISE-AWARE CONFIDENCE — 3-judge panel to measure LLM certainty
                    let singleNoiseConfidenceOutput: import('@/types/agents').NoiseConfidenceResult | null = null;
                    try {
                        const noiseResult = await NoiseAwareConfidenceService.evaluate(
                            analysis.data.thesis,
                            analysis.data.reasoning || analysis.data.thesis,
                            singleConfidence,
                            primaryAgentName
                        );
                        singleNoiseConfidenceOutput = noiseResult;
                        if (noiseResult.confidence_adjustment !== 0) {
                            singleConfidence = noiseResult.adjusted_confidence;
                        }
                    } catch { /* non-fatal */ }

                    // 7b.8. DECISION TWIN SIMULATION — 3 investor personas evaluate the thesis
                    let singleDecisionTwinOutput: import('@/types/agents').DecisionTwinResult | null = null;
                    try {
                        singleDecisionTwinOutput = await DecisionTwinService.simulate({
                            ticker,
                            thesis: analysis.data.thesis,
                            reasoning: analysis.data.reasoning || analysis.data.thesis,
                            confidence: singleConfidence,
                            targetPrice: analysis.data.target_price,
                            stopLoss: analysis.data.stop_loss,
                            currentPrice,
                            entryHigh: analysis.data.suggested_entry_high,
                            signalType,
                            moatRating: analysis.data.moat_rating,
                            lynchCategory: analysis.data.lynch_category,
                            convictionScore: analysis.data.conviction_score,
                            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? undefined,
                            taSnapshot: singleTaSnapshot,
                        });
                        if (singleDecisionTwinOutput.confidence_adjustment !== 0) {
                            singleConfidence = singleDecisionTwinOutput.adjusted_confidence;
                        }
                        if (singleDecisionTwinOutput.skip_count === 3) {
                            console.warn(`[Scanner] Decision Twin suppressed single-ticker ${ticker}: all 3 personas voted SKIP`);
                            signalsGenerated = 0;
                            const twinDurationMs = Date.now() - startTime;
                            if (scanLog) {
                                await supabase.from('scan_logs').update({
                                    status: 'completed',
                                    tickers_scanned: 1,
                                    events_detected: 1,
                                    signals_generated: 0,
                                    duration_ms: twinDurationMs,
                                }).eq('id', scanLog.id);
                            }
                            return {
                                success: true,
                                verdict: 'rejected' as const,
                                stage: 'Decision Twin',
                                reason: 'All three investor personas voted SKIP on the thesis.',
                                summary: `${ticker}: rejected by Decision Twin — all 3 personas voted SKIP.`,
                                signalsGenerated: 0,
                            };
                        }
                    } catch { /* non-fatal */ }

                    // Margin-of-safety check
                    const singleMosCheck = ConvictionGuardrails.checkMarginOfSafety(
                        currentPrice,
                        quote.fiftyTwoWeekHigh,
                        singleConfidence,
                    );
                    if (!singleMosCheck.passed) {
                        console.warn(`[Scanner] MoS gate blocked single-ticker ${ticker}: ${singleMosCheck.reason}`);
                    }
                    const singleMarginPct = quote.fiftyTwoWeekHigh && quote.fiftyTwoWeekHigh > 0
                        ? Math.round(((quote.fiftyTwoWeekHigh - currentPrice) / quote.fiftyTwoWeekHigh) * 1000) / 10
                        : null;

                    // Drop if self-critique pushed below threshold
                    if (singleConfidence < CONFIDENCE_GATE_CRITIQUE) {
                        console.log(`[Scanner] Single-ticker ${ticker} dropped by self-critique: ${analysis.data.confidence_score}→${singleConfidence}`);
                        // signalsGenerated was set to 1 at gate entry; roll it back so the
                        // count + return stay honest (this branch emits no signal).
                        signalsGenerated = 0;
                        rejectionStage = 'Self-Critique';
                        rejectionReason = `Confidence fell to ${singleConfidence}% after self-critique — below the ${CONFIDENCE_GATE_CRITIQUE}% conviction gate.`;
                    } else if (!singleMosCheck.passed) {
                        console.log(`[Scanner] Single-ticker ${ticker} dropped by margin-of-safety gate`);
                        signalsGenerated = 0;
                        rejectionStage = 'Margin of Safety';
                        rejectionReason = singleMosCheck.reason || 'Entry leaves insufficient margin of safety below the 52-week high.';
                    } else {
                        // 7c. Calibrated confidence — null (not raw) when calibration is
                        // unavailable, so a fabricated number never masquerades as a calibrated win rate.
                        let calibratedConf: number | null = null;
                        try {
                            const curve = await ConfidenceCalibrator.getCachedCurve();
                            calibratedConf = ConfidenceCalibrator.getCalibratedWinRate(singleConfidence, curve);
                        } catch { /* non-fatal — leave calibrated null */ }

                        // 7d. Confluence with TA
                        const discConfluence = TechnicalAnalysisService.computeConfluence(
                            singleTaSnapshot, 'long', singleConfidence
                        );

                        // 7e. SWOT ANALYSIS — narrative enrichment (non-blocking)
                        let singleSwotOutput: import('@/types/agents').SWOTResult | null = null;
                        try {
                            singleSwotOutput = await SWOTAnalysisService.analyze({
                                ticker,
                                headline: eventHeadline,
                                thesis: analysis.data.thesis,
                                reasoning: analysis.data.reasoning || analysis.data.thesis,
                                confidence: singleConfidence,
                                signalType,
                                counterThesis: sanity.data?.counter_thesis ?? null,
                                criticalFlaws: critiqueOutput?.criticalFlaws ?? [],
                                decisionTwin: singleDecisionTwinOutput,
                                moatRating: analysis.data.moat_rating,
                                lynchCategory: analysis.data.lynch_category,
                                taSnapshot: singleTaSnapshot,
                            });
                        } catch { /* non-fatal */ }

                        // Thesis dedup — same guard as the primary pipeline. Prevents a
                        // single-ticker re-scan from re-emitting a near-duplicate signal.
                        const singleDedupCheck = await isDuplicateThesis(ticker, signalType, analysis.data.thesis);
                        if (singleDedupCheck.duplicate) {
                            console.log(`[Scanner] Thesis dedup REJECTED ${ticker} (single-scan): matched ${singleDedupCheck.matchedSignalId} (${singleDedupCheck.reason})`);
                            // Fall through — signal is not inserted, but signalsGenerated
                            // was set earlier. Roll it back so the return value is honest.
                            signalsGenerated = 0;
                            rejectionStage = 'Thesis Dedup';
                            rejectionReason = 'Near-duplicate of an already-active thesis on this ticker.';
                            // Skip the insert by jumping past it
                        } else {
                        const { data: savedSignal, error: discSignalErr } = await supabase.from('signals').insert({
                            ticker: ticker,
                            signal_type: signalType,
                            confidence_score: singleConfidence,
                            calibrated_confidence: calibratedConf,
                            risk_level: sanity.data.risk_score > 80 ? 'low' : 'medium',
                            bias_type: (analysis.data as any).bias_type || (catalystAgentUsed ? 'underreaction' : 'recency_bias'),
                            thesis: analysis.data.thesis,
                            counter_argument: sanity.data.counter_thesis,
                            suggested_entry_low: analysis.data.suggested_entry_low,
                            suggested_entry_high: analysis.data.suggested_entry_high,
                            stop_loss: analysis.data.stop_loss,
                            target_price: analysis.data.target_price,
                            ta_snapshot: singleTaSnapshot as unknown as Json,
                            ta_alignment: singleTaAlignment,
                            confluence_score: discConfluence.score,
                            confluence_level: discConfluence.level,
                            agent_outputs: {
                                overreaction: catalystAgentUsed ? undefined : analysis.data,
                                bullish_catalyst: catalystAgentUsed ? (analysis.data as any) : undefined,
                                red_team: sanity.data,
                                self_critique: critiqueOutput,
                                bias_detective: singleBiasDetectiveOutput,
                                noise_confidence: singleNoiseConfidenceOutput,
                                decision_twin: singleDecisionTwinOutput,
                                swot: singleSwotOutput,
                            } as unknown as Json,
                            margin_of_safety_pct: singleMarginPct,
                            conviction_score: typeof analysis.data.conviction_score === 'number'
                                ? Math.max(0, Math.min(100, Math.round(analysis.data.conviction_score))) : null,
                            moat_rating: typeof analysis.data.moat_rating === 'number'
                                ? Math.max(1, Math.min(10, Math.round(analysis.data.moat_rating))) : null,
                            lynch_category: ['fast_grower', 'stalwart', 'turnaround', 'asset_play', 'cyclical', 'slow_grower']
                                .includes(analysis.data.lynch_category) ? analysis.data.lynch_category : null,
                            why_high_conviction: analysis.data.why_high_conviction || null,
                            status: 'active',
                            data_quality: singleTaSnapshot ? 'full' : 'partial',
                            sources: [],
                            is_paper: isPaper,
                            outcome_due_at: new Date(Date.now() + (analysis.data.timeframe_days || 30) * 2 * 24 * 60 * 60 * 1000).toISOString(),
                            outcome_review_days: (analysis.data.timeframe_days || 30) * 2
                        } as any).select().single();

                        if (discSignalErr) {
                            console.error(`[Scanner] Failed to save discovery signal for ${ticker}:`, discSignalErr.message);
                            signalsGenerated = 0;
                            rejectionStage = 'Persist';
                            rejectionReason = `Cleared the gauntlet but failed to persist: ${discSignalErr.message}`;
                        }

                        if (savedSignal) {
                            ConflictDetector.invalidateCache();
                            CorrelationGuard.invalidateCache();
                            PriceCorrelationMatrix.invalidateCache();
                            NotificationService.checkAndDispatchAlerts(savedSignal);

                            // Seed outcome tracking so OutcomeTracker can follow this signal
                            await supabase.from('signal_outcomes').insert({
                                signal_id: savedSignal.id,
                                ticker: ticker,
                                entry_price: currentPrice,
                                outcome: 'pending',
                                hit_stop_loss: false,
                                hit_target: false,
                            });
                        }
                        } // end thesis-dedup else
                    } // end self-critique else
                } else {
                    // Sanity / Red Team rejection — the thesis did not clear the adversarial gate.
                    const rtGate = sanity.success && sanity.data ? redTeamGate(sanity.data) : { allow: false, reason: '' };
                    rejectionStage = 'Red Team';
                    if (sanity.success && sanity.data && !rtGate.allow) {
                        rejectionReason = rtGate.reason || 'Red Team flagged a fatal flaw in the thesis.';
                    } else if (sanity.success && sanity.data && !sanity.data.passes_sanity_check) {
                        rejectionReason = 'Failed the sanity check — the counter-thesis was too strong to ignore.';
                    } else {
                        rejectionReason = 'Did not clear the Red Team / sanity gate.';
                    }
                }
            } else {
                // Primary-agent rejection — no exploitable mispricing at the entry threshold.
                // Direction-aware: the catalyst and overreaction agents fail for different reasons.
                rejectionStage = catalystAgentUsed ? 'Bullish Catalyst' : 'Overreaction';
                const gateFloor = catalystAgentUsed ? CONFIDENCE_GATE_CATALYST : CONFIDENCE_GATE_OVERREACTION;
                if (!analysis.success) {
                    rejectionReason = `The ${catalystAgentUsed ? 'Bullish Catalyst' : 'Overreaction'} agent could not complete its evaluation.`;
                } else if (!analysis.data?.is_overreaction) {
                    rejectionReason = resolvedDirection === 'up'
                        ? 'Catalyst already priced in — no under-reaction left to exploit on the upside.'
                        : 'No mispriced overreaction — the move looks rational, not an exploitable dislocation.';
                } else {
                    rejectionReason = `Conviction ${analysis.data.confidence_score}% sits below the ${gateFloor}% entry floor.`;
                }
            }

            // 8. Update Scan Log
            const durationMs = Date.now() - startTime;
            if (scanLog) {
                await supabase.from('scan_logs').update({
                    status: 'completed',
                    tickers_scanned: 1,
                    events_detected: 1,
                    signals_generated: signalsGenerated,
                    duration_ms: durationMs,
                }).eq('id', scanLog.id);
            }

            const passed = signalsGenerated > 0;
            return {
                success: true,
                verdict: (passed ? 'signal' : 'rejected') as 'signal' | 'rejected',
                stage: passed ? null : rejectionStage,
                reason: passed
                    ? 'Cleared every stage of the 5-agent gauntlet.'
                    : (rejectionReason || 'Did not clear the analysis gauntlet.'),
                summary: passed
                    ? `${ticker}: signal generated — cleared the full gauntlet.`
                    : `${ticker}: no signal — rejected at ${rejectionStage ?? 'gauntlet'}${rejectionReason ? ` (${rejectionReason})` : ''}.`,
                signalsGenerated,
            };

        } catch (e: any) {
            console.error(`[Scanner] Fatal error during single scan for ${ticker}:`, e);

            // Attempt to update log as failed
            await supabase.from('scan_logs')
                .update({ status: 'failed', error_message: (e as Error).message })
                .eq('status', 'running');

            return {
                success: false,
                verdict: 'error' as const,
                stage: 'Pipeline Error',
                reason: e.message,
                error: e.message,
                signalsGenerated: 0,
            };
        }
    }

    /**
     * AI Ticker Discovery — Ask Gemini to identify trending tickers worth scanning
     * based on current market events, news catalysts, and unusual market action.
     * Returns up to `count` tickers with context on why each was flagged.
     */
    static async discoverTrendingTickers(count: number = 5): Promise<DiscoveredTicker[]> {
        // Return cached result if still fresh (avoids expensive grounded search calls)
        if (_discoveryCache && Date.now() < _discoveryCache.expiresAt) {
            console.log(`[Scanner] discoverTrendingTickers: returning cached result (${_discoveryCache.result.length} tickers, expires in ${Math.round((_discoveryCache.expiresAt - Date.now()) / 1000)}s)`);
            return _discoveryCache.result.slice(0, count);
        }

        console.log(`[Scanner] Discovering ${count} trending tickers via AI...`);

        try {
            const { data: geminiRes, error: geminiErr } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    systemInstruction: `You are an elite market analyst for a quantitative trading desk. Today is ${new Date().toISOString().split('T')[0]}. The desk trades MISPRICED DISLOCATIONS — stocks where a specific, recent catalyst has driven a SHARP price move that the market has likely over- or under-reacted to. You are NOT looking for "quality stocks" or "stocks in the news"; you are hunting tradeable dislocations with a clear directional thesis. Each pick MUST have (a) a concrete catalyst in the last ~5 trading days, and (b) a meaningful recent price move (ideally ≥3%). Skip mega-caps drifting on no news. You may include both US and international equities (e.g. FRES.L, AAF.L, THX.V) — preserve exchange suffixes. No penny stocks, no OTC.`,
                    prompt: `Identify the top ${count} stock tickers with the strongest MISPRICED DISLOCATION setups right now. For each, the catalyst must be specific and recent, and there must be a real price move to react to. To ensure diverse coverage, span different sectors. (Random seed for variance: ${Math.random()}).

For each ticker provide:
- "ticker": symbol (preserve exchange suffix)
- "reason": the specific catalyst AND why the price reaction may be mispriced (1-2 sentences, concrete facts)
- "catalyst": short snake_case tag (e.g. earnings_miss, earnings_beat, fda_rejection, analyst_downgrade, guidance_cut, product_launch, sector_rotation)
- "direction": "down" if the catalyst drove/should drive the price DOWN (overreaction buy-the-dip candidate), "up" if it drove/should drive it UP (under-priced bullish catalyst), or "neutral" if genuinely unclear
- "price_move_pct": the approximate recent % move you observed (negative for a drop, positive for a rise; use 0 if you cannot estimate)

You MUST respond with ONLY a JSON object — no markdown, no commentary, no code fences. Use this exact format:
{"tickers": [{"ticker": "NVDA", "reason": "Sold off 9% on a guidance cut the market is extrapolating too far", "catalyst": "guidance_cut", "direction": "down", "price_move_pct": -9}, {"ticker": "FRES.L", "reason": "Up 6% as the gold surge re-rates miners but estimates haven't caught up", "catalyst": "sector_rotation", "direction": "up", "price_move_pct": 6}]}`,
                    requireGroundedSearch: true,
                    temperature: 0.8,
                    // responseSchema is intentionally omitted — incompatible with grounded search.
                    // The prompt gives an explicit JSON format and robust parsing below handles the response.
                }
            });

            if (geminiErr) throw new Error(geminiErr.message);

            if (geminiRes?.text) {
                const rawText = geminiRes.text;

                // Robust JSON extraction: strip code fences, find the JSON object in the response
                let jsonText = rawText.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

                // If the model returned prose around the JSON, extract the JSON object
                const jsonMatch = jsonText.match(/\{[\s\S]*"tickers"\s*:\s*\[[\s\S]*\]\s*\}/);
                if (jsonMatch) {
                    jsonText = jsonMatch[0];
                }

                let parsed: any;
                try {
                    parsed = JSON.parse(jsonText);
                } catch {
                    // Fallback: try to extract individual ticker objects via regex
                    console.warn('[Scanner] JSON parse failed, attempting regex extraction from:', rawText.substring(0, 200));
                    const tickerMatches = rawText.matchAll(/"ticker"\s*:\s*"([^"]+)"[\s\S]*?"reason"\s*:\s*"([^"]+)"[\s\S]*?"catalyst"\s*:\s*"([^"]+)"/g);
                    const extracted: { ticker: string; reason: string; catalyst: string }[] = [];
                    for (const m of tickerMatches) {
                        extracted.push({ ticker: m[1], reason: m[2], catalyst: m[3] });
                    }
                    if (extracted.length > 0) {
                        console.log(`[Scanner] Regex extraction recovered ${extracted.length} tickers`);
                        parsed = { tickers: extracted };
                    } else {
                        console.error('[Scanner] Ticker discovery failed: could not parse AI response as JSON');
                        return [];
                    }
                }

                // Accept both { tickers: [...] } and bare array formats
                const tickerArray = Array.isArray(parsed) ? parsed : (parsed.tickers || []);

                const discovered: DiscoveredTicker[] = tickerArray.slice(0, count).map((t: any) => {
                    // Normalize the move magnitude; tolerate strings like "-9%" or "6".
                    const rawMove = typeof t.price_move_pct === 'number'
                        ? t.price_move_pct
                        : parseFloat(String(t.price_move_pct ?? '').replace(/[^0-9.\-]/g, ''));
                    const expectedMovePct = Number.isFinite(rawMove) && rawMove !== 0 ? rawMove : null;
                    // Direction: trust the model's tag, else infer from the move sign.
                    const rawDir = String(t.direction ?? '').toLowerCase();
                    let direction: DiscoveredTicker['direction'] =
                        rawDir === 'up' || rawDir === 'down' || rawDir === 'neutral'
                            ? (rawDir as DiscoveredTicker['direction'])
                            : 'neutral';
                    if (direction === 'neutral' && expectedMovePct !== null) {
                        direction = expectedMovePct > 0 ? 'up' : 'down';
                    }
                    return {
                        // Preserve exchange suffixes like .L, .TO, .V, .DE — only strip truly invalid chars
                        ticker: (t.ticker || '').toUpperCase().replace(/[^A-Z0-9.]/g, ''),
                        reason: t.reason || 'Trending',
                        catalyst: t.catalyst || 'other',
                        direction,
                        expectedMovePct,
                    };
                }).filter((t: DiscoveredTicker) => {
                    const base = t.ticker.replace(/\.[A-Z]{1,3}$/, '');
                    return base.length >= 1 && base.length <= 5 && t.ticker.length <= 8;
                });

                console.log(`[Scanner] Discovered ${discovered.length} trending tickers:`, discovered.map((d: any) => `${d.ticker} (${d.catalyst})`).join(', '));
                // Populate cache so subsequent calls within the TTL window skip this expensive grounded search
                if (discovered.length > 0) {
                    _discoveryCache = { result: discovered, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS };
                }
                return discovered;
            }

            console.warn('[Scanner] Ticker discovery returned empty response (no text in AI reply)');
            return [];
        } catch (e: any) {
            console.error('[Scanner] Ticker discovery failed:', e.message);
            return [];
        }
    }

    /**
     * Discovery Scan — Full auto-suggest pipeline:
     * 1. Ask AI to discover trending tickers
     * 2. Run the full single-ticker agent pipeline on each
     * 3. Returns summary of all discovered signals
     *
     * This is the method that should be called from the Dashboard's
     * "Force Global Scan" button or from any automated trigger.
     */
    static async runDiscoveryScan(
        count: number = 5,
        onProgress?: (status: string) => void
    ): Promise<{ discovered: number; scanned: number; signalsGenerated: number; tickers: string[]; outcomes: ScanOutcome[] }> {
        const startTime = Date.now();

        // 1. Discover trending tickers via AI
        onProgress?.('Discovering trending tickers via AI...');
        const discovered = await this.discoverTrendingTickers(count);

        if (discovered.length === 0) {
            onProgress?.('No trending tickers found. Market may be quiet.');
            return { discovered: 0, scanned: 0, signalsGenerated: 0, tickers: [], outcomes: [] };
        }

        // 2. Log the discovery scan
        const { data: scanLog } = await supabase
            .from('scan_logs')
            .insert({
                scan_type: 'discovery',
                status: 'running',
                duration_ms: 0,
                tickers_scanned: discovered.length,
                events_detected: 0,
                signals_generated: 0,
                estimated_cost_usd: 0
            })
            .select('id')
            .single();

        let totalSignals = 0;
        const scannedTickers: string[] = [];
        const outcomes: ScanOutcome[] = [];

        // 3. Run agent pipeline on each discovered ticker
        for (let i = 0; i < discovered.length; i++) {
            const item = discovered[i]!;
            const { ticker, reason, catalyst } = item;
            onProgress?.(`Scanning ${ticker} (${i + 1}/${discovered.length}): ${reason}`);

            try {
                // Ensure ticker exists in watchlist (FK constraint on market_events)
                await this.ensureWatchlistEntry(ticker);

                // Save the discovery event so it shows up in event history
                const { error: discUpsertErr } = await supabase.from('market_events').upsert({
                    ticker,
                    event_type: `discovery_${catalyst}`,
                    headline: reason,
                    severity: 7,
                    is_overreaction_candidate: true,
                    source_urls: [],
                    source_type: 'ai_discovery'
                } as any, { onConflict: 'ticker,headline', ignoreDuplicates: true });
                if (discUpsertErr) {
                    console.warn('[Scanner] Discovery upsert failed, falling back to insert:', discUpsertErr.message);
                    await supabase.from('market_events').insert({
                        ticker,
                        event_type: `discovery_${catalyst}`,
                        headline: reason,
                        severity: 7,
                        is_overreaction_candidate: true,
                        source_urls: [],
                        source_type: 'ai_discovery'
                    } as any);
                }

                // Run full single-ticker scan — pass the discovery context so the
                // pipeline routes by catalyst direction and reasons over the real
                // grounded-search catalyst instead of re-deriving a thin one.
                const result = await this.runSingleTickerScan(ticker, true, {
                    reason: item.reason,
                    catalyst: item.catalyst,
                    direction: item.direction,
                    expectedMovePct: item.expectedMovePct,
                });
                scannedTickers.push(ticker);

                // Capture WHY each ticker passed or was rejected so the discovery
                // ledger can surface the pipeline's rigor instead of dropping it.
                const r = result as {
                    success: boolean; signalsGenerated?: number; summary?: string;
                    error?: string; verdict?: ScanOutcome['verdict']; stage?: string | null; reason?: string;
                };
                const signals = r.signalsGenerated ?? 0;
                outcomes.push({
                    ticker,
                    catalyst,
                    verdict: r.verdict ?? (r.success ? (signals > 0 ? 'signal' : 'rejected') : 'error'),
                    stage: r.stage ?? null,
                    reason: r.reason ?? r.summary ?? r.error ?? '',
                    signals,
                });

                if (result.success && signals > 0) {
                    totalSignals += signals;
                }
            } catch (e: any) {
                console.warn(`[Scanner] Discovery scan failed for ${ticker}:`, e.message);
                outcomes.push({
                    ticker,
                    catalyst,
                    verdict: 'error',
                    stage: 'Pipeline Error',
                    reason: e?.message || 'Scan failed unexpectedly.',
                    signals: 0,
                });
            }
        }

        // 4. Update scan log
        const duration = Date.now() - startTime;
        if (scanLog?.id) {
            await supabase.from('scan_logs')
                .update({
                    status: 'completed',
                    duration_ms: duration,
                    signals_generated: totalSignals,
                    events_detected: discovered.length,
                } as any)
                .eq('id', scanLog.id);
        }

        const summary = `Discovery scan complete: ${discovered.length} tickers found, ${totalSignals} signals generated in ${(Number(duration) / 1000).toFixed(1)}s`;
        console.log(`[Scanner] ${summary}`);
        onProgress?.(summary);

        return {
            discovered: discovered.length,
            scanned: scannedTickers.length,
            signalsGenerated: totalSignals,
            tickers: scannedTickers,
            outcomes,
        };
    }
}
