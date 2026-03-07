/**
 * Sentinel — Performance Stats / Feedback Loop (Patch 4)
 *
 * Provides win-rate analytics, confidence calibration, and performance context
 * that gets injected into the Signal Synthesizer prompt to improve future signals.
 */

import { supabase } from '@/config/supabase';

interface WinRateResult {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
}

interface ConfidenceCalibrationBucket {
    range: string;
    predicted: number;
    actual: number;
    count: number;
}

interface PerformingPattern {
    bias: string;
    sector: string;
    winRate: number;
    avgReturn: number;
    sampleSize: number;
}

export interface WeeklyDigest {
    signalsGenerated: number;
    winRate: number;
    bestSignal: { ticker: string; returnPct: number } | null;
    worstSignal: { ticker: string; returnPct: number } | null;
    topBias: { bias: string; winRate: number } | null;
    worstBias: { bias: string; winRate: number } | null;
    suggestions: string[];
}

export class PerformanceStats {
    /**
     * Win rate grouped by bias type.
     */
    async getWinRateByBias(): Promise<Record<string, WinRateResult>> {
        // Single query with JOIN instead of separate signals + outcomes queries
        const { data: joined } = await supabase
            .from('signal_outcomes')
            .select('outcome, signals!inner(bias_type)')
            .neq('outcome', 'pending');

        if (!joined || joined.length === 0) return {};

        const results: Record<string, WinRateResult> = {};

        for (const row of joined) {
            const bias = (row as any).signals?.bias_type || 'unknown';
            if (!results[bias]) {
                results[bias] = { total: 0, wins: 0, losses: 0, winRate: 0 };
            }
            results[bias].total++;
            if (row.outcome === 'win') results[bias].wins++;
            else results[bias].losses++;
        }

        for (const [, r] of Object.entries(results)) {
            r.winRate = r.total > 0 ? Math.round((r.wins / r.total) * 100) : 0;
        }

        return results;
    }

    /**
     * Win rate grouped by sector.
     */
    async getWinRateBySector(): Promise<Record<string, WinRateResult>> {
        const { data: signals } = await supabase
            .from('signals')
            .select('id, ticker');

        if (!signals || signals.length === 0) return {};

        const tickers = [...new Set(signals.map(s => s.ticker))];
        const { data: watchlist } = await supabase
            .from('watchlist')
            .select('ticker, sector')
            .in('ticker', tickers);

        const sectorMap = new Map((watchlist || []).map(w => [w.ticker, w.sector || 'Unknown']));

        const signalIds = signals.map(s => s.id);
        const { data: outcomes } = await supabase
            .from('signal_outcomes')
            .select('signal_id, outcome')
            .in('signal_id', signalIds)
            .neq('outcome', 'pending');

        if (!outcomes) return {};

        const outcomeMap = new Map(outcomes.map(o => [o.signal_id, o.outcome]));
        const results: Record<string, WinRateResult> = {};

        for (const signal of signals) {
            const sector = sectorMap.get(signal.ticker) || 'Unknown';
            const outcome = outcomeMap.get(signal.id);
            if (!outcome) continue;

            if (!results[sector]) {
                results[sector] = { total: 0, wins: 0, losses: 0, winRate: 0 };
            }
            results[sector].total++;
            if (outcome === 'win') results[sector].wins++;
            else results[sector].losses++;
        }

        for (const [, r] of Object.entries(results)) {
            r.winRate = r.total > 0 ? Math.round((r.wins / r.total) * 100) : 0;
        }

        return results;
    }

    /**
     * Confidence calibration — are our 80% confidence signals actually winning 80%?
     */
    async getConfidenceCalibration(): Promise<ConfidenceCalibrationBucket[]> {
        // Single query with JOIN instead of separate signals + outcomes queries
        const { data: joined } = await supabase
            .from('signal_outcomes')
            .select('outcome, signals!inner(confidence_score)')
            .neq('outcome', 'pending');

        if (!joined || joined.length === 0) return [];

        const buckets: Record<string, { wins: number; total: number }> = {};
        for (let i = 0; i < 10; i++) {
            const key = `${i * 10}-${(i + 1) * 10}`;
            buckets[key] = { wins: 0, total: 0 };
        }

        for (const row of joined) {
            const confidence = (row as any).signals?.confidence_score ?? 0;
            const bucketIdx = Math.min(9, Math.floor(confidence / 10));
            const key = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}`;
            const bucket = buckets[key];
            if (!bucket) continue;
            bucket.total++;
            if (row.outcome === 'win') bucket.wins++;
        }

        return Object.entries(buckets)
            .filter(([, v]) => v.total > 0)
            .map(([range, v]) => ({
                range,
                predicted: parseInt(range.split('-')[0] ?? '0') + 5,
                actual: Math.round((v.wins / v.total) * 100),
                count: v.total,
            }));
    }

    /**
     * Top-performing patterns (bias + sector combos).
     */
    async getTopPerformingPatterns(limit = 5): Promise<PerformingPattern[]> {
        const { data: signals } = await supabase
            .from('signals')
            .select('id, ticker, bias_type');

        if (!signals || signals.length === 0) return [];

        const tickers = [...new Set(signals.map(s => s.ticker))];
        const { data: watchlist } = await supabase
            .from('watchlist')
            .select('ticker, sector')
            .in('ticker', tickers);

        const sectorMap = new Map((watchlist || []).map(w => [w.ticker, w.sector || 'Unknown']));

        const signalIds = signals.map(s => s.id);
        const { data: outcomes } = await supabase
            .from('signal_outcomes')
            .select('signal_id, outcome, return_at_30d')
            .in('signal_id', signalIds)
            .neq('outcome', 'pending');

        if (!outcomes) return [];

        const outcomeMap = new Map(outcomes.map(o => [o.signal_id, o]));
        const patterns: Record<string, { wins: number; total: number; returns: number[] }> = {};

        for (const signal of signals) {
            const o = outcomeMap.get(signal.id);
            if (!o) continue;

            const sector = sectorMap.get(signal.ticker) || 'Unknown';
            const key = `${signal.bias_type}|${sector}`;

            if (!patterns[key]) patterns[key] = { wins: 0, total: 0, returns: [] };
            patterns[key].total++;
            if (o.outcome === 'win') patterns[key].wins++;
            if (o.return_at_30d != null) patterns[key].returns.push(o.return_at_30d);
        }

        return Object.entries(patterns)
            .filter(([, v]) => v.total >= 2)
            .map(([key, v]) => {
                const parts = key.split('|');
                const bias = parts[0] ?? 'unknown';
                const sector = parts[1] ?? 'Unknown';
                const avgReturn = v.returns.length > 0
                    ? v.returns.reduce((a, b) => a + b, 0) / v.returns.length
                    : 0;
                return {
                    bias,
                    sector,
                    winRate: Math.round((v.wins / v.total) * 100),
                    avgReturn: Math.round(avgReturn * 100) / 100,
                    sampleSize: v.total,
                };
            })
            .sort((a, b) => b.winRate - a.winRate || b.sampleSize - a.sampleSize)
            .slice(0, limit);
    }

    /**
     * Build a performance context string for injection into agent prompts.
     * Includes explicit calibration directives so agents can adjust confidence
     * based on historical accuracy for each bias type, sector, and confidence bucket.
     */
    async buildPerformanceContext(): Promise<string> {
        const [biasRates, sectorRates, topPatterns, calibration] = await Promise.all([
            this.getWinRateByBias(),
            this.getWinRateBySector(),
            this.getTopPerformingPatterns(5),
            this.getConfidenceCalibration(),
        ]);

        const lines: string[] = ['=== SENTINEL HISTORICAL PERFORMANCE DATA ==='];
        lines.push('Use this data to CALIBRATE your confidence scores. This is not optional.');

        // ── Bias-type stats with explicit directives ──
        const biasEntries = Object.entries(biasRates).filter(([, v]) => v.total >= 2);
        if (biasEntries.length > 0) {
            lines.push('\n## Win Rate by Bias Type:');
            for (const [bias, stats] of biasEntries) {
                lines.push(`  - ${bias}: ${stats.winRate}% (${stats.wins}W/${stats.losses}L, n=${stats.total})`);
                // Actionable directives
                if (stats.total >= 3 && stats.winRate < 40) {
                    lines.push(`    ⚠ DIRECTIVE: LOWER your confidence by 10-20 points for "${bias}" signals. Historical accuracy is poor.`);
                } else if (stats.total >= 3 && stats.winRate >= 70) {
                    lines.push(`    ✓ DIRECTIVE: This bias type outperforms. You may raise confidence by 5-10 points if fundamentals align.`);
                }
            }
        }

        // ── Sector stats with directives ──
        const sectorEntries = Object.entries(sectorRates).filter(([, v]) => v.total >= 2);
        if (sectorEntries.length > 0) {
            lines.push('\n## Win Rate by Sector:');
            for (const [sector, stats] of sectorEntries) {
                lines.push(`  - ${sector}: ${stats.winRate}% (${stats.wins}W/${stats.losses}L, n=${stats.total})`);
                if (stats.total >= 3 && stats.winRate < 40) {
                    lines.push(`    ⚠ DIRECTIVE: Signals in "${sector}" sector historically underperform. Require HIGHER confirmation (severity >= 8, multiple sources).`);
                }
            }
        }

        // ── Confidence calibration — are we over/under-confident? ──
        if (calibration.length > 0) {
            lines.push('\n## Confidence Calibration (Predicted vs Actual Win %):');
            for (const bucket of calibration) {
                const delta = bucket.actual - bucket.predicted;
                const arrow = delta >= 0 ? '↑' : '↓';
                lines.push(`  - Confidence ${bucket.range}: Predicted ~${bucket.predicted}%, Actual ${bucket.actual}% ${arrow} (n=${bucket.count})`);
            }
            // Global calibration directive
            const overConfident = calibration.filter(b => b.predicted - b.actual > 15 && b.count >= 3);
            if (overConfident.length > 0) {
                lines.push(`    ⚠ SYSTEMATIC OVERCONFIDENCE DETECTED in buckets: ${overConfident.map(b => b.range).join(', ')}. Reduce all confidence scores by 10.`);
            }
            const underConfident = calibration.filter(b => b.actual - b.predicted > 15 && b.count >= 3);
            if (underConfident.length > 0) {
                lines.push(`    ✓ UNDERCONFIDENCE detected in buckets: ${underConfident.map(b => b.range).join(', ')}. You may be too conservative.`);
            }
        }

        // ── Best/Worst performing patterns ──
        if (topPatterns.length > 0) {
            const best = topPatterns.filter(p => p.winRate >= 60);
            const worst = topPatterns.filter(p => p.winRate < 40);

            if (best.length > 0) {
                lines.push('\n## Best-Performing Patterns (prioritize these):');
                for (const p of best) {
                    lines.push(`  ✓ ${p.bias} + ${p.sector}: ${p.winRate}% WR, avg ${p.avgReturn}% return (n=${p.sampleSize})`);
                }
            }
            if (worst.length > 0) {
                lines.push('\n## Worst-Performing Patterns (be skeptical):');
                for (const p of worst) {
                    lines.push(`  ✗ ${p.bias} + ${p.sector}: ${p.winRate}% WR, avg ${p.avgReturn}% return (n=${p.sampleSize})`);
                }
            }
        }

        if (lines.length <= 2) {
            return '=== SENTINEL HISTORICAL PERFORMANCE DATA ===\nNot enough historical signals to generate statistics yet. Use your default calibration.';
        }

        lines.push('\n=== END PERFORMANCE DATA ===');
        return lines.join('\n');
    }

    /**
     * Weekly performance digest for Dashboard widget.
     */
    async getWeeklyDigest(): Promise<WeeklyDigest> {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: weekSignals } = await supabase
            .from('signals')
            .select('id, ticker, bias_type, confidence_score')
            .gte('created_at', oneWeekAgo);

        const signalsGenerated = weekSignals?.length || 0;

        const signalIds = (weekSignals || []).map(s => s.id);
        const { data: outcomes } = signalIds.length > 0
            ? await supabase
                .from('signal_outcomes')
                .select('signal_id, outcome, return_at_30d')
                .in('signal_id', signalIds)
                .neq('outcome', 'pending')
            : { data: [] };

        const resolved = outcomes || [];
        const wins = resolved.filter(o => o.outcome === 'win').length;
        const winRate = resolved.length > 0 ? Math.round((wins / resolved.length) * 100) : 0;

        let bestSignal: WeeklyDigest['bestSignal'] = null;
        let worstSignal: WeeklyDigest['worstSignal'] = null;

        if (resolved.length > 0) {
            const signalMap = new Map((weekSignals || []).map(s => [s.id, s]));
            const sorted = [...resolved]
                .filter(o => o.return_at_30d != null)
                .sort((a, b) => (b.return_at_30d ?? 0) - (a.return_at_30d ?? 0));

            if (sorted.length > 0) {
                const bestItem = sorted[0]!;
                const worstItem = sorted[sorted.length - 1]!;
                const bestSig = signalMap.get(bestItem.signal_id);
                const worstSig = signalMap.get(worstItem.signal_id);
                if (bestSig) bestSignal = { ticker: bestSig.ticker, returnPct: bestItem.return_at_30d ?? 0 };
                if (worstSig) worstSignal = { ticker: worstSig.ticker, returnPct: worstItem.return_at_30d ?? 0 };
            }
        }

        const biasRates = await this.getWinRateByBias();
        const biasEntries = Object.entries(biasRates).filter(([, v]) => v.total >= 2);
        const sortedBias = [...biasEntries].sort((a, b) => b[1].winRate - a[1].winRate);
        const topEntry = sortedBias[0];
        const worstEntry = sortedBias[sortedBias.length - 1];
        const topBias = topEntry ? { bias: topEntry[0], winRate: topEntry[1].winRate } : null;
        const worstBias = worstEntry ? { bias: worstEntry[0], winRate: worstEntry[1].winRate } : null;

        const suggestions: string[] = [];
        if (winRate < 50 && resolved.length >= 5) {
            suggestions.push('Win rate is below 50%. Consider tightening confidence thresholds.');
        }
        if (worstBias && worstBias.winRate < 30) {
            suggestions.push(`"${worstBias.bias}" bias signals underperform. Consider deprioritizing.`);
        }
        if (signalsGenerated === 0) {
            suggestions.push('No signals generated this week. Check scanner health.');
        }
        if (suggestions.length === 0 && winRate >= 60) {
            suggestions.push('Performance looks strong. Maintain current strategy.');
        }
        if (suggestions.length === 0) {
            suggestions.push('Accumulating data. More signals needed for reliable insights.');
        }

        return { signalsGenerated, winRate, bestSignal, worstSignal, topBias, worstBias, suggestions };
    }
}

export const performanceStats = new PerformanceStats();
