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

export class ScannerService {

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
        const errors: string[] = [];

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

            // Smart Scan Prioritization — rank tickers by urgency
            const prioritized = await this.prioritizeTickers(watchlist);
            const maxTickers = scanType === 'fast' ? Math.min(5, prioritized.length) : prioritized.length;
            const tickersToScan = prioritized.slice(0, maxTickers);
            const tickers = tickersToScan.map(w => w.ticker);

            console.log(`[Scanner] Prioritized ${tickers.length} tickers:`, tickersToScan.map(t => {
                const src = t.prioritySources.length > 0 ? ` [${t.prioritySources.join(', ')}]` : '';
                return `${t.ticker}(${t.priority}${src})`;
            }).join(', '));

            // 3. Sync RSS Feeds + Alpha Vantage News (Feed the beast)
            await RSSReaderService.syncAllFeeds();

            // 3a. Pull Alpha Vantage & Reddit sentiment for watched tickers
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
                        const tickerSearchResult = await GeminiService.generate<{ events: any[] }>({
                            prompt: `Find the most significant news event for stock ticker ${ticker} from the last 48 hours. Focus on earnings, analyst ratings, product launches, M&A, regulatory decisions, tariffs, partnerships, or any catalyst that could move the stock price. If there is genuinely no major news, return an empty events array.`,
                            requireGroundedSearch: true,
                            responseSchema: {
                                type: "object",
                                properties: {
                                    events: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                ticker: { type: "string" },
                                                event_type: { type: "string" },
                                                headline: { type: "string" },
                                                severity: { type: "integer", description: "1-10 impact scale" }
                                            },
                                            required: ["ticker", "event_type", "headline", "severity"]
                                        }
                                    }
                                },
                                required: ["events"]
                            }
                        });

                        if (tickerSearchResult.success && tickerSearchResult.data?.events && tickerSearchResult.data.events.length > 0) {
                            // Merge grounded events into extraction results
                            if (!extraction.data) extraction.data = { events: [] };
                            if (!extraction.data.events) extraction.data.events = [];
                            const gsEvents = tickerSearchResult.data.events;
                            for (const ev of gsEvents) {
                                // Force ticker to match the one we searched for
                                ev.ticker = ticker;
                                extraction.data.events.push(ev);
                            }
                            console.log(`[Scanner] Grounded search found ${gsEvents.length} events for ${ticker}`);
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

                if (extraction.success && extraction.data?.events) {
                    console.log(`[Scanner] Extracted ${extraction.data.events.length} events:`, extraction.data.events.map((e: any) => `${e.ticker}(${e.event_type}, sev=${e.severity})`).join(', '));

                    for (const ev of extraction.data.events) {
                        // Only care about events concerning our watchlist
                        if (tickers.includes(ev.ticker)) {
                            eventsFound++;

                            // Save Event to DB
                            const { data: savedEvent } = await supabase.from('market_events').upsert({
                                ticker: ev.ticker,
                                event_type: ev.event_type,
                                headline: ev.headline,
                                severity: ev.severity,
                                is_overreaction_candidate: ev.severity >= 5,
                                source_type: 'rss'
                            } as any, { onConflict: 'ticker,headline', ignoreDuplicates: true }).select('id').single();

                            // 6. Trigger Deep Analysis Pipeline if moderate-to-severe
                            if (savedEvent && ev.severity >= 5) {
                                console.log(`[Scanner] Deep analysis triggered for ${ev.ticker} (severity=${ev.severity}): ${ev.headline}`);
                                // Fetch live quote for context
                                let quote: any;
                                try {
                                    quote = await MarketDataService.getQuote(ev.ticker);
                                } catch (e) { /* ignore */ }

                                const priceDrop = quote ? quote.changePercent : -10; // Mocked if api fails

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

                                // Pipeline A: Overreaction Analysis
                                const analysis = await AgentService.evaluateOverreaction(
                                    ev.ticker,
                                    ev.headline,
                                    eventContext,
                                    quote?.price || 100,
                                    priceDrop,
                                    perfContext,
                                    marketContext
                                );

                                // Validate agent response before acting on it
                                const validation = responseValidator.validate(analysis.data);
                                if (!validation.valid) {
                                    console.warn(`[Scanner] Overreaction response failed validation for ${ev.ticker}:`, validation.warnings);
                                }

                                if (analysis.success && validation.valid && analysis.data?.is_overreaction && analysis.data.confidence_score > 75) {

                                    // 7. SANITY CHECK (Red Team)
                                    const sanity = await AgentService.runSanityCheck(
                                        ev.ticker,
                                        analysis.data.thesis,
                                        analysis.data.target_price,
                                        analysis.data.stop_loss,
                                        'OVERREACTION_AGENT',
                                        perfContext
                                    );

                                    if (sanity.success && sanity.data?.passes_sanity_check) {
                                        // 8. WINNER! WE HAVE A SIGNAL.
                                        signalsGenerated++;

                                        const entryPrice = quote?.price || 100;
                                        const { data: savedSignal } = await supabase.from('signals').insert({
                                            ticker: ev.ticker,
                                            signal_type: 'long_overreaction',
                                            confidence_score: analysis.data.confidence_score,
                                            risk_level: sanity.data.risk_score > 80 ? 'low' : 'medium',
                                            bias_type: 'recency_bias',
                                            thesis: analysis.data.thesis,
                                            counter_argument: sanity.data.counter_thesis,
                                            suggested_entry_low: analysis.data.suggested_entry_low,
                                            suggested_entry_high: analysis.data.suggested_entry_high,
                                            stop_loss: analysis.data.stop_loss,
                                            target_price: analysis.data.target_price,
                                            agent_outputs: {
                                                overreaction: analysis.data,
                                                red_team: sanity.data
                                            },
                                            status: 'open',
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

                                        // 9. Position sizing recommendation
                                        try {
                                            const sizing = await PositionSizer.calculateSize(0.6, 0.10, 0.05);
                                            console.log(`[Scanner] Position size for ${ev.ticker}: ${sizing.recommendedPct}% ($${sizing.usdValue})`);
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
                                                    } catch { continue; } // skip if no quote

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
                                                                agent_outputs: {
                                                                    contagion: contagion.data,
                                                                    red_team: contagionSanity.data,
                                                                    epicenter: { ticker: ev.ticker, headline: ev.headline }
                                                                },
                                                                status: 'open',
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
            errors.push(e.message);

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

            const currentPrice = quote?.price || 100;
            const priceDropPct = quote?.changePercent || 0;

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

            // 4. Save the event
            await supabase.from('market_events').upsert({
                ticker: ticker,
                event_type: 'manual_scan',
                headline: mockHeadline,
                severity: 8, // Force trigger analysis
                is_overreaction_candidate: true,
                source_type: 'manual'
            } as any, { onConflict: 'ticker,headline', ignoreDuplicates: true });

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
                    // 7. Save Signal
                    // 7. Save Signal
                    signalsGenerated = 1;
                    const { data: savedSignal } = await supabase.from('signals').insert({
                        ticker: ticker,
                        signal_type: 'long_overreaction',
                        confidence_score: analysis.data.confidence_score,
                        risk_level: sanity.data.risk_score > 80 ? 'low' : 'medium',
                        bias_type: 'recency_bias',
                        thesis: analysis.data.thesis,
                        counter_argument: sanity.data.counter_thesis,
                        suggested_entry_low: analysis.data.suggested_entry_low,
                        suggested_entry_high: analysis.data.suggested_entry_high,
                        stop_loss: analysis.data.stop_loss,
                        target_price: analysis.data.target_price,
                        agent_outputs: {
                            overreaction: analysis.data,
                            red_team: sanity.data
                        },
                        status: 'open',
                        sources: [],
                        is_paper: isPaper
                    } as any).select().single();

                    if (savedSignal) {
                        NotificationService.checkAndDispatchAlerts(savedSignal);
                    }
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
                    systemInstruction: `You are an elite market analyst for a quantitative trading desk. Today is ${new Date().toISOString().split('T')[0]}. Your job is to identify US equities experiencing significant catalytic events RIGHT NOW that could create short-term trading opportunities. Focus on: earnings surprises, FDA decisions, analyst upgrades/downgrades, unusual volume spikes, sector rotation, insider activity, and geopolitical events affecting specific companies. Only suggest liquid US equities (no penny stocks, no OTC).`,
                    prompt: `Identify the top ${count} most actionable US stock tickers to analyze right now based on today's market conditions. For each, explain the specific catalyst driving the opportunity. To ensure diverse coverage, focus on different sectors than your previous scans. (Random seed for variance: ${Math.random()}). Return JSON matching the schema exactly.`,
                    requireGroundedSearch: true,
                    temperature: 0.8,
                    responseSchema: {
                        type: 'object',
                        properties: {
                            tickers: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        ticker: { type: 'string', description: 'US equity ticker symbol (e.g. NVDA, AAPL)' },
                                        reason: { type: 'string', description: 'Why this ticker is interesting right now (1-2 sentences)' },
                                        catalyst: { type: 'string', description: 'The specific catalyst type: earnings, fda_decision, analyst_action, unusual_volume, sector_rotation, insider_activity, geopolitical, other' },
                                    },
                                    required: ['ticker', 'reason', 'catalyst']
                                }
                            }
                        },
                        required: ['tickers']
                    }
                }
            });

            if (geminiErr) throw new Error(geminiErr.message);

            if (geminiRes?.text) {
                const parsed = JSON.parse(geminiRes.text);
                const discovered = (parsed.tickers || []).slice(0, count).map((t: any) => ({
                    ticker: (t.ticker || '').toUpperCase().replace(/[^A-Z]/g, ''),
                    reason: t.reason || 'Trending',
                    catalyst: t.catalyst || 'other',
                })).filter((t: any) => t.ticker.length >= 1 && t.ticker.length <= 5);

                console.log(`[Scanner] Discovered ${discovered.length} trending tickers:`, discovered.map((d: any) => `${d.ticker} (${d.catalyst})`).join(', '));
                return discovered;
            }

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
                // Save the discovery event so it shows up in event history
                await supabase.from('market_events').upsert({
                    ticker,
                    event_type: `discovery_${catalyst}`,
                    headline: reason,
                    severity: 7,
                    is_overreaction_candidate: true,
                    source_urls: [],
                    source_type: 'ai_discovery'
                } as any, { onConflict: 'ticker,headline', ignoreDuplicates: true });

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

        const summary = `Discovery scan complete: ${discovered.length} tickers found, ${totalSignals} signals generated in ${(duration / 1000).toFixed(1)}s`;
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
