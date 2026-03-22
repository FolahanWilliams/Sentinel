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
import { BacktestValidator } from './backtestValidator';
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
import { DEFAULT_MIN_CONFIDENCE, DEFAULT_MIN_PRICE_RISE_PCT, CONFIDENCE_GATE_OVERREACTION, CONFIDENCE_GATE_CATALYST, CONFIDENCE_GATE_CONTAGION, CONFIDENCE_GATE_CRITIQUE, CONFIDENCE_FLOOR, SEVERITY_THRESHOLD } from '@/config/constants';
import type { MultiTimeframeResult } from './technicalAnalysis';
import type { AgentOutputsJson, LynchCategory } from '@/types/signals';
import type { Json } from '@/types/database';
import type { Quote } from '@/types/market';

export class ScannerService {

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

    /**
     * Run the master scan.
     */
    static async runScan(scanType: 'full' | 'fast' = 'full') {
        const startTime = Date.now();
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
                    estimated_cost_usd: 0
                })
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

            // 3. Sync RSS Feeds + Google News via Gemini (Feed the beast)
            // Moved AFTER budget gate to prevent spending quota when over budget
            await RSSReaderService.syncAllFeeds();

            // Smart Scan Prioritization — rank tickers by urgency
            const prioritized = await this.prioritizeTickers(watchlist);
            const maxTickers = scanType === 'fast' ? Math.min(5, prioritized.length) : prioritized.length;
            const tickersToScan = prioritized.slice(0, maxTickers);
            const tickers = tickersToScan.map(w => w.ticker);

            console.log(`[Scanner] Prioritized ${tickers.length} tickers:`, tickersToScan.map(t => {
                const src = t.prioritySources.length > 0 ? ` [${t.prioritySources.join(', ')}]` : '';
                return `${t.ticker}(${t.priority}${src})`;
            }).join(', '));

            // 3a–3g. Build scan context (external sentiment, regime, thresholds, etc.)
            await fetchExternalSentiment(tickers);
            const {
                perfContext, regimeResult, regimeCtx,
                fearGreedScore, fearGreedRating,
                sectorRotationCtx, rotationSnapshot,
                adaptiveMinConfidence, adaptiveMinPriceDrop,
                autoLearnWeights,
            } = await buildScanContext();

            // 4. Find fresh unparsed articles from the cache
            // In a real flow, we'd only grab articles from the last hour
            const { data: freshArticles } = await supabase
                .from('rss_cache')
                .select('*')
                .order('fetched_at', { ascending: false })
                .limit(30);

            // 5. Extract Events via Gemini Fast-Pass
            // Always initialize extraction so grounded search + earnings calendar can inject events
            const extraction: { success: boolean; data: { events: any[] } | null } = { success: true, data: { events: [] } };
            const actionableArticles: any[] = [];

            if (freshArticles && freshArticles.length > 0) {
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
            {
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

                // Build a lookup of article descriptions by ticker for full context
                const articleContextByTicker: Record<string, string> = {};
                for (const article of actionableArticles) {
                    const text = `${article.title || ''}. ${article.description || ''}`;
                    for (const t of tickers) {
                        if (text.toLowerCase().includes(t.toLowerCase())) {
                            articleContextByTicker[t] = articleContextByTicker[t]
                                ? `${articleContextByTicker[t]} | ${text}`
                                : text;
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

                                // Gather real article context for this ticker
                                const eventContext = articleContextByTicker[ev.ticker]
                                    || `Event: ${ev.event_type} — ${ev.headline}`;

                                // Skip ticker if no real price data available
                                if (!quote?.price) {
                                    console.warn(`[Scanner] Skipping ${ev.ticker} — no live quote available (data_quality: no_quote)`);
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
                                ]);

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

                                // Unpack earnings guard (6e) — can block signal
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

                                // Pipeline A: Overreaction Analysis (negative events)
                                // Pipeline B: Bullish Catalyst Analysis (positive events)
                                const isPositiveEvent = priceDrop >= 0 || ['analyst_upgrade', 'product_launch', 'fda_approval', 'partnership', 'guidance_raise', 'contract_win', 'sector_tailwind', 'upcoming_earnings'].includes(ev.event_type);

                                let analysis: import('@/types/agents').AgentResult<import('@/types/agents').OverreactionResult>;
                                let signalType: import('@/types/signals').SignalType = 'long_overreaction';
                                let catalystAgentUsed = false;

                                if (isPositiveEvent && priceDrop >= DEFAULT_MIN_PRICE_RISE_PCT * -1) {
                                    // Positive catalyst path — check if market under-reacted
                                    const catalystResult = await AgentService.evaluateBullishCatalyst(
                                        ev.ticker,
                                        ev.headline,
                                        eventContext,
                                        quote.price,
                                        priceDrop,
                                        perfContext,
                                        marketContext,
                                        enrichedTaContext,
                                        historicalCtx,
                                        regimeResult?.regime
                                    );

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
                                    } else {
                                        // Catalyst agent didn't fire — fall back to overreaction analysis
                                        console.log(`[Scanner] Bullish catalyst: no underreaction for ${ev.ticker}, falling back to overreaction agent`);
                                        analysis = await AgentService.evaluateOverreaction(
                                            ev.ticker, ev.headline, eventContext, quote.price, priceDrop,
                                            perfContext, marketContext, enrichedTaContext, historicalCtx,
                                            regimeResult?.regime
                                        );
                                    }
                                } else {
                                    // Negative event path — standard overreaction analysis
                                    analysis = await AgentService.evaluateOverreaction(
                                        ev.ticker,
                                        ev.headline,
                                        eventContext,
                                        quote.price,
                                        priceDrop,
                                        perfContext,
                                        marketContext,
                                        enrichedTaContext,
                                        historicalCtx,
                                        regimeResult?.regime
                                    );
                                }

                                // Validate agent response before acting on it
                                const validation = responseValidator.validate(analysis.data);
                                if (!validation.valid) {
                                    console.warn(`[Scanner] ${catalystAgentUsed ? 'Catalyst' : 'Overreaction'} response failed validation for ${ev.ticker}:`, validation.warnings);
                                }

                                // Diagnostic logging — show WHY signals are accepted/rejected
                                const gate = catalystAgentUsed ? CONFIDENCE_GATE_CATALYST : CONFIDENCE_GATE_OVERREACTION;
                                if (analysis.success) {
                                    console.log(`[Scanner] ${catalystAgentUsed ? 'Catalyst' : 'Overreaction'} result for ${ev.ticker}: pass=${analysis.data?.is_overreaction}, confidence=${analysis.data?.confidence_score}, thesis="${(analysis.data?.thesis || '').slice(0, 80)}..."`);
                                } else {
                                    console.warn(`[Scanner] ${catalystAgentUsed ? 'Catalyst' : 'Overreaction'} agent FAILED for ${ev.ticker}: ${analysis.error}`);
                                }

                                if (analysis.success && validation.valid && analysis.data?.is_overreaction && analysis.data.confidence_score > gate) {

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
                                            analysis.data.confidence_score = Math.max(0, analysis.data.confidence_score - 20);
                                            console.log(`[Scanner] TA conflicting for ${ev.ticker} — confidence reduced to ${analysis.data.confidence_score}`);
                                        } else if (taAlignment === 'partial') {
                                            analysis.data.confidence_score = Math.max(0, analysis.data.confidence_score - 10);
                                        }
                                    } catch (taErr) {
                                        console.warn(`[Scanner] TA fetch failed for ${ev.ticker}, proceeding without TA:`, taErr);
                                    }

                                    // 7. SANITY CHECK (Red Team) — with cascading context from originating agent
                                    // The Red Team receives the full structured output of the prior agent so it can
                                    // mount a targeted challenge against specific weak points (not just the thesis string).
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
                                    const sanity = await AgentService.runSanityCheck(
                                        ev.ticker,
                                        analysis.data.thesis,
                                        analysis.data.target_price,
                                        analysis.data.stop_loss,
                                        catalystAgentUsed ? 'BULLISH_CATALYST_AGENT' : 'OVERREACTION_AGENT',
                                        perfContext,
                                        earlyTaContext,
                                        priorContext,
                                        regimeResult?.regime
                                    );

                                    // Log sanity check result
                                    if (sanity.success) {
                                        console.log(`[Scanner] Sanity check for ${ev.ticker}: passes=${sanity.data?.passes_sanity_check}, risk=${sanity.data?.risk_score}`);
                                    } else {
                                        console.warn(`[Scanner] Sanity check FAILED for ${ev.ticker}: ${sanity.error}`);
                                    }

                                    if (sanity.success && sanity.data?.passes_sanity_check) {
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
                                                if (biasResult.data.total_penalty > 0) {
                                                    const before = analysis.data.confidence_score;
                                                    analysis.data.confidence_score = Math.max(CONFIDENCE_FLOOR,
                                                        analysis.data.confidence_score - biasResult.data.total_penalty
                                                    );
                                                    console.log(`[Scanner] Bias Detective penalised ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (dominant: ${biasResult.data.dominant_bias}, penalty: -${biasResult.data.total_penalty})`);
                                                } else {
                                                    console.log(`[Scanner] Bias Detective: ${ev.ticker} is bias-free (dominant: ${biasResult.data.dominant_bias})`);
                                                }
                                            }
                                        } catch (biasErr) {
                                            console.warn(`[Scanner] Bias Detective failed for ${ev.ticker} (non-fatal):`, biasErr);
                                        }

                                        // 7.5. SELF-CRITIQUE — second-pass confidence adjustment
                                        let critiqueOutput = null;
                                        try {
                                            const critique = await SelfCritiqueAgent.critique(
                                                ev.ticker,
                                                analysis.data.thesis,
                                                analysis.data.reasoning || analysis.data.thesis,
                                                analysis.data.confidence_score,
                                                sanity.data.counter_thesis,
                                                signalType
                                            );
                                            critiqueOutput = critique;
                                            if (critique.hasFlaws && critique.adjustedConfidence < analysis.data.confidence_score) {
                                                console.log(`[Scanner] Self-critique adjusted confidence for ${ev.ticker}: ${analysis.data.confidence_score} → ${critique.adjustedConfidence} (${critique.criticalFlaws.length} critical, ${critique.minorFlaws.length} minor flaws)`);
                                                analysis.data.confidence_score = critique.adjustedConfidence;
                                            }
                                            // Drop signal if critique brings confidence below threshold
                                            if (critique.adjustedConfidence < CONFIDENCE_GATE_CRITIQUE) {
                                                console.warn(`[Scanner] Self-critique dropped signal for ${ev.ticker} — adjusted confidence ${critique.adjustedConfidence} below threshold`);
                                                continue;
                                            }
                                        } catch (critiqueErr) {
                                            console.warn(`[Scanner] Self-critique failed for ${ev.ticker} (non-fatal):`, critiqueErr);
                                        }

                                        // 7.5.5. NOISE-AWARE CONFIDENCE — 3-judge panel to measure LLM certainty
                                        let noiseConfidenceOutput: import('@/types/agents').NoiseConfidenceResult | null = null;
                                        try {
                                            const noiseResult = await NoiseAwareConfidenceService.evaluate(
                                                analysis.data.thesis,
                                                analysis.data.reasoning || analysis.data.thesis,
                                                analysis.data.confidence_score,
                                                catalystAgentUsed ? 'BULLISH_CATALYST_AGENT' : 'OVERREACTION_AGENT'
                                            );
                                            noiseConfidenceOutput = noiseResult;
                                            if (noiseResult.confidence_adjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = noiseResult.adjusted_confidence;
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
                                            });

                                            if (decisionTwinOutput.confidence_adjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = decisionTwinOutput.adjusted_confidence;
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
                                            analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                analysis.data.confidence_score + weightedDivBoost
                                            ));
                                            console.log(`[Scanner] Divergence ${divergenceResult.divergenceType} adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${weightedDivBoost > 0 ? '+' : ''}${weightedDivBoost})`);
                                        }

                                        // 7.7. EARNINGS CALENDAR PENALTY — reduce confidence near earnings
                                        if (earningsGuardResult && earningsGuardResult.confidencePenalty !== 0) {
                                            const before = analysis.data.confidence_score;
                                            analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                analysis.data.confidence_score + earningsGuardResult.confidencePenalty
                                            ));
                                            console.log(`[Scanner] Earnings guard adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${earningsGuardResult.confidencePenalty})`);
                                        }

                                        // 7.8. FUNDAMENTALS PENALTY — reduce confidence for weak fundamentals
                                        if (fundamentalsData) {
                                            let fundPenalty = 0;
                                            const de = fundamentalsData.debt_to_equity;
                                            const pm = fundamentalsData.profit_margin;
                                            const pe = fundamentalsData.pe_ratio;
                                            const peAvg = fundamentalsData.pe_sector_avg;

                                            if (de !== null && de > 3) fundPenalty -= 10; // high leverage
                                            if (pm !== null && pm < -0.1) fundPenalty -= 10; // negative margins
                                            if (pe !== null && peAvg !== null && pe > peAvg * 3) fundPenalty -= 5; // extreme P/E vs sector

                                            if (fundPenalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = Math.max(CONFIDENCE_FLOOR, analysis.data.confidence_score + fundPenalty);
                                                console.log(`[Scanner] Fundamentals penalty for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${fundPenalty})`);
                                            }
                                        }

                                        // 7.9. MARKET REGIME PENALTY — reduce confidence in crisis/correction
                                        if (regimeResult && regimeResult.confidencePenalty !== 0) {
                                            const before = analysis.data.confidence_score;
                                            analysis.data.confidence_score = Math.max(CONFIDENCE_FLOOR,
                                                analysis.data.confidence_score + regimeResult.confidencePenalty
                                            );
                                            console.log(`[Scanner] Market regime (${regimeResult.regime}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${regimeResult.confidencePenalty})`);
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
                                                analysis.data.confidence_score = Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + backtestResult.confidencePenalty
                                                );
                                                console.log(`[Scanner] Backtest adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${backtestResult.confidencePenalty})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.11. MULTI-TIMEFRAME CONFIRMATION — check weekly trend alignment
                                        let mtfResult: MultiTimeframeResult | null = null;
                                        try {
                                            mtfResult = await TechnicalAnalysisService.getMultiTimeframeConfirmation(ev.ticker, 'long');
                                            if (mtfResult.confidenceAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + mtfResult.confidenceAdjustment
                                                ));
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
                                                analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + mtfBonus
                                                ));
                                                console.log(`[Scanner] Gemini MTF (${geminiMtf.alignedCount}/${geminiMtf.totalChecked} aligned) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${mtfBonus > 0 ? '+' : ''}${mtfBonus})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.12. CORRELATION GUARD — penalize sector concentration
                                        const tickerSector = tickersToScan.find(t => t.ticker === ev.ticker)?.sector || 'Unknown';
                                        let correlationResult: import('./correlationGuard').CorrelationGuardResult | null = null;
                                        try {
                                            correlationResult = await CorrelationGuard.check(ev.ticker, tickerSector);
                                            if (correlationResult.shouldBlock) {
                                                console.warn(`[Scanner] CORRELATION GUARD blocked ${ev.ticker}: ${correlationResult.reason}`);
                                                continue;
                                            }
                                            if (correlationResult.confidencePenalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + correlationResult.confidencePenalty
                                                );
                                                console.log(`[Scanner] Correlation guard adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${correlationResult.confidencePenalty})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.12b. PRICE CORRELATION — check actual price correlation with existing signals
                                        let priceCorr: { highlyCorrelatedTickers: Array<{ ticker: string; correlation: number }>; maxCorrelation: number; confidencePenalty: number; reason: string } | null = null;
                                        try {
                                            priceCorr = await PriceCorrelationMatrix.check(ev.ticker);
                                            if (priceCorr.confidencePenalty !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + priceCorr.confidencePenalty
                                                );
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
                                            analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                analysis.data.confidence_score + optionsFlowResult.confidenceAdjustment
                                            ));
                                            console.log(`[Scanner] Options flow (${optionsFlowResult.sentiment}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${optionsFlowResult.confidenceAdjustment > 0 ? '+' : ''}${optionsFlowResult.confidenceAdjustment})`);
                                        }

                                        // 7.15. PEER RELATIVE STRENGTH — adjust based on idiosyncratic vs sector-wide move
                                        if (peerStrengthResult && peerStrengthResult.confidenceAdjustment !== 0) {
                                            const before = analysis.data.confidence_score;
                                            analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                analysis.data.confidence_score + peerStrengthResult.confidenceAdjustment
                                            ));
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
                                                analysis.data.confidence_score = Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + conflictResult.confidencePenalty
                                                );
                                                console.log(`[Scanner] Conflict detection adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${conflictResult.confidencePenalty})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // 7.16b. FEAR & GREED CONTRARIAN — boost confidence when buying in fear, penalize in greed
                                        let fearGreedAdjustment = 0;
                                        if (fearGreedScore !== undefined) {
                                            if (fearGreedScore <= 25) {
                                                // Extreme Fear: contrarian buying opportunity — boost confidence
                                                fearGreedAdjustment = 10;
                                            } else if (fearGreedScore <= 40) {
                                                // Fear: mild contrarian boost
                                                fearGreedAdjustment = 5;
                                            } else if (fearGreedScore >= 75) {
                                                // Extreme Greed: buying into euphoria is risky — penalize
                                                fearGreedAdjustment = -10;
                                            } else if (fearGreedScore >= 60) {
                                                // Greed: mild penalty for long entries
                                                fearGreedAdjustment = -3;
                                            }
                                            if (fearGreedAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + fearGreedAdjustment
                                                ));
                                                console.log(`[Scanner] Fear & Greed (${fearGreedScore} ${fearGreedRating}) adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${fearGreedAdjustment > 0 ? '+' : ''}${fearGreedAdjustment})`);
                                            }
                                        }

                                        // 7.16c. RETAIL vs NEWS SENTIMENT GAP — detect contrarian retail/institutional divergence
                                        let retailVsNewsResult: import('./retailVsNewsSentiment').RetailVsNewsResult | null = null;
                                        try {
                                            retailVsNewsResult = await RetailVsNewsSentimentDetector.analyze(ev.ticker);
                                            if (retailVsNewsResult.confidenceAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + retailVsNewsResult.confidenceAdjustment
                                                ));
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
                                                analysis.data.confidence_score = Math.min(100, Math.max(CONFIDENCE_FLOOR,
                                                    analysis.data.confidence_score + crossSourceResult.confidenceAdjustment
                                                ));
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
                                            const { adjustedConfidence, result: divResult } = SourceDiversityScorer.applyGate(
                                                signalSources,
                                                analysis.data.confidence_score,
                                            );
                                            sourceDiversityResult = divResult;
                                            if (divResult.confidenceAdjustment !== 0) {
                                                const before = analysis.data.confidence_score;
                                                analysis.data.confidence_score = Math.max(0, Math.min(100, adjustedConfidence));
                                                console.log(`[Scanner] Source diversity gate for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${divResult.summary})`);
                                            }
                                        } catch { /* non-fatal */ }

                                        // Drop signal if all adjustments brought it below threshold (adaptive)
                                        if (analysis.data.confidence_score < adaptiveMinConfidence) {
                                            console.warn(`[Scanner] Signal for ${ev.ticker} dropped — confidence ${analysis.data.confidence_score} below ${adaptiveMinConfidence} after all adjustments`);
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

                                        // 7.9. SWOT ANALYSIS — narrative enrichment (non-blocking, no confidence impact)
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
                                        } catch (swotErr) {
                                            console.warn(`[Scanner] SWOT failed for ${ev.ticker} (non-fatal):`, swotErr);
                                        }

                                        // 8. WINNER! WE HAVE A SIGNAL.
                                        signalsGenerated++;

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
                                            if (confluence.score >= 75) atrMult = 1.0;
                                            else if (confluence.score >= 55) atrMult = 1.25;
                                            else if (confluence.score >= 35) atrMult = 1.75;
                                            else atrMult = 2.0;

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
                                                const curve = await ConfidenceCalibrator.getCachedCurve();
                                                calibratedConfidence = ConfidenceCalibrator.getCalibratedWinRate(analysis.data.confidence_score, curve);
                                            } catch { /* non-fatal */ }
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

                                        const { data: savedSignal, error: signalInsertErr } = await supabase.from('signals').insert({
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
                                            agent_outputs: {
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
                                                    relative_strength: peerStrengthResult.relativeStrength,
                                                    is_idiosyncratic: peerStrengthResult.isIdiosyncratic,
                                                    confidence_adjustment: peerStrengthResult.confidenceAdjustment,
                                                    peers: peerStrengthResult.peers.map(p => ({ ticker: p.ticker, change_pct: p.changePercent })),
                                                } : null,
                                                conflict_check: conflictResult?.hasConflicts ? {
                                                    has_conflicts: true,
                                                    conflict_count: conflictResult.conflicts.length,
                                                    penalty: conflictResult.confidencePenalty,
                                                    summary: conflictResult.summary,
                                                } : null,
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
                                            } as unknown as Json,
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
                                            is_paper: false
                                        }).select().single();

                                        if (signalInsertErr) {
                                            console.error(`[Scanner] Failed to save signal for ${ev.ticker}:`, signalInsertErr.message);
                                        }

                                        // 8b. Seed outcome tracking row so OutcomeTracker can follow this signal
                                        if (savedSignal) {
                                            // Invalidate correlation + conflict caches
                                            CorrelationGuard.invalidateCache();
                                            ConflictDetector.invalidateCache();
                                            PriceCorrelationMatrix.invalidateCache();

                                            // Dispatch alert rules
                                            NotificationService.checkAndDispatchAlerts(savedSignal);

                                            await supabase.from('signal_outcomes').insert({
                                                signal_id: savedSignal.id,
                                                ticker: ev.ticker,
                                                entry_price: entryPrice,
                                                outcome: 'pending',
                                                hit_stop_loss: false,
                                                hit_target: false,
                                            });
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
                                                    agent_outputs: {
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

                                                    const contagion = await AgentService.evaluateContagion(
                                                        ev.ticker,
                                                        sat.ticker,
                                                        ev.headline,
                                                        satDrop,
                                                        perfContext
                                                    );

                                                    if (contagion.success && contagion.data?.is_contagion && contagion.data.confidence_score > CONFIDENCE_GATE_CONTAGION) {
                                                        // Sanity check the contagion trade
                                                        const contagionSanity = await AgentService.runSanityCheck(
                                                            sat.ticker,
                                                            contagion.data.thesis,
                                                            contagion.data.target_price,
                                                            contagion.data.stop_loss,
                                                            'CONTAGION_AGENT',
                                                            perfContext
                                                        );

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

                                                            signalsGenerated++;

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
                                                                agent_outputs: {
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
                                                                    } catch { return contagion.data?.confidence_score ?? 0; }
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
                                                                is_paper: false
                                                            }).select().single();

                                                            if (contagionInsertErr) {
                                                                console.error(`[Scanner] Failed to save contagion signal for ${sat.ticker}:`, contagionInsertErr.message);
                                                            }

                                                            // Seed outcome tracking
                                                            if (savedContagionSignal) {
                                                                ConflictDetector.invalidateCache();
                                                                CorrelationGuard.invalidateCache();
                                                                PriceCorrelationMatrix.invalidateCache();
                                                                NotificationService.checkAndDispatchAlerts(savedContagionSignal);

                                                                await supabase.from('signal_outcomes').insert({
                                                                    signal_id: savedContagionSignal.id,
                                                                    ticker: sat.ticker,
                                                                    entry_price: satQuote.price,
                                                                    outcome: 'pending',
                                                                    hit_stop_loss: false,
                                                                    hit_target: false,
                                                                });
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

            // 11b. Auto-Learning — periodically re-analyze pipeline weights
            try {
                const { count: completedCount } = await supabase
                    .from('signal_outcomes')
                    .select('*', { count: 'exact', head: true })
                    .neq('outcome', 'pending');

                // Trigger auto-learning every 20 completed outcomes
                if (completedCount && completedCount >= 10 && completedCount % 20 === 0) {
                    console.log(`[Scanner] Triggering auto-learning analysis (${completedCount} completed outcomes)...`);
                    void AutoLearningService.analyzeAndUpdateWeights().catch(e =>
                        console.warn('[Scanner] Auto-learning failed (non-fatal):', e)
                    );
                }
            } catch { /* non-fatal */
            }

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
    static async runSingleTickerScan(ticker: string, isPaper: boolean = true) {
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
                return { success: false, summary: `No live quote available for ${ticker}. Skipping to avoid fabricated signals.`, signalsGenerated: 0 };
            }

            const currentPrice = quote.price;
            const priceDropPct = quote.changePercent || 0;

            // 3. Instead of waiting for RSS, we use Gemini's grounded search to find the latest "event" for this ticker
            const eventPrompt = `Find the most recent, significant news event for ${ticker} from the last 48 hours. Focus on earnings, regulatory news, product launches, or major macroeconomic impacts specific to this company. If there is no major news, summarize the current market sentiment.`;

            const eventExtraction = await AgentService.extractEventsFromText(eventPrompt);

            // Generate an event context
            let mockHeadline = `Recent market activity for ${ticker}`;
            let mockDesc = `Evaluating recent price action and news sentiment for ${ticker} across the market.`;

            if (eventExtraction.success && eventExtraction.data?.events?.length > 0) {
                const e = eventExtraction.data.events[0];
                mockHeadline = e.headline;
                mockDesc = `Event Type: ${e.event_type} | Severity: ${e.severity}`;
            }

            // 4. Save the event (upsert, fallback to insert if constraint missing)
            const { error: upsertErr } = await supabase.from('market_events').upsert({
                ticker: ticker,
                event_type: 'manual_scan',
                headline: mockHeadline,
                severity: 8, // Force trigger analysis
                is_overreaction_candidate: true,
                source_type: 'manual'
            }, { onConflict: 'ticker,headline', ignoreDuplicates: true });
            if (upsertErr) {
                console.warn('[Scanner] Upsert failed, falling back to insert:', upsertErr.message);
                await supabase.from('market_events').insert({
                    ticker: ticker,
                    event_type: 'manual_scan',
                    headline: mockHeadline,
                    severity: 8,
                    is_overreaction_candidate: true,
                    source_type: 'manual'
                });
            }

            // 5. Run Overreaction Analysis
            const analysis = await AgentService.evaluateOverreaction(
                ticker,
                mockHeadline,
                mockDesc,
                currentPrice,
                priceDropPct
            );

            let signalsGenerated = 0;

            if (analysis.success && analysis.data?.is_overreaction && analysis.data.confidence_score > DEFAULT_MIN_CONFIDENCE) {
                // 6. Run Sanity Check
                const sanity = await AgentService.runSanityCheck(
                    ticker,
                    analysis.data.thesis,
                    analysis.data.target_price,
                    analysis.data.stop_loss,
                    'OVERREACTION_AGENT'
                );

                if (sanity.success && sanity.data?.passes_sanity_check) {
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
                            'OVERREACTION_AGENT'
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
                            'long_overreaction'
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
                            'OVERREACTION_AGENT'
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
                            signalType: 'long_overreaction',
                            moatRating: analysis.data.moat_rating,
                            lynchCategory: analysis.data.lynch_category,
                            convictionScore: analysis.data.conviction_score,
                            fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
                            taSnapshot: singleTaSnapshot,
                        });
                        if (singleDecisionTwinOutput.confidence_adjustment !== 0) {
                            singleConfidence = singleDecisionTwinOutput.adjusted_confidence;
                        }
                        if (singleDecisionTwinOutput.skip_count === 3) {
                            console.warn(`[Scanner] Decision Twin suppressed single-ticker ${ticker}: all 3 personas voted SKIP`);
                            return { success: false, error: 'Decision Twin: all personas voted SKIP' };
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
                    } else if (!singleMosCheck.passed) {
                        console.log(`[Scanner] Single-ticker ${ticker} dropped by margin-of-safety gate`);
                    } else {
                        // 7c. Calibrated confidence
                        let calibratedConf = singleConfidence;
                        try {
                            const curve = await ConfidenceCalibrator.getCachedCurve();
                            calibratedConf = ConfidenceCalibrator.getCalibratedWinRate(singleConfidence, curve);
                        } catch { /* non-fatal */ }

                        // 7d. Confluence with TA
                        const discConfluence = TechnicalAnalysisService.computeConfluence(
                            singleTaSnapshot, 'long', singleConfidence
                        );

                        // 7e. SWOT ANALYSIS — narrative enrichment (non-blocking)
                        let singleSwotOutput: import('@/types/agents').SWOTResult | null = null;
                        try {
                            singleSwotOutput = await SWOTAnalysisService.analyze({
                                ticker,
                                headline: `Manual scan: ${ticker}`,
                                thesis: analysis.data.thesis,
                                reasoning: analysis.data.reasoning || analysis.data.thesis,
                                confidence: singleConfidence,
                                signalType: 'long_overreaction',
                                counterThesis: sanity.data?.counter_thesis ?? null,
                                criticalFlaws: critiqueOutput?.criticalFlaws ?? [],
                                decisionTwin: singleDecisionTwinOutput,
                                moatRating: analysis.data.moat_rating,
                                lynchCategory: analysis.data.lynch_category,
                                taSnapshot: singleTaSnapshot,
                            });
                        } catch { /* non-fatal */ }

                        const { data: savedSignal, error: discSignalErr } = await supabase.from('signals').insert({
                            ticker: ticker,
                            signal_type: 'long_overreaction',
                            confidence_score: singleConfidence,
                            calibrated_confidence: calibratedConf,
                            risk_level: sanity.data.risk_score > 80 ? 'low' : 'medium',
                            bias_type: (analysis.data as any).bias_type || 'recency_bias',
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
                                overreaction: analysis.data,
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
                            is_paper: isPaper
                        } as any).select().single();

                        if (discSignalErr) {
                            console.error(`[Scanner] Failed to save discovery signal for ${ticker}:`, discSignalErr.message);
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
                    } // end self-critique else
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

            return {
                success: true,
                summary: `Manual scan complete for ${ticker}: ${signalsGenerated} signals generated.`,
                signalsGenerated
            };

        } catch (e: any) {
            console.error(`[Scanner] Fatal error during single scan for ${ticker}:`, e);

            // Attempt to update log as failed
            await supabase.from('scan_logs')
                .update({ status: 'failed', error_message: (e as Error).message })
                .eq('status', 'running');

            return { success: false, error: e.message };
        }
    }

    /**
     * AI Ticker Discovery — Ask Gemini to identify trending tickers worth scanning
     * based on current market events, news catalysts, and unusual market action.
     * Returns up to `count` tickers with context on why each was flagged.
     */
    static async discoverTrendingTickers(count: number = 5): Promise<{ ticker: string; reason: string; catalyst: string }[]> {
        console.log(`[Scanner] Discovering ${count} trending tickers via AI...`);

        try {
            const { data: geminiRes, error: geminiErr } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    systemInstruction: `You are an elite market analyst for a quantitative trading desk. Today is ${new Date().toISOString().split('T')[0]}. Your job is to identify equities experiencing significant catalytic events RIGHT NOW that could create short-term trading opportunities. Focus on: earnings surprises, FDA decisions, analyst upgrades/downgrades, unusual volume spikes, sector rotation, insider activity, and geopolitical events affecting specific companies. You may include both US and international equities (e.g. FRES.L, AAF.L, THX.V) — preserve exchange suffixes. No penny stocks, no OTC.`,
                    prompt: `Identify the top ${count} most actionable stock tickers to analyze right now based on today's market conditions. Include both US and major international equities where catalysts are strongest. For each, explain the specific catalyst driving the opportunity. To ensure diverse coverage, focus on different sectors than your previous scans. (Random seed for variance: ${Math.random()}).

You MUST respond with ONLY a JSON object — no markdown, no commentary, no code fences. Use this exact format:
{"tickers": [{"ticker": "NVDA", "reason": "Earnings beat expectations by 15%", "catalyst": "earnings_beat"}, {"ticker": "FRES.L", "reason": "Gold price surge lifting miners", "catalyst": "sector_rotation"}]}`,
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
                } catch (parseErr) {
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

                const discovered = tickerArray.slice(0, count).map((t: any) => ({
                    // Preserve exchange suffixes like .L, .TO, .V, .DE — only strip truly invalid chars
                    ticker: (t.ticker || '').toUpperCase().replace(/[^A-Z0-9.]/g, ''),
                    reason: t.reason || 'Trending',
                    catalyst: t.catalyst || 'other',
                })).filter((t: any) => {
                    const base = t.ticker.replace(/\.[A-Z]{1,3}$/, '');
                    return base.length >= 1 && base.length <= 5 && t.ticker.length <= 8;
                });

                console.log(`[Scanner] Discovered ${discovered.length} trending tickers:`, discovered.map((d: any) => `${d.ticker} (${d.catalyst})`).join(', '));
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
    ): Promise<{ discovered: number; scanned: number; signalsGenerated: number; tickers: string[] }> {
        const startTime = Date.now();

        // 1. Discover trending tickers via AI
        onProgress?.('Discovering trending tickers via AI...');
        const discovered = await this.discoverTrendingTickers(count);

        if (discovered.length === 0) {
            onProgress?.('No trending tickers found. Market may be quiet.');
            return { discovered: 0, scanned: 0, signalsGenerated: 0, tickers: [] };
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

                // Run full single-ticker scan
                const result = await this.runSingleTickerScan(ticker);
                scannedTickers.push(ticker);

                if (result.success && result.signalsGenerated && result.signalsGenerated > 0) {
                    totalSignals += result.signalsGenerated;
                }
            } catch (e: any) {
                console.warn(`[Scanner] Discovery scan failed for ${ticker}:`, e.message);
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
        };
    }
}
