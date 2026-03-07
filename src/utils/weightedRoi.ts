/**
 * Sentinel — Weighted Similarity ROI Calculator
 *
 * Replaces the crude "average of past returns" with multi-factor similarity scoring.
 * Matches current signal against historical outcomes by:
 *   - Signal type (40% weight)
 *   - Bias type (20% weight)
 *   - TA alignment (20% weight)
 *   - Confidence bucket (20% weight)
 *
 * Only uses outcomes with similarity > 0.4 for the projection.
 */

import { supabase } from '@/config/supabase';

interface HistoricalOutcome {
    outcome: string;
    return_at_5d: number | null;
    return_at_10d: number | null;
    return_at_30d: number | null;
    signals: {
        signal_type: string;
        bias_type: string;
        confidence_score: number;
        ta_alignment: string | null;
        confluence_level: string | null;
    } | null;
}

interface WeightedRoiResult {
    projectedRoi: number | null;
    projectedWinRate: number | null;
    similarEventsCount: number | null;
    avgSimilarity: number | null;
    bestHorizon: '5d' | '10d' | '30d';
}

// Cache the outcomes query for the duration of a scan cycle
let cachedOutcomes: HistoricalOutcome[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function calculateWeightedRoi(
    signalType: string,
    biasType: string,
    confidenceScore: number,
    taAlignment: string | null,
    confluenceLevel: string | null,
): Promise<WeightedRoiResult> {
    const noResult: WeightedRoiResult = {
        projectedRoi: null,
        projectedWinRate: null,
        similarEventsCount: null,
        avgSimilarity: null,
        bestHorizon: '5d',
    };

    try {
        // Fetch historical outcomes (cached)
        if (!cachedOutcomes || (Date.now() - cacheTimestamp) > CACHE_TTL) {
            const { data } = await supabase
                .from('signal_outcomes')
                .select('outcome, return_at_5d, return_at_10d, return_at_30d, signals!inner(signal_type, bias_type, confidence_score, ta_alignment, confluence_level)')
                .neq('outcome', 'pending')
                .limit(200);

            cachedOutcomes = (data as unknown as HistoricalOutcome[]) || [];
            cacheTimestamp = Date.now();
        }

        if (cachedOutcomes.length < 3) return noResult;

        // Score each past outcome by similarity to current signal
        const scored = cachedOutcomes
            .filter(o => o.signals != null)
            .map(o => {
                let similarity = 0;
                const s = o.signals!;

                // Signal type match (40% weight)
                if (s.signal_type === signalType) similarity += 0.4;
                else if (s.signal_type?.includes('overreaction') && signalType.includes('overreaction')) similarity += 0.2;

                // Bias type match (20% weight)
                if (s.bias_type === biasType) similarity += 0.2;
                else similarity += 0.05; // small baseline

                // Confidence bucket match (20% weight) — within 15 points
                const confDiff = Math.abs((s.confidence_score || 0) - confidenceScore);
                if (confDiff <= 5) similarity += 0.2;
                else if (confDiff <= 10) similarity += 0.15;
                else if (confDiff <= 15) similarity += 0.1;
                else if (confDiff <= 25) similarity += 0.05;

                // TA alignment match (15% weight)
                if (taAlignment && s.ta_alignment === taAlignment) similarity += 0.15;
                else if (taAlignment && s.ta_alignment) {
                    const alignmentOrder = ['conflicting', 'partial', 'confirmed'];
                    const currIdx = alignmentOrder.indexOf(taAlignment);
                    const histIdx = alignmentOrder.indexOf(s.ta_alignment);
                    if (currIdx >= 0 && histIdx >= 0 && Math.abs(currIdx - histIdx) <= 1) similarity += 0.07;
                }

                // Confluence level match (5% weight)
                if (confluenceLevel && s.confluence_level === confluenceLevel) similarity += 0.05;
                else if (confluenceLevel && s.confluence_level) {
                    const confOrder = ['none', 'weak', 'moderate', 'strong'];
                    const ci = confOrder.indexOf(confluenceLevel);
                    const hi = confOrder.indexOf(s.confluence_level);
                    if (ci >= 0 && hi >= 0 && Math.abs(ci - hi) <= 1) similarity += 0.02;
                }

                return { outcome: o, similarity };
            })
            .filter(s => s.similarity >= 0.4) // Only use reasonably similar outcomes
            .sort((a, b) => b.similarity - a.similarity);

        if (scored.length < 2) return noResult;

        // Calculate weighted average returns
        let totalWeight = 0;
        let weightedReturn5d = 0;
        let weightedReturn10d = 0;
        let weightedReturn30d = 0;
        let wins = 0;

        for (const { outcome: o, similarity } of scored) {
            totalWeight += similarity;
            weightedReturn5d += (o.return_at_5d ?? 0) * similarity;
            weightedReturn10d += (o.return_at_10d ?? 0) * similarity;
            weightedReturn30d += (o.return_at_30d ?? 0) * similarity;
            if (o.outcome === 'win') wins++;
        }

        const avgReturn5d = totalWeight > 0 ? weightedReturn5d / totalWeight : 0;
        const avgReturn10d = totalWeight > 0 ? weightedReturn10d / totalWeight : 0;
        const avgReturn30d = totalWeight > 0 ? weightedReturn30d / totalWeight : 0;

        // Pick best horizon
        const returns = [
            { horizon: '5d' as const, ret: avgReturn5d },
            { horizon: '10d' as const, ret: avgReturn10d },
            { horizon: '30d' as const, ret: avgReturn30d },
        ];
        const best = returns.reduce((a, b) => Math.abs(b.ret) > Math.abs(a.ret) ? b : a);

        const avgSimilarity = scored.length > 0
            ? scored.reduce((sum, s) => sum + s.similarity, 0) / scored.length
            : null;

        return {
            projectedRoi: Math.round(best.ret * 10) / 10,
            projectedWinRate: Math.round((wins / scored.length) * 100),
            similarEventsCount: scored.length,
            avgSimilarity: avgSimilarity !== null ? Math.round(avgSimilarity * 100) / 100 : null,
            bestHorizon: best.horizon,
        };

    } catch (err) {
        console.error('[WeightedROI] Error:', err);
        return noResult;
    }
}
