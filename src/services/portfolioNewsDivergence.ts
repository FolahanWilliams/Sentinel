/**
 * PortfolioNewsDivergence — Compares news article sentiment against open position bias.
 *
 * Detects when recent articles conflict with the user's open positions,
 * enabling proactive risk awareness on the portfolio and positions pages.
 */

import type { ProcessedArticle } from '@/types/sentinel';
import type { Position } from '@/hooks/usePortfolio';

export interface PortfolioNewsDivergence {
    ticker: string;
    positionSide: string;
    articleSentiment: 'bullish' | 'bearish';
    articleTitle: string;
    articleId: string;
    severity: 'warning' | 'critical';
    message: string;
}

/**
 * Check for sentiment divergences between news articles and open positions.
 * Returns divergences sorted by severity (critical first).
 */
export function checkPortfolioNewsDivergence(
    articles: ProcessedArticle[],
    openPositions: Position[]
): PortfolioNewsDivergence[] {
    if (!articles.length || !openPositions.length) return [];

    const divergences: PortfolioNewsDivergence[] = [];
    const seen = new Set<string>(); // Deduplicate by ticker

    for (const position of openPositions) {
        const ticker = position.ticker.toUpperCase();
        if (seen.has(ticker)) continue;

        // Find articles mentioning this position's ticker
        const relevantArticles = articles.filter(article => {
            const entitiesMatch = article.entities?.some(e => e.toUpperCase() === ticker);
            const signalsMatch = article.signals?.some(s => s.ticker?.toUpperCase() === ticker);
            return entitiesMatch || signalsMatch;
        });

        for (const article of relevantArticles) {
            if (article.sentiment === 'neutral') continue;

            const isConflicting =
                (article.sentiment === 'bearish' && position.side === 'long') ||
                (article.sentiment === 'bullish' && position.side === 'short');

            if (isConflicting) {
                seen.add(ticker);
                const severity = article.impact === 'high' ? 'critical' : 'warning';
                divergences.push({
                    ticker,
                    positionSide: position.side,
                    articleSentiment: article.sentiment as 'bullish' | 'bearish',
                    articleTitle: article.title,
                    articleId: article.id || article.link,
                    severity,
                    message: `${article.sentiment.charAt(0).toUpperCase() + article.sentiment.slice(1)} news for ${ticker} conflicts with your ${position.side.toUpperCase()} position`,
                });
                break; // One divergence per ticker (most recent article)
            }
        }
    }

    // Sort: critical first
    return divergences.sort((a, b) => {
        if (a.severity === 'critical' && b.severity !== 'critical') return -1;
        if (b.severity === 'critical' && a.severity !== 'critical') return 1;
        return 0;
    });
}
