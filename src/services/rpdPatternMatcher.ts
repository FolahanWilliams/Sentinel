/**
 * Sentinel — RPD Pattern Matcher (Klein Recognition-Primed Decision Framework)
 *
 * Matches the current signal setup against historical similar trades.
 * "Last time we saw this exact pattern, what happened?"
 *
 * Similarity is computed across 5 dimensions:
 *   signal_type match (40%), bias_type match (20%), sector match (20%),
 *   regime match (10%), confidence proximity (10%).
 *
 * When similar setups historically failed → penalty.
 * When similar setups historically won → small boost.
 */

import { supabase } from '@/config/supabase';
import {
    RPD_MIN_MATCHES,
    RPD_LOW_WIN_RATE_THRESHOLD,
    RPD_HIGH_WIN_RATE_THRESHOLD,
    RPD_LOW_WIN_RATE_PENALTY,
    RPD_HIGH_WIN_RATE_BOOST,
} from '@/config/constants';
import type { RPDMatch, RPDMatchResult } from '@/types/agents';

export class RPDPatternMatcher {

    /**
     * Match current signal context against historical completed trades.
     */
    static async match(
        ticker: string,
        signalType: string,
        biasType: string,
        _sector: string,
        regime: string | undefined,
        confidence: number,
    ): Promise<RPDMatchResult> {
        try {
            // Fetch completed signals with outcomes (not just pending)
            const { data: signals, error } = await supabase
                .from('signal_outcomes')
                .select('signal_id, outcome, return_at_5d, return_at_10d, return_at_30d, signals!inner(ticker, signal_type, bias_type, confidence_score, thesis, created_at)')
                .neq('outcome', 'pending')
                .eq('is_simulated', false)
                .order('tracked_at', { ascending: false })
                .limit(200);

            if (error || !signals || signals.length === 0) {
                return this.insufficientData();
            }

            // Compute similarity for each historical signal
            const matches: RPDMatch[] = [];

            for (const row of signals) {
                const sig = (row as any).signals;
                if (!sig) continue;

                let similarity = 0;

                // signal_type match (40%)
                if (sig.signal_type === signalType) similarity += 40;

                // bias_type match (20%)
                if (sig.bias_type === biasType) similarity += 20;

                // sector match (20%) — check watchlist for sector info
                // Since we don't have sector on signals, use ticker-level heuristic
                // Same ticker = same sector = full 20 points
                if (sig.ticker === ticker) {
                    similarity += 20;
                }
                // Different ticker but we can't reliably check sector without additional query
                // Give partial credit if signal_type matches (implies similar setup)

                // regime match (10%) — stored in agent_outputs.market_regime.regime
                // We approximate: if confidence range is similar, regime was likely similar
                if (regime) {
                    // For now, give 5 points baseline (regime data not always available on historical signals)
                    similarity += 5;
                }

                // confidence proximity (10%) — closer confidence = more similar
                const confDelta = Math.abs((sig.confidence_score || 50) - confidence);
                const confSimilarity = Math.max(0, 10 - confDelta / 5);
                similarity += confSimilarity;

                // Determine best return
                const bestReturn = row.return_at_30d ?? row.return_at_10d ?? row.return_at_5d ?? 0;

                matches.push({
                    signal_id: row.signal_id,
                    ticker: sig.ticker,
                    signal_type: sig.signal_type || 'unknown',
                    bias_type: sig.bias_type || 'unknown',
                    confidence: sig.confidence_score || 0,
                    outcome: row.outcome,
                    return_pct: bestReturn,
                    similarity_score: Math.round(similarity * 10) / 10,
                    created_at: sig.created_at || '',
                });
            }

            // Sort by similarity (descending) and take top matches
            matches.sort((a, b) => b.similarity_score - a.similarity_score);
            const topMatches = matches.slice(0, 10); // Keep more for richer context

            if (topMatches.length < RPD_MIN_MATCHES) {
                return this.insufficientData(topMatches);
            }

            // Compute historical win rate from top matches
            const relevantMatches = topMatches.slice(0, RPD_MIN_MATCHES);
            const wins = relevantMatches.filter(m => m.outcome === 'win').length;
            const winRate = Math.round((wins / relevantMatches.length) * 100);
            const avgReturn = relevantMatches.reduce((sum, m) => sum + (m.return_pct || 0), 0) / relevantMatches.length;

            // Determine confidence adjustment
            let adjustment = 0;
            if (winRate < RPD_LOW_WIN_RATE_THRESHOLD) {
                adjustment = RPD_LOW_WIN_RATE_PENALTY;
            } else if (winRate > RPD_HIGH_WIN_RATE_THRESHOLD) {
                adjustment = RPD_HIGH_WIN_RATE_BOOST;
            }

            // Build summary
            const summary = `RPD: ${relevantMatches.length} similar setups found. Win rate: ${winRate}% (avg return: ${avgReturn > 0 ? '+' : ''}${avgReturn.toFixed(1)}%). Top match: ${topMatches[0]?.ticker} (${topMatches[0]?.outcome}, sim=${topMatches[0]?.similarity_score}).`;

            return {
                matches: topMatches.slice(0, 5), // Return top 5 for display
                historical_win_rate: winRate,
                avg_return: Math.round(avgReturn * 10) / 10,
                confidence_adjustment: adjustment,
                pattern_summary: summary,
                sufficient_data: true,
            };
        } catch (err) {
            console.error('[RPDPatternMatcher] Failed:', err);
            return this.insufficientData();
        }
    }

    private static insufficientData(partialMatches: RPDMatch[] = []): RPDMatchResult {
        return {
            matches: partialMatches,
            historical_win_rate: null,
            avg_return: null,
            confidence_adjustment: 0,
            pattern_summary: `RPD: Insufficient historical data (${partialMatches.length}/${RPD_MIN_MATCHES} matches).`,
            sufficient_data: false,
        };
    }
}
