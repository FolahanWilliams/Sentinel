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
import { AgentService } from './agents';
import { NotificationService } from './notifications';
import { RSSReaderService } from './rssReader';
import { isBudgetExceeded } from '@/utils/costEstimator';

export class ScannerService {

    /**
     * Smart Scan Prioritization — rank tickers by urgency.
     * Higher priority = more recent events + higher win rate + more RSS mentions.
     */
    static async prioritizeTickers(tickers: { ticker: string; sector: string }[]): Promise<{ ticker: string; sector: string; priority: number }[]> {
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

        // Score each ticker
        return tickers.map(t => {
            const events = eventCounts[t.ticker] || 0;
            const rss = rssCounts[t.ticker] || 0;
            const wr = tickerWinRates[t.ticker];
            const winRateBonus = wr ? (wr.wins / wr.total) * 20 : 0;

            const priority = (events * 30) + (rss * 10) + winRateBonus + 10; // base 10 so everyone gets scanned

            return { ...t, priority: Math.round(priority) };
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

            console.log(`[Scanner] Prioritized ${tickers.length} tickers:`, tickersToScan.map(t => `${t.ticker}(${t.priority})`).join(', '));

            // 3. Sync RSS Feeds (Feed the beast)
            await RSSReaderService.syncAllFeeds();

            // 4. Find fresh unparsed articles from the cache
            // In a real flow, we'd only grab articles from the last hour
            const { data: freshArticles } = await supabase
                .from('rss_cache')
                .select('*')
                .order('fetched_at', { ascending: false })
                .limit(20);

            // 5. Extract Events via Gemini Fast-Pass
            if (freshArticles && freshArticles.length > 0) {
                const combinedText = freshArticles.map(a => `${a.title}. ${a.description}`).join(' | ');
                const extraction = await AgentService.extractEventsFromText(combinedText);

                if (extraction.success && extraction.data?.events) {
                    for (const ev of extraction.data.events) {
                        // Only care about events concerning our watchlist
                        if (tickers.includes(ev.ticker)) {
                            eventsFound++;

                            // Save Event to DB
                            const { data: savedEvent } = await supabase.from('market_events').insert({
                                ticker: ev.ticker,
                                event_type: ev.event_type,
                                headline: ev.headline,
                                severity: ev.severity,
                                is_overreaction_candidate: ev.severity >= 7,
                                source_urls: [],
                                source_type: 'rss'
                            } as any).select('id').single();

                            // 6. Trigger Deep Analysis Pipeline if severe
                            if (savedEvent && ev.severity >= 7) {
                                // Fetch live quote for context
                                let quote;
                                try {
                                    quote = await MarketDataService.getQuote(ev.ticker);
                                } catch (e) { /* ignore */ }

                                const priceDrop = quote ? quote.changePercent : -10; // Mocked if api fails

                                // Pipeline A: Overreaction Analysis
                                const analysis = await AgentService.evaluateOverreaction(
                                    ev.ticker,
                                    ev.headline,
                                    "Detailed context missing in demo", // Normally we'd pass the full article body
                                    quote?.price || 100,
                                    priceDrop
                                );

                                if (analysis.success && analysis.data?.is_overreaction && analysis.data.confidence_score > 75) {

                                    // 7. SANITY CHECK (Red Team)
                                    const sanity = await AgentService.runSanityCheck(
                                        ev.ticker,
                                        analysis.data.thesis,
                                        analysis.data.target_price,
                                        analysis.data.stop_loss,
                                        'OVERREACTION_AGENT'
                                    );

                                    if (sanity.success && sanity.data?.passes_sanity_check) {
                                        // 8. WINNER! WE HAVE A SIGNAL.
                                        signalsGenerated++;

                                        await supabase.from('signals').insert({
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
                                        } as any);

                                        // 9. Dispatch Email Notification
                                        await NotificationService.sendSignalAlert(ev.ticker, 'overreaction');
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 10. Update Scan Log
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
                summary: `Scan complete: ${eventsFound} events, ${signalsGenerated} signals.`
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
}
