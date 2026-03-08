/**
 * Sentinel — Retail vs News Sentiment Gap Detector
 *
 * Detects divergences between retail (Reddit/social) sentiment and
 * institutional/news sentiment for a given ticker. When these two camps
 * disagree strongly, it often signals a contrarian opportunity:
 *
 * - Retail Bullish + News Bearish → "Retail Euphoria" — retail chasing, smart money selling
 * - Retail Bearish + News Neutral/Bullish → "Capitulation" — panic selling by retail, reversal candidate
 * - Both Aligned → "Consensus" — no edge from sentiment gap
 *
 * Data sources:
 *   - Reddit (rss_cache with feed_category = 'retail_sentiment')
 *   - Sentinel Intelligence articles (sentinel_articles with sentiment_score)
 *   - RSS news (rss_cache with feed_category != 'retail_sentiment')
 */

import { supabase } from '@/config/supabase';

export type SentimentGapType = 'retail_euphoria' | 'capitulation' | 'consensus' | 'insufficient_data';

export interface RetailVsNewsResult {
    gapType: SentimentGapType;
    retailSentiment: number;       // -1.0 to +1.0
    newsSentiment: number;         // -1.0 to +1.0
    sentimentGap: number;          // Absolute difference
    retailPostCount: number;
    newsArticleCount: number;
    confidenceAdjustment: number;  // -10 to +10
    summary: string;
}

export class RetailVsNewsSentimentDetector {

    /**
     * Analyze the sentiment gap between retail (Reddit) and news for a ticker.
     */
    static async analyze(ticker: string): Promise<RetailVsNewsResult> {
        const neutral: RetailVsNewsResult = {
            gapType: 'insufficient_data',
            retailSentiment: 0,
            newsSentiment: 0,
            sentimentGap: 0,
            retailPostCount: 0,
            newsArticleCount: 0,
            confidenceAdjustment: 0,
            summary: 'Insufficient data for retail vs. news comparison.',
        };

        try {
            const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

            // Fetch retail (Reddit) posts mentioning this ticker
            const { data: retailPosts } = await supabase
                .from('rss_cache')
                .select('sentiment_score')
                .eq('feed_category', 'retail_sentiment')
                .ilike('title', `%${ticker}%`)
                .gte('fetched_at', twoDaysAgo)
                .not('sentiment_score', 'is', null)
                .limit(30);

            // Fetch news articles from sentinel_articles (Gemini-scored)
            const { data: newsArticles } = await supabase
                .from('sentinel_articles' as any)
                .select('sentiment_score')
                .not('sentiment_score', 'is', null)
                .gte('pub_date', twoDaysAgo)
                .or(`affected_tickers.cs.{${ticker}},title.ilike.%${ticker}%`)
                .limit(30) as any;

            const retailScores = (retailPosts || [])
                .map(p => p.sentiment_score)
                .filter((s): s is number => s !== null);
            const newsScores = (newsArticles || [])
                .map((a: any) => a.sentiment_score)
                .filter((s: any): s is number => s !== null);

            // Need minimum data from both sources
            if (retailScores.length < 2 || newsScores.length < 2) {
                return neutral;
            }

            const retailAvg = retailScores.reduce((a: number, b: number) => a + b, 0) / retailScores.length;
            const newsAvg = newsScores.reduce((a: number, b: number) => a + b, 0) / newsScores.length;
            const gap = Math.abs(retailAvg - newsAvg);

            const result = this.classifyGap(retailAvg, newsAvg, gap, retailScores.length, newsScores.length);
            return result;
        } catch (err) {
            console.error(`[RetailVsNews] Error for ${ticker}:`, err);
            return neutral;
        }
    }

    private static classifyGap(
        retailAvg: number,
        newsAvg: number,
        gap: number,
        retailCount: number,
        newsCount: number,
    ): RetailVsNewsResult {
        const base = {
            retailSentiment: retailAvg,
            newsSentiment: newsAvg,
            sentimentGap: gap,
            retailPostCount: retailCount,
            newsArticleCount: newsCount,
        };

        // Threshold for "significant" divergence
        if (gap < 0.3) {
            return {
                ...base,
                gapType: 'consensus',
                confidenceAdjustment: 0,
                summary: `Consensus: Retail (${retailAvg.toFixed(2)}) and news (${newsAvg.toFixed(2)}) sentiment aligned. No contrarian edge.`,
            };
        }

        // Retail Euphoria: Retail bullish but news bearish/neutral
        if (retailAvg > 0.2 && newsAvg < 0) {
            const penalty = gap > 0.6 ? -10 : -5;
            return {
                ...base,
                gapType: 'retail_euphoria',
                confidenceAdjustment: penalty,
                summary: `RETAIL EUPHORIA: Retail sentiment (${retailAvg.toFixed(2)}) is far more bullish than news (${newsAvg.toFixed(2)}). Retail may be over-positioned — risk of mean-reversion.`,
            };
        }

        // Capitulation: Retail bearish but news neutral/bullish
        if (retailAvg < -0.2 && newsAvg > 0) {
            const boost = gap > 0.6 ? 10 : 5;
            return {
                ...base,
                gapType: 'capitulation',
                confidenceAdjustment: boost,
                summary: `CAPITULATION: Retail sentiment (${retailAvg.toFixed(2)}) is bearish while news (${newsAvg.toFixed(2)}) is neutral/bullish. Retail panic may signal a reversal.`,
            };
        }

        // Retail more extreme in same direction
        if (Math.sign(retailAvg) === Math.sign(newsAvg) && Math.abs(retailAvg) > Math.abs(newsAvg) + 0.3) {
            return {
                ...base,
                gapType: 'retail_euphoria',
                confidenceAdjustment: -3,
                summary: `Retail sentiment (${retailAvg.toFixed(2)}) is more extreme than news (${newsAvg.toFixed(2)}) in the same direction. Potential over-extension.`,
            };
        }

        return {
            ...base,
            gapType: 'consensus',
            confidenceAdjustment: 0,
            summary: `Mixed signals: Retail (${retailAvg.toFixed(2)}) vs News (${newsAvg.toFixed(2)}). Gap=${gap.toFixed(2)}.`,
        };
    }

    /**
     * Format for prompt injection.
     */
    static formatForPrompt(result: RetailVsNewsResult): string {
        if (result.gapType === 'insufficient_data') return '';

        return `
RETAIL vs NEWS SENTIMENT GAP:
- Gap Type: ${result.gapType.toUpperCase().replace('_', ' ')}
- Retail Sentiment: ${result.retailSentiment.toFixed(2)} (${result.retailPostCount} posts)
- News Sentiment: ${result.newsSentiment.toFixed(2)} (${result.newsArticleCount} articles)
- Gap Magnitude: ${result.sentimentGap.toFixed(2)}
- ${result.summary}`;
    }
}
