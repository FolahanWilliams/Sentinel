/**
 * Sentinel — Index Rebalance Watch (service)
 *
 * Systematizes the "index effect" swing edge. Discovery (which stocks, which
 * index, effective date) is populated by the `index-rebalance` Edge Function via
 * grounded search; this service reads those events and produces a per-event
 * entry plan + recommendation from live data via the pure analyzer.
 */
import { supabase } from '@/config/supabase';
import { MarketDataService } from './marketData';
import { analyzeRebalance, type RebalanceAnalysis } from './indexRebalanceAnalysis';

export type { RebalanceAnalysis, RebalanceRecommendation } from './indexRebalanceAnalysis';

export interface IndexRebalanceEvent {
    id: string;
    ticker: string;
    company_name: string | null;
    index_name: string;
    action: 'add' | 'remove';
    announcement_date: string | null;
    effective_date: string | null;
    source_url: string | null;
    rationale: string | null;
    status: 'upcoming' | 'effective' | 'passed';
    analysis: RebalanceAnalysis | null;
    signal_id: string | null;
    created_at: string;
    updated_at: string;
}

// The generated Database type doesn't include this table yet; query via a
// loosely-typed handle and map to the local IndexRebalanceEvent interface.
const table = () => (supabase as unknown as { from: (t: string) => any }).from('index_rebalance_events');

export class IndexRebalanceService {
    /** Trigger server-side grounded-search discovery (also runs daily via cron). */
    static async refresh(): Promise<{ discovered: number; upserted: number } | null> {
        try {
            const { data, error } = await supabase.functions.invoke('index-rebalance');
            if (error) {
                console.warn('[IndexRebalance] refresh failed:', error.message);
                return null;
            }
            return { discovered: data?.discovered ?? 0, upserted: data?.upserted ?? 0 };
        } catch (e) {
            console.warn('[IndexRebalance] refresh error:', e);
            return null;
        }
    }

    /** Upcoming + just-effective events, soonest effective date first. */
    static async getUpcoming(): Promise<IndexRebalanceEvent[]> {
        try {
            const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
            const { data, error } = await table()
                .select('*')
                .gte('effective_date', cutoff)
                .order('effective_date', { ascending: true })
                .limit(50);
            if (error) {
                console.warn('[IndexRebalance] getUpcoming failed:', error.message);
                return [];
            }
            return (data ?? []) as IndexRebalanceEvent[];
        } catch (e) {
            console.warn('[IndexRebalance] getUpcoming error:', e);
            return [];
        }
    }

    /** Research one event: pull quote + reference price, analyze, persist. */
    static async analyzeAndPersist(event: IndexRebalanceEvent): Promise<RebalanceAnalysis | null> {
        if (!event.effective_date) return null;
        try {
            const quote = await MarketDataService.getQuote(event.ticker);
            if (!quote?.price) return null;

            let refPrice: number | null = null;
            if (event.announcement_date) {
                try {
                    refPrice = await MarketDataService.getHistoricalPriceAtDate(event.ticker, event.announcement_date);
                } catch (e) {
                    console.warn(`[IndexRebalance] reference price failed for ${event.ticker}:`, e);
                }
            }

            const analysis = analyzeRebalance({
                action: event.action,
                ticker: event.ticker,
                indexName: event.index_name,
                effectiveDate: event.effective_date,
                currentPrice: quote.price,
                refPrice,
                atr: null, // TA enrichment (real ATR/RSI/SMA) is a clean follow-up
                rsi14: null,
                sma50: null,
                trendBullish: null,
            });

            await table().update({ analysis }).eq('id', event.id);
            return analysis;
        } catch (e) {
            console.warn(`[IndexRebalance] analyze failed for ${event.ticker}:`, e);
            return null;
        }
    }
}
