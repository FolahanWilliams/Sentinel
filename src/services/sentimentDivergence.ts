/**
 * Sentinel — Sentiment-Price Divergence Detector
 *
 * Cross-analyzes sentiment trend (from rss_cache + reddit) against price Z-score
 * to identify narrative-price divergences:
 *
 * - "Panic Exhaustion": Price still falling (Z < -2.0) but sentiment improving → bullish
 * - "Euphoria Climax": Price still rising (Z > +2.0) but sentiment deteriorating → bearish
 * - "Rational Adjustment": Sentiment and price aligned → trend likely continues
 *
 * Based on research: sentiment shifts often PRECEDE price reversals by hours/days.
 */

import { supabase } from '@/config/supabase';

export type DivergenceType = 'panic_exhaustion' | 'euphoria_climax' | 'rational' | 'neutral';

export interface SentimentDivergenceResult {
    divergenceType: DivergenceType;
    sentimentAvg: number;         // -1.0 to +1.0 rolling avg
    sentimentTrend: number;       // Change in sentiment over window (positive = improving)
    articleCount: number;         // How many articles contributed
    zScore: number | null;        // Current price Z-score
    confidenceBoost: number;      // Suggested confidence adjustment (-15 to +15)
    summary: string;              // Human-readable explanation
}

export class SentimentDivergenceDetector {

    /**
     * Analyze sentiment-price divergence for a ticker.
     * Queries rss_cache for recent articles mentioning this ticker,
     * computes rolling sentiment, and compares against the price Z-score.
     */
    static async analyze(
        ticker: string,
        zScore: number | null
    ): Promise<SentimentDivergenceResult> {
        const neutral: SentimentDivergenceResult = {
            divergenceType: 'neutral',
            sentimentAvg: 0,
            sentimentTrend: 0,
            articleCount: 0,
            zScore,
            confidenceBoost: 0,
            summary: 'Insufficient sentiment data for divergence analysis.',
        };

        try {
            // Fetch articles mentioning this ticker from the last 5 days.
            // Uses sentinel_articles (populated by the sentinel edge function with Gemini analysis)
            // instead of rss_cache (which never has sentiment_score populated).
            const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

            const { data: articles, error } = await supabase
                .from('sentinel_articles' as any)
                .select('sentiment_score, pub_date, title, entities')
                .not('sentiment_score', 'is', null)
                .gte('pub_date', fiveDaysAgo)
                .or(`title.ilike.%${ticker}%,entities.cs.{${ticker}}`)
                .order('pub_date', { ascending: true }) as any;

            if (error || !articles || articles.length < 3) {
                return neutral;
            }

            // Compute overall average sentiment
            const scores = articles.map(a => a.sentiment_score as number);
            const avgSentiment = scores.reduce((a, b) => a + b, 0) / scores.length;

            // Compute sentiment trend (compare first half vs second half)
            const midpoint = Math.floor(scores.length / 2);
            const firstHalf = scores.slice(0, midpoint);
            const secondHalf = scores.slice(midpoint);
            const firstAvg = firstHalf.length > 0 ? firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length : 0;
            const secondAvg = secondHalf.length > 0 ? secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length : 0;
            const sentimentTrend = secondAvg - firstAvg; // positive = improving

            // Classify divergence
            const result = this.classifyDivergence(
                avgSentiment,
                sentimentTrend,
                zScore,
                articles.length
            );

            return result;
        } catch (err) {
            console.error(`[SentimentDivergence] Error for ${ticker}:`, err);
            return neutral;
        }
    }

    /**
     * Classify the divergence type and compute confidence adjustment.
     */
    private static classifyDivergence(
        sentimentAvg: number,
        sentimentTrend: number,
        zScore: number | null,
        articleCount: number
    ): SentimentDivergenceResult {
        // If no Z-score available, can't detect divergence
        if (zScore === null) {
            return {
                divergenceType: 'neutral',
                sentimentAvg,
                sentimentTrend,
                articleCount,
                zScore,
                confidenceBoost: 0,
                summary: `Sentiment avg: ${sentimentAvg.toFixed(2)}, trend: ${sentimentTrend > 0 ? 'improving' : 'worsening'} (no Z-score for divergence check).`,
            };
        }

        // PANIC EXHAUSTION: Price extremely oversold but sentiment improving
        // This is the highest-conviction bullish divergence
        if (zScore < -2.0 && sentimentTrend > 0.1) {
            const boost = sentimentTrend > 0.3 ? 15 : sentimentTrend > 0.2 ? 10 : 5;
            return {
                divergenceType: 'panic_exhaustion',
                sentimentAvg,
                sentimentTrend,
                articleCount,
                zScore,
                confidenceBoost: boost,
                summary: `PANIC EXHAUSTION: Price is ${Math.abs(zScore).toFixed(1)} std devs below mean but sentiment is improving (+${sentimentTrend.toFixed(2)} trend). Sell-off may be overextended — ${articleCount} articles analyzed.`,
            };
        }

        // EUPHORIA CLIMAX: Price extremely overbought but sentiment deteriorating
        // Bearish divergence — rally losing fundamental support
        if (zScore > 2.0 && sentimentTrend < -0.1) {
            const penalty = sentimentTrend < -0.3 ? -15 : sentimentTrend < -0.2 ? -10 : -5;
            return {
                divergenceType: 'euphoria_climax',
                sentimentAvg,
                sentimentTrend,
                articleCount,
                zScore,
                confidenceBoost: penalty,  // Negative = reduce confidence for longs
                summary: `EUPHORIA CLIMAX: Price is ${zScore.toFixed(1)} std devs above mean but sentiment is deteriorating (${sentimentTrend.toFixed(2)} trend). Rally may be exhausted — ${articleCount} articles analyzed.`,
            };
        }

        // RATIONAL ADJUSTMENT: Price and sentiment aligned — trend continues
        if ((zScore < -1.0 && sentimentAvg < -0.2) || (zScore > 1.0 && sentimentAvg > 0.2)) {
            return {
                divergenceType: 'rational',
                sentimentAvg,
                sentimentTrend,
                articleCount,
                zScore,
                confidenceBoost: 0,
                summary: `Rational: Price (Z=${zScore.toFixed(1)}) and sentiment (${sentimentAvg.toFixed(2)}) are aligned — move appears fundamentally justified. ${articleCount} articles analyzed.`,
            };
        }

        // No significant divergence
        return {
            divergenceType: 'neutral',
            sentimentAvg,
            sentimentTrend,
            articleCount,
            zScore,
            confidenceBoost: 0,
            summary: `Neutral: No significant divergence detected (Z=${zScore.toFixed(1)}, sentiment=${sentimentAvg.toFixed(2)}, trend=${sentimentTrend.toFixed(2)}). ${articleCount} articles analyzed.`,
        };
    }

    /**
     * Format divergence result for injection into agent prompts.
     */
    static formatForPrompt(result: SentimentDivergenceResult): string {
        if (result.articleCount < 3) return '';

        return `
SENTIMENT-PRICE DIVERGENCE ANALYSIS:
- Type: ${result.divergenceType.toUpperCase().replace('_', ' ')}
- Sentiment Avg (5d): ${result.sentimentAvg.toFixed(2)} (-1.0 bearish to +1.0 bullish)
- Sentiment Trend: ${result.sentimentTrend > 0 ? '+' : ''}${result.sentimentTrend.toFixed(2)} (${result.sentimentTrend > 0.1 ? 'improving' : result.sentimentTrend < -0.1 ? 'worsening' : 'stable'})
- Price Z-Score: ${result.zScore !== null ? result.zScore.toFixed(2) : 'N/A'}
- Articles Analyzed: ${result.articleCount}
- ${result.summary}
${result.divergenceType === 'panic_exhaustion' ? 'IMPORTANT: Panic exhaustion is a statistically significant bullish signal — sentiment leads price reversals.' : ''}
${result.divergenceType === 'euphoria_climax' ? 'WARNING: Euphoria climax suggests the rally is losing support — consider tighter stops or reduced position size.' : ''}`;
    }
}
