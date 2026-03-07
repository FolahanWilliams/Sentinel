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
import { AgentService, type MarketContext } from './agents';
import { GeminiService } from './gemini';
import { NotificationService } from './notifications';
import { RSSReaderService } from './rssReader';
import { GoogleNewsService } from './googleNews';
import { RedditSentimentService } from './redditSentiment';
import { OutcomeTracker } from './outcomeTracker';
import { PositionSizer } from './positionSizer';
import { performanceStats } from './performanceStats';
import { ReflectionAgent } from './reflectionAgent';
import { isBudgetExceeded } from '@/utils/costEstimator';
import { responseValidator } from '@/utils/responseValidator';
import { TechnicalAnalysisService } from './technicalAnalysis';
import { ConfidenceCalibrator } from './confidenceCalibrator';
import { SelfCritiqueAgent } from './selfCritique';
import { SentimentDivergenceDetector } from './sentimentDivergence';
import { EarningsGuard } from './earningsGuard';
import { calculateWeightedRoi } from '@/utils/weightedRoi';

export class ScannerService {

    /**
     * Ensure a ticker exists in the watchlist table so FK constraints on market_events are satisfied.
     * Uses upsert with ignoreDuplicates so it's safe to call multiple times.
     */
    private static async ensureWatchlistEntry(ticker: string): Promise<void> {
        const { error } = await supabase.from('watchlist').upsert({
            ticker: ticker.toUpperCase(),
            company_name: ticker.toUpperCase(), // Placeholder — will be enriched later
            sector: 'Unknown',
            is_active: true,
            notes: 'Auto-added by AI discovery scan'
        } as any, { onConflict: 'ticker', ignoreDuplicates: true });
        if (error) {
            console.warn(`[Scanner] Failed to ensure watchlist entry for ${ticker}:`, error.message);
        }
    }

    /**
     * Smart Scan Prioritization — rank tickers by urgency.
     * Higher priority = more recent events + higher win rate + more RSS mentions
     * + News Intelligence (sentinel_articles) high-impact article mentions.
     */
    static async prioritizeTickers(tickers: { ticker: string; sector: string }[]): Promise<{ ticker: string; sector: string; priority: number; prioritySources: string[] }[]> {
        const tickerNames = tickers.map(t => t.ticker);

        // Count recent events per ticker (last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: recentEvents } = await supabase
            .from('market_events')
            .select('ticker')
            .in('ticker', tickerNames)
            .gte('detected_at', oneDayAgo);

        const eventCounts: Record<string, number> = {};
        for (const ev of recentEvents || []) {
            eventCounts[ev.ticker] = (eventCounts[ev.ticker] || 0) + 1;
        }

        // Win rate per ticker from outcomes
        const { data: signals } = await supabase
            .from('signals')
            .select('id, ticker')
            .in('ticker', tickerNames);

        const signalIds = (signals || []).map(s => s.id);
        const { data: outcomes } = signalIds.length > 0
            ? await supabase
                .from('signal_outcomes')
                .select('signal_id, outcome')
                .in('signal_id', signalIds)
                .neq('outcome', 'pending')
            : { data: [] };

        const tickerWinRates: Record<string, { wins: number; total: number }> = {};
        const outcomeMap = new Map((outcomes || []).map(o => [o.signal_id, o.outcome]));
        for (const s of signals || []) {
            const outcome = outcomeMap.get(s.id);
            if (!outcome) continue;
            if (!tickerWinRates[s.ticker]) tickerWinRates[s.ticker] = { wins: 0, total: 0 };
            const wr = tickerWinRates[s.ticker]!;
            wr.total++;
            if (outcome === 'win') wr.wins++;
        }

        // Count RSS mentions (articles in cache)
        const { data: rssMentions } = await supabase
            .from('rss_cache')
            .select('title')
            .gte('fetched_at', oneDayAgo)
            .limit(200);

        const rssCounts: Record<string, number> = {};
        for (const article of rssMentions || []) {
            const titleLower = (article.title || '').toLowerCase();
            for (const t of tickerNames) {
                if (titleLower.includes(t.toLowerCase())) {
                    rssCounts[t] = (rssCounts[t] || 0) + 1;
                }
            }
        }

        // ── NEWS INTELLIGENCE BOOST ──
        // Query sentinel_articles from last 24h (processed by the Intelligence subsystem)
        // High-impact articles mentioning a watchlist ticker get a massive priority boost
        const sentinelCounts: Record<string, { total: number; highImpact: number }> = {};
        try {
            const { data: sentinelArticles } = await (supabase
                .from('sentinel_articles' as any)
                .select('title, summary, impact, signals, affected_tickers') as any)
                .gte('processed_at', oneDayAgo)
                .limit(100);

            for (const article of (sentinelArticles || []) as any[]) {
                // Check affected_tickers array first (most reliable)
                const affectedTickers: string[] = article.affected_tickers || [];
                // Also scan title + summary for ticker mentions
                const textToScan = `${article.title || ''} ${article.summary || ''}`.toUpperCase();
                // Also extract tickers from signals JSONB [{ ticker, direction, confidence }]
                const articleSignals: Array<{ ticker?: string }> = Array.isArray(article.signals) ? article.signals : [];

                for (const t of tickerNames) {
                    const mentioned = affectedTickers.includes(t)
                        || textToScan.includes(t)
                        || articleSignals.some(s => s.ticker?.toUpperCase() === t);

                    if (mentioned) {
                        if (!sentinelCounts[t]) sentinelCounts[t] = { total: 0, highImpact: 0 };
                        sentinelCounts[t].total++;
                        if (article.impact === 'high') sentinelCounts[t].highImpact++;
                    }
                }
            }
        } catch (e) {
            console.warn('[Scanner] sentinel_articles boost lookup failed (non-fatal):', e);
        }

        // Score each ticker
        return tickers.map(t => {
            const events = eventCounts[t.ticker] || 0;
            const rss = rssCounts[t.ticker] || 0;
            const wr = tickerWinRates[t.ticker];
            const winRateBonus = wr ? (wr.wins / wr.total) * 20 : 0;
            const sentinel = sentinelCounts[t.ticker];
            const sentinelBoost = sentinel ? (sentinel.highImpact * 50) + (sentinel.total * 15) : 0;

            const priority = (events * 30) + (rss * 10) + winRateBonus + sentinelBoost + 10; // base 10

            // Track sources for transparency in logs
            const sources: string[] = [];
            if (events > 0) sources.push(`${events} events`);
            if (rss > 0) sources.push(`${rss} RSS`);
            if (sentinel && sentinel.total > 0) sources.push(`${sentinel.total} intel (${sentinel.highImpact} high)`);
            if (wr) sources.push(`${Math.round((wr.wins / wr.total) * 100)}% WR`);

            return { ...t, priority: Math.round(priority), prioritySources: sources };
        }).sort((a, b) => b.priority - a.priority);
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
                    } as any).eq('id', scanLog.id);
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

            // 3a. Pull Google News (via Gemini grounded search) & Reddit sentiment for watched tickers
            try {
                const headTickers = tickers.slice(0, 5);
                await Promise.allSettled([
                    GoogleNewsService.fetchAndCacheNews(headTickers),
                    RedditSentimentService.fetchAndCacheSentiment(headTickers)
                ]);
            } catch (extErr) {
                console.warn('[Scanner] External sentiment fetch failed (non-fatal):', extErr);
            }

            // 3b. Build performance context from past signal outcomes
            // This gets injected into agent prompts so they learn from accuracy history
            let perfContext = '';
            try {
                perfContext = await performanceStats.buildPerformanceContext();
                if (perfContext) {
                    console.log('[Scanner] Performance context loaded for agent feedback loop.');
                } else {
                    console.warn('[Scanner] Performance context is empty — agents running without historical calibration.');
                }
            } catch (perfErr) {
                console.warn('[Scanner] Failed to load performance context (non-fatal):', perfErr);
            }

            // 3c. Append self-learned lessons from Reflection Agent (RAG loop)
            try {
                const lessons = await ReflectionAgent.getLessonsForContext();
                if (lessons) {
                    perfContext += lessons;
                    console.log('[Scanner] Reflection lessons injected into agent context.');
                } else {
                    console.log('[Scanner] No reflection lessons available yet — run Reflection Agent after accumulating signal outcomes.');
                }
            } catch (reflErr) {
                console.warn('[Scanner] Failed to load reflection lessons (non-fatal):', reflErr);
            }

            // 4. Find fresh unparsed articles from the cache
            // In a real flow, we'd only grab articles from the last hour
            const { data: freshArticles } = await supabase
                .from('rss_cache')
                .select('*')
                .order('fetched_at', { ascending: false })
                .limit(30);

            // 5. Extract Events via Gemini Fast-Pass
            if (freshArticles && freshArticles.length > 0) {
                // A. Semantic Deduplication
                const uniqueArticles = [];
                for (const article of freshArticles) {
                    const normTitle = (article.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '');
                    const words = new Set(normTitle.split(' ').filter(w => w.length > 3));
                    let isDupe = false;
                    for (const u of uniqueArticles) {
                        const uWords = new Set((u.title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').filter(w => w.length > 3));
                        const intersection = new Set([...words].filter(x => uWords.has(x)));
                        const union = new Set([...words, ...uWords]);
                        if (union.size > 0 && intersection.size / union.size > 0.45) {
                            isDupe = true;
                            // Append description to existing to keep context
                            u.description = `${u.description} | Additional Source: ${article.description}`;
                            break;
                        }
                    }
                    if (!isDupe) uniqueArticles.push({ ...article });
                }

                console.log(`[Scanner] Semantically deduplicated ${freshArticles.length} articles to ${uniqueArticles.length} unique stories.`);

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
                const extraction = actionableArticles.length > 0
                    ? await AgentService.extractEventsFromText(combinedText)
                    : { success: true, data: { events: [] } };

                // 5b. Per-Ticker Grounded Search — supplement RSS with Gemini Google Search
                // This ensures we always have fresh context, even when RSS lacks ticker-specific news.
                console.log(`[Scanner] Running per-ticker grounded search for ${tickers.length} tickers...`);
                for (const ticker of tickers.slice(0, 5)) { // Cap at 5 to control API cost
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
                                is_overreaction_candidate: ev.severity >= 4,
                                source_type: 'rss'
                            } as any).select('id').single();

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
                            if (savedEvent && ev.severity >= 4) {
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

                                // 6a. Pre-fetch TA snapshot for agent context
                                let earlyTaSnapshot = null;
                                let earlyTaContext = '';
                                try {
                                    earlyTaSnapshot = await TechnicalAnalysisService.getSnapshot(ev.ticker);
                                    earlyTaContext = TechnicalAnalysisService.formatForPrompt(earlyTaSnapshot);
                                } catch { /* non-fatal — TA context optional */ }

                                // 6b. Fetch historical context for this ticker
                                let historicalCtx = '';
                                try {
                                    const { data: pastSignals } = await supabase
                                        .from('signals')
                                        .select('signal_type, confidence_score, thesis, created_at, signal_outcomes(outcome, return_at_5d)')
                                        .eq('ticker', ev.ticker)
                                        .order('created_at', { ascending: false })
                                        .limit(5);
                                    if (pastSignals && pastSignals.length > 0) {
                                        const lines = pastSignals.map((s: any) => {
                                            const outcome = s.signal_outcomes?.[0];
                                            const ret = outcome?.return_at_5d != null ? `${Number(outcome.return_at_5d) > 0 ? '+' : ''}${Number(outcome.return_at_5d).toFixed(1)}%` : 'pending';
                                            return `- ${s.signal_type} (conf: ${s.confidence_score}) → ${outcome?.outcome || 'pending'} (5d: ${ret})`;
                                        });
                                        historicalCtx = `\n\nHISTORICAL SIGNALS FOR ${ev.ticker} (last ${pastSignals.length}):\n${lines.join('\n')}\nUse this history to calibrate — if past signals for this ticker failed, be MORE skeptical.`;
                                    }
                                } catch { /* non-fatal */ }

                                // 6c. Sentiment-Price Divergence Analysis
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

                                // 6d. Gap-Fill Detection
                                let gapCtx = '';
                                const gapFill = TechnicalAnalysisService.evaluateGapFill(earlyTaSnapshot, quote.previousClose ?? 0);
                                if (gapFill.isCandidate) {
                                    gapCtx = `\nGAP ANALYSIS: ${ev.ticker} gapped ${gapFill.gapPct > 0 ? 'UP' : 'DOWN'} ${Math.abs(gapFill.gapPct).toFixed(1)}% (${gapFill.gapType} gap). Gap-fill target: $${Number(gapFill.gapFillTarget).toFixed(2)}. Common and exhaustion gaps have high fill probability within 1-3 days.`;
                                    console.log(`[Scanner] Gap detected for ${ev.ticker}: ${gapFill.gapType} gap ${gapFill.gapPct.toFixed(1)}%`);
                                }

                                // 6e. Earnings Calendar Guard — block/penalize signals near earnings
                                let earningsCtx = '';
                                let earningsGuardResult = null;
                                try {
                                    earningsGuardResult = await EarningsGuard.check(ev.ticker);
                                    if (earningsGuardResult.shouldBlock) {
                                        console.warn(`[Scanner] EARNINGS GUARD blocked ${ev.ticker}: ${earningsGuardResult.reason}`);
                                        continue;
                                    }
                                    earningsCtx = EarningsGuard.formatForPrompt(earningsGuardResult);
                                } catch { /* non-fatal */ }

                                // 6f. Fundamental Data Enrichment — fetch P/E, debt/equity, etc.
                                let fundamentalsCtx = '';
                                let fundamentalsData = null;
                                try {
                                    fundamentalsData = await MarketDataService.getFundamentals(ev.ticker);
                                    fundamentalsCtx = MarketDataService.formatFundamentalsForPrompt(fundamentalsData);

                                    // Fundamental red flags: auto-penalize confidence later
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

                                // Combine TA + divergence + gap + earnings + fundamentals into unified context
                                const enrichedTaContext = earlyTaContext + divergenceCtx + gapCtx + earningsCtx + fundamentalsCtx;

                                // Pipeline A: Overreaction Analysis
                                const analysis = await AgentService.evaluateOverreaction(
                                    ev.ticker,
                                    ev.headline,
                                    eventContext,
                                    quote.price,
                                    priceDrop,
                                    perfContext,
                                    marketContext,
                                    enrichedTaContext,
                                    historicalCtx
                                );

                                // Validate agent response before acting on it
                                const validation = responseValidator.validate(analysis.data);
                                if (!validation.valid) {
                                    console.warn(`[Scanner] Overreaction response failed validation for ${ev.ticker}:`, validation.warnings);
                                }

                                // Diagnostic logging — show WHY signals are accepted/rejected
                                if (analysis.success) {
                                    console.log(`[Scanner] Overreaction result for ${ev.ticker}: is_overreaction=${analysis.data?.is_overreaction}, confidence=${analysis.data?.confidence_score}, thesis="${(analysis.data?.thesis || '').slice(0, 80)}..."`);
                                } else {
                                    console.warn(`[Scanner] Overreaction agent FAILED for ${ev.ticker}: ${analysis.error}`);
                                }

                                if (analysis.success && validation.valid && analysis.data?.is_overreaction && analysis.data.confidence_score > 75) {

                                    // 6.5. TA CONFIRMATION LAYER — use pre-fetched TA snapshot
                                    let taSnapshot = earlyTaSnapshot;
                                    let taAlignment: import('@/types/signals').TAAlignment = 'unavailable';
                                    try {
                                        if (!taSnapshot) {
                                            taSnapshot = await TechnicalAnalysisService.getSnapshot(ev.ticker);
                                        }
                                        taAlignment = TechnicalAnalysisService.evaluateAlignment(taSnapshot, 'long');

                                        // Block signal if TA shows buying into exhaustion
                                        const blockCheck = TechnicalAnalysisService.shouldBlockLong(taSnapshot);
                                        if (blockCheck.blocked) {
                                            console.warn(`[Scanner] TA BLOCKED signal for ${ev.ticker}: ${blockCheck.reason}`);
                                            continue;
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

                                    // 7. SANITY CHECK (Red Team)
                                    const sanity = await AgentService.runSanityCheck(
                                        ev.ticker,
                                        analysis.data.thesis,
                                        analysis.data.target_price,
                                        analysis.data.stop_loss,
                                        'OVERREACTION_AGENT',
                                        perfContext,
                                        earlyTaContext
                                    );

                                    // Log sanity check result
                                    if (sanity.success) {
                                        console.log(`[Scanner] Sanity check for ${ev.ticker}: passes=${sanity.data?.passes_sanity_check}, risk=${sanity.data?.risk_score}`);
                                    } else {
                                        console.warn(`[Scanner] Sanity check FAILED for ${ev.ticker}: ${sanity.error}`);
                                    }

                                    if (sanity.success && sanity.data?.passes_sanity_check) {
                                        // 7.5. SELF-CRITIQUE — second-pass confidence adjustment
                                        let critiqueOutput = null;
                                        try {
                                            const critique = await SelfCritiqueAgent.critique(
                                                ev.ticker,
                                                analysis.data.thesis,
                                                analysis.data.reasoning || analysis.data.thesis,
                                                analysis.data.confidence_score,
                                                sanity.data.counter_thesis,
                                                'long_overreaction'
                                            );
                                            critiqueOutput = critique;
                                            if (critique.hasFlaws && critique.adjustedConfidence < analysis.data.confidence_score) {
                                                console.log(`[Scanner] Self-critique adjusted confidence for ${ev.ticker}: ${analysis.data.confidence_score} → ${critique.adjustedConfidence} (${critique.criticalFlaws.length} critical, ${critique.minorFlaws.length} minor flaws)`);
                                                analysis.data.confidence_score = critique.adjustedConfidence;
                                            }
                                            // Drop signal if critique brings confidence below threshold
                                            if (critique.adjustedConfidence < 50) {
                                                console.warn(`[Scanner] Self-critique dropped signal for ${ev.ticker} — adjusted confidence ${critique.adjustedConfidence} below threshold`);
                                                continue;
                                            }
                                        } catch (critiqueErr) {
                                            console.warn(`[Scanner] Self-critique failed for ${ev.ticker} (non-fatal):`, critiqueErr);
                                        }

                                        // 7.6. SENTIMENT DIVERGENCE BOOST — adjust confidence based on narrative-price divergence
                                        if (divergenceResult && divergenceResult.confidenceBoost !== 0) {
                                            const before = analysis.data.confidence_score;
                                            analysis.data.confidence_score = Math.min(100, Math.max(30,
                                                analysis.data.confidence_score + divergenceResult.confidenceBoost
                                            ));
                                            console.log(`[Scanner] Divergence ${divergenceResult.divergenceType} adjusted confidence for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${divergenceResult.confidenceBoost > 0 ? '+' : ''}${divergenceResult.confidenceBoost})`);
                                        }

                                        // 7.7. EARNINGS CALENDAR PENALTY — reduce confidence near earnings
                                        if (earningsGuardResult && earningsGuardResult.confidencePenalty !== 0) {
                                            const before = analysis.data.confidence_score;
                                            analysis.data.confidence_score = Math.min(100, Math.max(30,
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
                                                analysis.data.confidence_score = Math.max(30, analysis.data.confidence_score + fundPenalty);
                                                console.log(`[Scanner] Fundamentals penalty for ${ev.ticker}: ${before} → ${analysis.data.confidence_score} (${fundPenalty})`);
                                            }
                                        }

                                        // Drop signal if all adjustments brought it below threshold
                                        if (analysis.data.confidence_score < 50) {
                                            console.warn(`[Scanner] Signal for ${ev.ticker} dropped — confidence ${analysis.data.confidence_score} below 50 after all adjustments`);
                                            continue;
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

                                        // Calibrated confidence
                                        let calibratedConfidence: number | null = null;
                                        try {
                                            const curve = await ConfidenceCalibrator.getCachedCurve();
                                            calibratedConfidence = ConfidenceCalibrator.getCalibratedWinRate(analysis.data.confidence_score, curve);
                                        } catch { /* non-fatal */ }

                                        // Weighted Similarity ROI — multi-factor matching
                                        let projectedRoi: number | null = null;
                                        let projectedWinRate: number | null = null;
                                        let similarEventsCount: number | null = null;
                                        try {
                                            const taAlignStr = typeof taAlignment === 'string' ? taAlignment : 'unavailable';
                                            const roiResult = await calculateWeightedRoi(
                                                'long_overreaction',
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

                                        const { data: savedSignal } = await supabase.from('signals').insert({
                                            ticker: ev.ticker,
                                            signal_type: 'long_overreaction',
                                            confidence_score: analysis.data.confidence_score,
                                            calibrated_confidence: calibratedConfidence,
                                            risk_level: sanity.data.risk_score > 80 ? 'low' : 'medium',
                                            bias_type: 'recency_bias',
                                            thesis: analysis.data.thesis,
                                            counter_argument: sanity.data.counter_thesis,
                                            suggested_entry_low: analysis.data.suggested_entry_low,
                                            suggested_entry_high: analysis.data.suggested_entry_high,
                                            stop_loss: stopLoss,
                                            target_price: analysis.data.target_price,
                                            trailing_stop_rule: trailingStopRule,
                                            ta_snapshot: taSnapshot,
                                            ta_alignment: taAlignment,
                                            confluence_score: confluence.score,
                                            confluence_level: confluence.level,
                                            projected_roi: projectedRoi,
                                            projected_win_rate: projectedWinRate,
                                            similar_events_count: similarEventsCount,
                                            data_quality: 'full',
                                            agent_outputs: {
                                                overreaction: analysis.data,
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
                                                    short_interest_pct: (fundamentalsData as any).short_interest_pct,
                                                } : null,
                                            },
                                            status: 'active',
                                            secondary_biases: [],
                                            sources: [],
                                            is_paper: false
                                        } as any).select().single();

                                        // 8b. Seed outcome tracking row so OutcomeTracker can follow this signal
                                        if (savedSignal) {
                                            // Dispatch alert rules
                                            NotificationService.checkAndDispatchAlerts(savedSignal);

                                            await supabase.from('signal_outcomes').insert({
                                                signal_id: savedSignal.id,
                                                ticker: ev.ticker,
                                                entry_price: entryPrice,
                                                outcome: 'pending',
                                                hit_stop_loss: false,
                                                hit_target: false,
                                            } as any);
                                        }

                                        // 9. Position sizing recommendation (V2 with dynamic stops)
                                        try {
                                            const sizing = await PositionSizer.calculateSizeV2(
                                                analysis.data.confidence_score,
                                                entryPrice,
                                                analysis.data.target_price,
                                                'long_overreaction',
                                                taSnapshot,
                                                ev.ticker,
                                                confluence.score
                                            );
                                            console.log(`[Scanner] Position size for ${ev.ticker}: ${sizing.recommendedPct}% ($${sizing.usdValue}) via ${sizing.method}${sizing.stopLoss ? ` | SL: $${sizing.stopLoss}` : ''}`);

                                            // Persist position sizing into agent_outputs
                                            if (savedSignal) {
                                                const existingOutputs = (savedSignal as any).agent_outputs || {};
                                                await supabase.from('signals').update({
                                                    agent_outputs: {
                                                        ...existingOutputs,
                                                        position_sizing: {
                                                            recommended_pct: sizing.recommendedPct,
                                                            usd_value: sizing.usdValue,
                                                            shares: sizing.shares,
                                                            method: sizing.method,
                                                            stop_loss: sizing.stopLoss,
                                                            risk_reward_ratio: sizing.riskRewardRatio,
                                                        },
                                                    },
                                                } as any).eq('id', savedSignal.id);
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
                                                    let satQuote;
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

                                                    if (contagion.success && contagion.data?.is_contagion && contagion.data.confidence_score > 70) {
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
                                                            signalsGenerated++;

                                                            // Confluence for contagion signal
                                                            const contagionConfluence = TechnicalAnalysisService.computeConfluence(
                                                                null, 'long', contagion.data.confidence_score
                                                            );

                                                            const { data: savedContagionSignal } = await supabase.from('signals').insert({
                                                                ticker: sat.ticker,
                                                                signal_type: 'sector_contagion',
                                                                confidence_score: contagion.data.confidence_score,
                                                                risk_level: contagionSanity.data.risk_score > 80 ? 'low' : 'medium',
                                                                bias_type: 'representativeness_heuristic',
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
                                                                },
                                                                status: 'active',
                                                                calibrated_confidence: await (async () => {
                                                                    try {
                                                                        const curve = await ConfidenceCalibrator.getCachedCurve();
                                                                        return ConfidenceCalibrator.getCalibratedWinRate(contagion.data.confidence_score, curve);
                                                                    } catch { return contagion.data.confidence_score; }
                                                                })(),
                                                                data_quality: 'partial',
                                                                secondary_biases: ['herding'],
                                                                sources: [],
                                                                is_paper: false
                                                            } as any).select().single();

                                                            // Seed outcome tracking
                                                            if (savedContagionSignal) {
                                                                NotificationService.checkAndDispatchAlerts(savedContagionSignal);

                                                                await supabase.from('signal_outcomes').insert({
                                                                    signal_id: savedContagionSignal.id,
                                                                    ticker: sat.ticker,
                                                                    entry_price: satQuote.price,
                                                                    outcome: 'pending',
                                                                    hit_stop_loss: false,
                                                                    hit_target: false,
                                                                } as any);
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

            // 12. Update Scan Log
            const durationMs = Date.now() - startTime;
            if (scanLog) {
                await supabase.from('scan_logs').update({
                    status: 'completed',
                    tickers_scanned: tickers.length,
                    events_detected: eventsFound,
                    signals_generated: signalsGenerated,
                    duration_ms: durationMs,
                } as any).eq('id', scanLog.id);
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
                .update({ status: 'failed', error_message: e.message } as any)
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
                } as any)
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
                    } as any).eq('id', scanLog.id);
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
            } as any, { onConflict: 'ticker,headline', ignoreDuplicates: true });
            if (upsertErr) {
                console.warn('[Scanner] Upsert failed, falling back to insert:', upsertErr.message);
                await supabase.from('market_events').insert({
                    ticker: ticker,
                    event_type: 'manual_scan',
                    headline: mockHeadline,
                    severity: 8,
                    is_overreaction_candidate: true,
                    source_type: 'manual'
                } as any);
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

            if (analysis.success && analysis.data?.is_overreaction && analysis.data.confidence_score > 50) {
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
                            Math.max(30, Math.max(rawAdj, singleConfidence - maxReduction))
                        );
                    } catch { /* non-fatal */ }

                    // Drop if self-critique pushed below threshold
                    if (singleConfidence < 50) {
                        console.log(`[Scanner] Single-ticker ${ticker} dropped by self-critique: ${analysis.data.confidence_score}→${singleConfidence}`);
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

                    const { data: savedSignal } = await supabase.from('signals').insert({
                        ticker: ticker,
                        signal_type: 'long_overreaction',
                        confidence_score: singleConfidence,
                        calibrated_confidence: calibratedConf,
                        risk_level: sanity.data.risk_score > 80 ? 'low' : 'medium',
                        bias_type: 'recency_bias',
                        thesis: analysis.data.thesis,
                        counter_argument: sanity.data.counter_thesis,
                        suggested_entry_low: analysis.data.suggested_entry_low,
                        suggested_entry_high: analysis.data.suggested_entry_high,
                        stop_loss: analysis.data.stop_loss,
                        target_price: analysis.data.target_price,
                        ta_snapshot: singleTaSnapshot,
                        ta_alignment: singleTaAlignment,
                        confluence_score: discConfluence.score,
                        confluence_level: discConfluence.level,
                        agent_outputs: {
                            overreaction: analysis.data,
                            red_team: sanity.data,
                            self_critique: critiqueOutput,
                        },
                        status: 'active',
                        data_quality: singleTaSnapshot ? 'full' : 'partial',
                        sources: [],
                        is_paper: isPaper
                    } as any).select().single();

                    if (savedSignal) {
                        NotificationService.checkAndDispatchAlerts(savedSignal);

                        // Seed outcome tracking so OutcomeTracker can follow this signal
                        await supabase.from('signal_outcomes').insert({
                            signal_id: savedSignal.id,
                            ticker: ticker,
                            entry_price: currentPrice,
                            outcome: 'pending',
                            hit_stop_loss: false,
                            hit_target: false,
                        } as any);
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
                } as any).eq('id', scanLog.id);
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
                .update({ status: 'failed', error_message: e.message } as any)
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
            } as any)
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
