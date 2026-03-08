/**
 * Sentinel — Cross-Source Signal Validator
 *
 * Computes a composite "signal quality score" by cross-referencing multiple
 * independent data sources. A signal confirmed by 3+ sources (e.g., RSS news,
 * Sentinel intelligence, Reddit retail sentiment, options flow, technical
 * analysis, peer strength) is far more reliable than one supported by a single
 * source.
 *
 * Quality Tiers:
 *   - Platinum (5+ sources): +15 confidence, extremely high conviction
 *   - Gold     (4 sources):  +10 confidence
 *   - Silver   (3 sources):  +5  confidence
 *   - Bronze   (2 sources):  +0  confidence (baseline)
 *   - Unconfirmed (1):       -5  confidence
 *
 * Cross-integration points validated:
 *   1. Sentinel Intelligence (sentinel_articles) — news signals with tickers
 *   2. RSS / Google News (rss_cache) — raw article mentions
 *   3. Reddit Retail Sentiment (rss_cache, feed_category=retail_sentiment)
 *   4. Technical Analysis alignment
 *   5. Options Flow institutional positioning
 *   6. Peer Relative Strength (idiosyncratic move)
 *   7. Sector Rotation regime alignment
 *   8. Sentiment-Price Divergence
 */

import { supabase } from '@/config/supabase';
import type { TAAlignment, ConfluenceLevel } from '@/types/signals';
import type { SentimentDivergenceResult } from './sentimentDivergence';
import type { SectorRotationSnapshot } from './sectorRotation';

export type QualityTier = 'platinum' | 'gold' | 'silver' | 'bronze' | 'unconfirmed';

export interface SourceConfirmation {
    source: string;
    confirmed: boolean;
    detail: string;
}

export interface CrossSourceResult {
    qualityTier: QualityTier;
    qualityScore: number;            // 0-100 composite score
    confirmedSources: number;
    totalSources: number;
    confidenceAdjustment: number;    // -5 to +15
    sources: SourceConfirmation[];
    summary: string;
}

// Sector mapping: which watchlist sectors correspond to which sector ETF categories
const SECTOR_TO_ROTATION_CATEGORY: Record<string, 'Growth' | 'Defensive' | 'Cyclical'> = {
    'Technology': 'Growth',
    'Semiconductors': 'Growth',
    'AI/Cloud': 'Growth',
    'Cybersecurity': 'Growth',
    'Fintech': 'Growth',
    'Biotech': 'Defensive',
    'Healthcare': 'Defensive',
    'Energy': 'Cyclical',
    'Industrial': 'Cyclical',
    'Consumer': 'Cyclical',
};

export class CrossSourceValidator {

    /**
     * Validate a signal candidate against all available data sources.
     * Call this AFTER individual enrichment steps (TA, options, peers, etc.)
     * but BEFORE the final confidence threshold check.
     */
    static async validate(
        ticker: string,
        direction: 'long' | 'short',
        sector: string,
        taAlignment: TAAlignment | null,
        confluenceLevel: ConfluenceLevel | null,
        optionsFlowSentiment: string | null,
        peerIsIdiosyncratic: boolean | null,
        divergenceResult: SentimentDivergenceResult | null,
        rotationSnapshot: SectorRotationSnapshot | null,
    ): Promise<CrossSourceResult> {
        const sources: SourceConfirmation[] = [];

        // 1. Sentinel Intelligence — check for matching signals in sentinel_articles
        const sentinelConfirm = await this.checkSentinelIntelligence(ticker, direction);
        sources.push(sentinelConfirm);

        // 2. RSS / Google News — check for recent article mentions
        const rssConfirm = await this.checkRSSMentions(ticker);
        sources.push(rssConfirm);

        // 3. Reddit Retail Sentiment — check if retail agrees
        const retailConfirm = await this.checkRetailSentiment(ticker, direction);
        sources.push(retailConfirm);

        // 4. Technical Analysis alignment
        sources.push(this.checkTechnicalAlignment(taAlignment, confluenceLevel, direction));

        // 5. Options Flow
        sources.push(this.checkOptionsFlow(optionsFlowSentiment, direction));

        // 6. Peer Relative Strength
        sources.push(this.checkPeerStrength(peerIsIdiosyncratic, direction));

        // 7. Sector Rotation regime
        sources.push(this.checkSectorRotation(sector, direction, rotationSnapshot));

        // 8. Sentiment-Price Divergence
        sources.push(this.checkSentimentDivergence(divergenceResult, direction));

        // Compute composite
        const confirmed = sources.filter(s => s.confirmed).length;
        const total = sources.length;

        let tier: QualityTier;
        let adjustment: number;

        if (confirmed >= 5) {
            tier = 'platinum';
            adjustment = 15;
        } else if (confirmed === 4) {
            tier = 'gold';
            adjustment = 10;
        } else if (confirmed === 3) {
            tier = 'silver';
            adjustment = 5;
        } else if (confirmed === 2) {
            tier = 'bronze';
            adjustment = 0;
        } else {
            tier = 'unconfirmed';
            adjustment = -5;
        }

        // Quality score: base 30 + 10 per confirmation (max 100)
        const qualityScore = Math.min(100, 30 + (confirmed * 10));

        const confirmedNames = sources.filter(s => s.confirmed).map(s => s.source);
        const summary = confirmed >= 3
            ? `${tier.toUpperCase()} signal: ${confirmed}/${total} sources confirm (${confirmedNames.join(', ')})`
            : `${tier.toUpperCase()}: Only ${confirmed}/${total} sources confirm. Proceed with caution.`;

        return {
            qualityTier: tier,
            qualityScore,
            confirmedSources: confirmed,
            totalSources: total,
            confidenceAdjustment: adjustment,
            sources,
            summary,
        };
    }

    // ── Source Checks ──

    private static async checkSentinelIntelligence(
        ticker: string,
        direction: 'long' | 'short',
    ): Promise<SourceConfirmation> {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: articles } = await supabase
                .from('sentinel_articles' as any)
                .select('signals, sentiment')
                .gte('processed_at', oneDayAgo)
                .or(`affected_tickers.cs.{${ticker}},title.ilike.%${ticker}%`)
                .limit(10) as any;

            if (!articles || articles.length === 0) {
                return { source: 'Sentinel Intelligence', confirmed: false, detail: 'No recent intelligence articles mention this ticker.' };
            }

            // Check if any article signal matches our direction
            let matchingDirection = false;
            for (const article of articles) {
                const signals = Array.isArray(article.signals) ? article.signals : [];
                for (const sig of signals as Array<{ ticker?: string; direction?: string }>) {
                    if (sig.ticker?.toUpperCase() === ticker.toUpperCase()) {
                        const sigDir = sig.direction?.toLowerCase();
                        if ((direction === 'long' && sigDir === 'up') || (direction === 'short' && sigDir === 'down')) {
                            matchingDirection = true;
                        }
                    }
                }
                // Also check sentiment alignment
                if (article.sentiment) {
                    if ((direction === 'long' && article.sentiment === 'bullish') ||
                        (direction === 'short' && article.sentiment === 'bearish')) {
                        matchingDirection = true;
                    }
                }
            }

            return {
                source: 'Sentinel Intelligence',
                confirmed: matchingDirection,
                detail: matchingDirection
                    ? `${articles.length} intelligence article(s) confirm ${direction} thesis.`
                    : `${articles.length} article(s) found but direction doesn't match.`,
            };
        } catch {
            return { source: 'Sentinel Intelligence', confirmed: false, detail: 'Lookup failed.' };
        }
    }

    private static async checkRSSMentions(ticker: string): Promise<SourceConfirmation> {
        try {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const { data: articles, count } = await supabase
                .from('rss_cache')
                .select('id', { count: 'exact', head: true })
                .ilike('title', `%${ticker}%`)
                .gte('fetched_at', oneDayAgo);

            const total = count ?? articles?.length ?? 0;
            // Need 2+ independent RSS mentions to confirm
            return {
                source: 'RSS / News',
                confirmed: total >= 2,
                detail: total >= 2
                    ? `${total} RSS/news articles mention ${ticker} in the last 24h.`
                    : `Only ${total} RSS mention(s) — insufficient for confirmation.`,
            };
        } catch {
            return { source: 'RSS / News', confirmed: false, detail: 'RSS lookup failed.' };
        }
    }

    private static async checkRetailSentiment(
        ticker: string,
        direction: 'long' | 'short',
    ): Promise<SourceConfirmation> {
        try {
            const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            const { data: posts } = await supabase
                .from('rss_cache')
                .select('sentiment_score')
                .eq('feed_category', 'retail_sentiment')
                .ilike('title', `%${ticker}%`)
                .gte('fetched_at', twoDaysAgo)
                .not('sentiment_score', 'is', null)
                .limit(20);

            if (!posts || posts.length < 2) {
                return { source: 'Reddit Retail', confirmed: false, detail: 'Insufficient Reddit data.' };
            }

            const avgSentiment = posts.reduce((sum, p) => sum + (p.sentiment_score ?? 0), 0) / posts.length;
            const retailBullish = avgSentiment > 0.2;
            const retailBearish = avgSentiment < -0.2;

            const confirmed = (direction === 'long' && retailBullish) || (direction === 'short' && retailBearish);

            return {
                source: 'Reddit Retail',
                confirmed,
                detail: `Retail sentiment: ${avgSentiment.toFixed(2)} (${posts.length} posts). ${confirmed ? 'Aligned' : 'Divergent'} with ${direction} thesis.`,
            };
        } catch {
            return { source: 'Reddit Retail', confirmed: false, detail: 'Reddit lookup failed.' };
        }
    }

    private static checkTechnicalAlignment(
        taAlignment: TAAlignment | null,
        confluenceLevel: ConfluenceLevel | null,
        _direction: 'long' | 'short',
    ): SourceConfirmation {
        if (!taAlignment || taAlignment === 'unavailable') {
            return { source: 'Technical Analysis', confirmed: false, detail: 'TA data unavailable.' };
        }

        const confirmed = taAlignment === 'confirmed' || (taAlignment === 'partial' && confluenceLevel !== 'none');
        return {
            source: 'Technical Analysis',
            confirmed,
            detail: `TA alignment: ${taAlignment}, confluence: ${confluenceLevel || 'unknown'}.`,
        };
    }

    private static checkOptionsFlow(
        optionsSentiment: string | null,
        direction: 'long' | 'short',
    ): SourceConfirmation {
        if (!optionsSentiment) {
            return { source: 'Options Flow', confirmed: false, detail: 'No options data.' };
        }

        const confirmed = (direction === 'long' && optionsSentiment === 'bullish') ||
            (direction === 'short' && optionsSentiment === 'bearish');

        return {
            source: 'Options Flow',
            confirmed,
            detail: `Institutional options flow: ${optionsSentiment}. ${confirmed ? 'Confirms' : 'Contradicts'} ${direction} thesis.`,
        };
    }

    private static checkPeerStrength(
        isIdiosyncratic: boolean | null,
        direction: 'long' | 'short',
    ): SourceConfirmation {
        if (isIdiosyncratic === null) {
            return { source: 'Peer Strength', confirmed: false, detail: 'No peer data.' };
        }

        // For long overreaction: idiosyncratic drop is BETTER (stock-specific, not sector-wide)
        const confirmed = direction === 'long' ? isIdiosyncratic : !isIdiosyncratic;
        return {
            source: 'Peer Strength',
            confirmed,
            detail: isIdiosyncratic
                ? 'Move is idiosyncratic (stock-specific, not sector-wide).'
                : 'Move is sector-wide — less likely to be an overreaction.',
        };
    }

    private static checkSectorRotation(
        sector: string,
        direction: 'long' | 'short',
        snapshot: SectorRotationSnapshot | null,
    ): SourceConfirmation {
        if (!snapshot || snapshot.sectorRankings.length === 0) {
            return { source: 'Sector Rotation', confirmed: false, detail: 'No sector rotation data.' };
        }

        const category = SECTOR_TO_ROTATION_CATEGORY[sector];
        if (!category) {
            return { source: 'Sector Rotation', confirmed: false, detail: `Unknown sector mapping for "${sector}".` };
        }

        // For long: risk_on regime + Growth sector = confirmed
        // For long: risk_off regime + Growth sector = NOT confirmed (headwind)
        let confirmed = false;
        let detail = '';

        if (direction === 'long') {
            if (snapshot.regime === 'risk_on' && category === 'Growth') {
                confirmed = true;
                detail = 'Risk-on regime with Growth leadership supports long thesis.';
            } else if (snapshot.regime === 'risk_off' && category === 'Defensive') {
                confirmed = true;
                detail = 'Risk-off regime with Defensive sector supports defensive long.';
            } else if (snapshot.regime === 'risk_off' && category === 'Growth') {
                confirmed = false;
                detail = 'Risk-off regime — Growth sector faces headwinds for long entry.';
            } else {
                confirmed = snapshot.regime === 'neutral';
                detail = `Sector rotation: ${snapshot.regime}. ${category} sector in neutral posture.`;
            }
        } else {
            if (snapshot.regime === 'risk_off' && category === 'Growth') {
                confirmed = true;
                detail = 'Risk-off regime supports short thesis on Growth sector.';
            } else {
                confirmed = false;
                detail = `Sector rotation: ${snapshot.regime}. Not ideal for short on ${category}.`;
            }
        }

        return { source: 'Sector Rotation', confirmed, detail };
    }

    private static checkSentimentDivergence(
        divergence: SentimentDivergenceResult | null,
        direction: 'long' | 'short',
    ): SourceConfirmation {
        if (!divergence || divergence.divergenceType === 'neutral') {
            return { source: 'Sentiment Divergence', confirmed: false, detail: 'No significant divergence.' };
        }

        const confirmed =
            (direction === 'long' && divergence.divergenceType === 'panic_exhaustion') ||
            (direction === 'short' && divergence.divergenceType === 'euphoria_climax');

        return {
            source: 'Sentiment Divergence',
            confirmed,
            detail: `${divergence.divergenceType.replace('_', ' ')}: ${divergence.summary.slice(0, 100)}`,
        };
    }

    /**
     * Format for agent prompt injection.
     */
    static formatForPrompt(result: CrossSourceResult): string {
        if (result.confirmedSources === 0) return '';

        const lines = [
            '',
            'CROSS-SOURCE VALIDATION:',
            `- Quality Tier: ${result.qualityTier.toUpperCase()} (${result.confirmedSources}/${result.totalSources} sources)`,
            `- Quality Score: ${result.qualityScore}/100`,
            `- Confidence Adjustment: ${result.confidenceAdjustment > 0 ? '+' : ''}${result.confidenceAdjustment}`,
            '- Source Breakdown:',
        ];

        for (const src of result.sources) {
            lines.push(`    ${src.confirmed ? '✓' : '✗'} ${src.source}: ${src.detail}`);
        }

        return lines.join('\n');
    }
}
