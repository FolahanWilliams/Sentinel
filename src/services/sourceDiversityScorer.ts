/**
 * Sentinel — Source Diversity Scorer
 *
 * Scores the quality and diversity of news sources supporting a signal.
 * A signal backed by a single tabloid article is far weaker than one confirmed
 * by Bloomberg, SEC filings, and two independent analysts.
 *
 * Tier system:
 *   Tier 1 (3 pts) — Institutional / primary sources: Bloomberg, Reuters, WSJ,
 *                    FT, SEC filings, official company press releases, CNBC,
 *                    AP, MarketWatch (Dow Jones), Barron's.
 *   Tier 2 (2 pts) — Established financial media: Seeking Alpha (verified),
 *                    The Motley Fool, Investopedia, Forbes, Business Insider,
 *                    Yahoo Finance, Benzinga, TheStreet, Zacks.
 *   Tier 3 (1 pt)  — Other financial / general news: all remaining sources
 *                    (blogs, RSS aggregators, unknown sources).
 *
 * Gate rules:
 *   - High-confidence signals (> SINGLE_SOURCE_CAP) with diversity score < MIN_HIGH_CONF_POINTS
 *     have their confidence capped at SINGLE_SOURCE_CAP.
 *   - Single-source signals are always capped at SINGLE_SOURCE_CAP regardless of confidence.
 *   - Signals with 0 identifiable sources (pure AI-generated, no news backing) receive
 *     a -5 penalty.
 *
 * The diversity score is stored in agent_outputs.source_diversity so the learning loop
 * can eventually tune per-tier weights from outcome data.
 */

// ── Constants ───────────────────────────────────────────────────────────────

/** Confidence cap for signals backed by a single source or <MIN_HIGH_CONF_POINTS */
export const SINGLE_SOURCE_CAP = 65;

/** Minimum diversity points required to allow confidence above SINGLE_SOURCE_CAP */
export const MIN_HIGH_CONF_POINTS = 5;

/** Confidence penalty when no identifiable news source backs the signal */
export const NO_SOURCE_PENALTY = -5;

// ── Tier lists ──────────────────────────────────────────────────────────────

const TIER_1_SOURCES = [
    'bloomberg', 'reuters', 'wall street journal', 'wsj', 'financial times',
    'ft.com', 'sec.gov', 'sec filing', 'press release', 'ir.', 'investor relations',
    'cnbc', 'associated press', 'ap news', 'marketwatch', "barron's", 'barrons',
    'dow jones',
];

const TIER_2_SOURCES = [
    'seeking alpha', 'seekingalpha', 'motley fool', 'fool.com', 'investopedia',
    'forbes', 'business insider', 'businessinsider', 'yahoo finance', 'finance.yahoo',
    'benzinga', 'thestreet', 'zacks', 'morningstar',
];

// ── Types ───────────────────────────────────────────────────────────────────

export interface SourceDiversityResult {
    /** Sum of tier points across all unique sources */
    diversityScore: number;
    /** Number of distinct sources identified */
    sourceCount: number;
    /** Tier breakdown for logging/display */
    tier1Count: number;
    tier2Count: number;
    tier3Count: number;
    /** Whether diversity gate was applied (confidence was capped) */
    capApplied: boolean;
    /** Confidence penalty/cap applied (negative means cap was hit) */
    confidenceAdjustment: number;
    /** Human-readable summary */
    summary: string;
}

// ── SourceDiversityScorer ───────────────────────────────────────────────────

export class SourceDiversityScorer {

    /**
     * Score a list of source strings and determine if the confidence should be capped.
     *
     * @param sources   Array of source strings (URLs, publication names, rss feed names)
     * @param currentConfidence  The signal's current confidence score (0-100)
     */
    static score(
        sources: string[],
        currentConfidence: number,
    ): SourceDiversityResult {
        const normalised = sources.map(s => s.toLowerCase().trim());

        let diversityScore = 0;
        let tier1Count = 0;
        let tier2Count = 0;
        let tier3Count = 0;

        // Deduplicate sources before scoring — same publication across multiple URLs = 1 source
        const seenPublications = new Set<string>();

        for (const src of normalised) {
            // Identify publication
            const publication = this.extractPublication(src);
            if (seenPublications.has(publication)) continue; // dedup
            seenPublications.add(publication);

            const tier = this.getTier(src);
            if (tier === 1) {
                diversityScore += 3;
                tier1Count++;
            } else if (tier === 2) {
                diversityScore += 2;
                tier2Count++;
            } else {
                diversityScore += 1;
                tier3Count++;
            }
        }

        const sourceCount = tier1Count + tier2Count + tier3Count;
        let confidenceAdjustment = 0;
        let capApplied = false;
        let summary = '';

        if (sourceCount === 0) {
            // No identifiable news source — small penalty
            confidenceAdjustment = NO_SOURCE_PENALTY;
            summary = 'No identifiable news source. Confidence penalised.';
        } else if (sourceCount === 1 && currentConfidence > SINGLE_SOURCE_CAP) {
            // Single source: hard cap
            confidenceAdjustment = SINGLE_SOURCE_CAP - currentConfidence; // negative value = cap
            capApplied = true;
            summary = `Single source only — confidence capped at ${SINGLE_SOURCE_CAP}.`;
        } else if (diversityScore < MIN_HIGH_CONF_POINTS && currentConfidence > SINGLE_SOURCE_CAP) {
            // Low diversity score: cap at SINGLE_SOURCE_CAP
            confidenceAdjustment = SINGLE_SOURCE_CAP - currentConfidence;
            capApplied = true;
            summary = `Low source diversity (${diversityScore} pts, need ${MIN_HIGH_CONF_POINTS}) — confidence capped at ${SINGLE_SOURCE_CAP}.`;
        } else {
            summary = `${sourceCount} source(s), diversity score ${diversityScore} pts (T1:${tier1Count} T2:${tier2Count} T3:${tier3Count}). Gate passed.`;
        }

        return {
            diversityScore,
            sourceCount,
            tier1Count,
            tier2Count,
            tier3Count,
            capApplied,
            confidenceAdjustment,
            summary,
        };
    }

    /**
     * Apply the diversity gate to a confidence score in-place.
     * Returns the adjusted confidence (clamped to [0, 100]).
     */
    static applyGate(
        sources: string[],
        currentConfidence: number,
    ): { adjustedConfidence: number; result: SourceDiversityResult } {
        const result = this.score(sources, currentConfidence);
        const adjustedConfidence = Math.max(0, Math.min(100, currentConfidence + result.confidenceAdjustment));
        return { adjustedConfidence, result };
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private static getTier(source: string): 1 | 2 | 3 {
        for (const t1 of TIER_1_SOURCES) {
            if (source.includes(t1)) return 1;
        }
        for (const t2 of TIER_2_SOURCES) {
            if (source.includes(t2)) return 2;
        }
        return 3;
    }

    /**
     * Extract a canonical publication identifier from a source string.
     * Used to deduplicate: two bloomberg.com URLs count as ONE source.
     */
    private static extractPublication(source: string): string {
        // Try to extract domain from URL
        const domainMatch = source.match(/(?:https?:\/\/)?(?:www\.)?([^/\s?#]+)/);
        if (domainMatch) return domainMatch[1]!;
        // Fallback: normalise whitespace and return as-is
        return source.replace(/\s+/g, '_');
    }

    /**
     * Format the result for agent prompt injection.
     */
    static formatForPrompt(result: SourceDiversityResult): string {
        if (result.sourceCount === 0) return '';
        return `\nSOURCE DIVERSITY: ${result.summary}`;
    }
}
