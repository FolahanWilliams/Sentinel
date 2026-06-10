/**
 * Sentinel — Beneficial Pattern Detector
 *
 * Counterbalances Sentinel's 18+ penalty stages by recognizing positive
 * compound patterns that indicate high-quality setups. Recognizes when
 * aligned positives compound (mirrors the underlying framework's pattern module).
 *
 * When multiple positive signals align, the setup is genuinely stronger
 * than the sum of its parts — this detector awards a capped boost.
 *
 * Pure deterministic logic — no Gemini call (fast, free).
 */

import { BENEFICIAL_PATTERN_MAX_BOOST, NOISE_JUDGE_CONVERGENCE_THRESHOLD } from '@/config/constants';
import type { BeneficialPattern, BeneficialPatternResult } from '@/types/agents';

// ── Context for pattern detection ───────────────────────────────────────────

export interface BeneficialContext {
    fearGreedScore?: number;
    moatRating?: number | null;
    noiseStdDev?: number | null;
    mtfAlignedCount?: number;
    mtfTotalChecked?: number;
    volumeRatio?: number | null;
    isSectorRotationFavored?: boolean;
    optionsFlowSentiment?: string | null;
    peerIsIdiosyncratic?: boolean;
    priceCorrelationMax?: number;
    convictionScore?: number | null;
    rpdHistoricalWinRate?: number | null;
    rpdSufficientData?: boolean;
    biasFree?: boolean;
}

// ── Pattern Definitions ─────────────────────────────────────────────────────

interface PatternDef {
    name: string;
    boost: number;
    check: (ctx: BeneficialContext) => string[] | null; // returns conditions_met or null if not matched
}

const BENEFICIAL_PATTERNS: PatternDef[] = [
    {
        name: 'Contrarian Value',
        boost: 4,
        check: (ctx) => {
            const conditions: string[] = [];
            if (ctx.fearGreedScore !== undefined && ctx.fearGreedScore <= 30) {
                conditions.push(`Fear & Greed at ${ctx.fearGreedScore} (extreme fear)`);
            } else return null;

            if (ctx.moatRating && ctx.moatRating >= 7) {
                conditions.push(`Strong moat (${ctx.moatRating}/10)`);
            } else return null;

            if (ctx.noiseStdDev !== null && ctx.noiseStdDev !== undefined && ctx.noiseStdDev < NOISE_JUDGE_CONVERGENCE_THRESHOLD) {
                conditions.push(`Low noise (std_dev ${ctx.noiseStdDev.toFixed(1)})`);
            } else return null;

            return conditions;
        },
    },
    {
        name: 'Momentum Confluence',
        boost: 3,
        check: (ctx) => {
            const conditions: string[] = [];
            if (ctx.mtfAlignedCount && ctx.mtfTotalChecked && ctx.mtfAlignedCount === ctx.mtfTotalChecked && ctx.mtfTotalChecked === 3) {
                conditions.push('3/3 multi-timeframe alignment');
            } else return null;

            if (ctx.volumeRatio && ctx.volumeRatio > 1.5) {
                conditions.push(`Volume confirmation (${ctx.volumeRatio.toFixed(1)}x avg)`);
            } else return null;

            if (ctx.isSectorRotationFavored) {
                conditions.push('Sector rotation tailwind');
            } else return null;

            return conditions;
        },
    },
    {
        name: 'Smart Money Signal',
        boost: 3,
        check: (ctx) => {
            const conditions: string[] = [];
            if (ctx.optionsFlowSentiment === 'bullish') {
                conditions.push('Bullish options flow');
            } else return null;

            if (ctx.peerIsIdiosyncratic) {
                conditions.push('Idiosyncratic move (not sector-wide)');
            } else return null;

            if (ctx.priceCorrelationMax !== undefined && ctx.priceCorrelationMax < 0.7) {
                conditions.push(`Low portfolio correlation (max ${ctx.priceCorrelationMax.toFixed(2)})`);
            } else return null;

            return conditions;
        },
    },
    {
        name: 'Quality Conviction',
        boost: 4,
        check: (ctx) => {
            const conditions: string[] = [];
            if (ctx.convictionScore && ctx.convictionScore >= 85) {
                conditions.push(`High conviction (${ctx.convictionScore}/100)`);
            } else return null;

            if (ctx.rpdSufficientData && ctx.rpdHistoricalWinRate && ctx.rpdHistoricalWinRate > 60) {
                conditions.push(`Strong RPD pattern (${ctx.rpdHistoricalWinRate}% historical WR)`);
            } else return null;

            if (ctx.biasFree) {
                conditions.push('Bias-free thesis');
            } else return null;

            return conditions;
        },
    },
];

// ── Public API ──────────────────────────────────────────────────────────────

export class BeneficialPatternDetector {

    /**
     * Detect beneficial compound patterns from aggregated pipeline context.
     */
    static detect(context: BeneficialContext): BeneficialPatternResult {
        const detected: BeneficialPattern[] = [];

        for (const pattern of BENEFICIAL_PATTERNS) {
            const conditions = pattern.check(context);
            if (conditions) {
                detected.push({
                    name: pattern.name,
                    conditions_met: conditions,
                    boost: pattern.boost,
                });
            }
        }

        // Cap total boost
        const rawBoost = detected.reduce((sum, p) => sum + p.boost, 0);
        const totalBoost = Math.min(rawBoost, BENEFICIAL_PATTERN_MAX_BOOST);

        const summary = detected.length > 0
            ? `Beneficial patterns: ${detected.map(p => p.name).join(', ')} (+${totalBoost})`
            : 'No beneficial compound patterns detected';

        return {
            patterns_detected: detected,
            total_boost: totalBoost,
            summary,
        };
    }
}
