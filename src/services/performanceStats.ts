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
        const { data: signals } = await supabase
            .from('signals')
            .select('id, bias_type');

        if (!signals || signals.length === 0) return {};

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
            const bias = signal.bias_type || 'unknown';
            const outcome = outcomeMap.get(signal.id);
            if (!outcome) continue;

            if (!results[bias]) {
                results[bias] = { total: 0, wins: 0, losses: 0, winRate: 0 };
            }
            results[bias].total++;
            if (outcome === 'win') results[bias].wins++;
            else results[bias].losses++;
        }

        for (const key of Object.keys(results)) {
            const r = results[key];
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

        for (const key of Object.keys(results)) {
            const r = results[key];
            r.winRate = r.total > 0 ? Math.round((r.wins / r.total) * 100) : 0;
        }

        return results;
    }

    /**
     * Confidence calibration — are our 80% confidence signals actually winning 80%?
     */
    async getConfidenceCalibration(): Promise<ConfidenceCalibrationBucket[]> {
        const { data: signals } = await supabase
            .from('signals')
            .select('id, confidence_score');

        if (!signals || signals.length === 0) return [];

        const signalIds = signals.map(s => s.id);
        const { data: outcomes } = await supabase
            .from('signal_outcomes')
            .select('signal_id, outcome')
            .in('signal_id', signalIds)
            .neq('outcome', 'pending');

        if (!outcomes) return [];

        const outcomeMap = new Map(outcomes.map(o => [o.signal_id, o.outcome]));

        const buckets: Record<string, { wins: number; total: number }> = {};
        for (let i = 0; i < 10; i++) {
            const key = `${i * 10}-${(i + 1) * 10}`;
            buckets[key] = { wins: 0, total: 0 };
        }

        for (const signal of signals) {
            const outcome = outcomeMap.get(signal.id);
            if (!outcome) continue;

            const bucketIdx = Math.min(9, Math.floor(signal.confidence_score / 10));
            const key = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}`;
            buckets[key].total++;
            if (outcome === 'win') buckets[key].wins++;
        }

        return Object.entries(buckets)
            .filter(([, v]) => v.total > 0)
            .map(([range, v]) => ({
                range,
                predicted: parseInt(range.split('-')[0]) + 5,
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
                const [bias, sector] = key.split('|');
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
     */
    async buildPerformanceContext(): Promise<string> {
        const [biasRates, sectorRates, topPatterns] = await Promise.all([
            this.getWinRateByBias(),
            this.getWinRateBySector(),
            this.getTopPerformingPatterns(3),
        ]);

        const lines: string[] = ['INTERNAL PERFORMANCE DATA (from past signals):'];

        const biasEntries = Object.entries(biasRates).filter(([, v]) => v.total >= 3);
        if (biasEntries.length > 0) {
            lines.push('\nWin rate by bias type:');
            for (const [bias, stats] of biasEntries) {
                lines.push(`  - ${bias}: ${stats.winRate}% (${stats.total} signals)`);
            }
        }

        const sectorEntries = Object.entries(sectorRates).filter(([, v]) => v.total >= 3);
        if (sectorEntries.length > 0) {
            lines.push('\nWin rate by sector:');
            for (const [sector, stats] of sectorEntries) {
                lines.push(`  - ${sector}: ${stats.winRate}% (${stats.total} signals)`);
            }
        }

        if (topPatterns.length > 0) {
            lines.push('\nBest-performing patterns:');
            for (const p of topPatterns) {
                lines.push(`  - ${p.bias} + ${p.sector}: ${p.winRate}% win rate, avg ${p.avgReturn}% return (n=${p.sampleSize})`);
            }
        }

        if (lines.length === 1) {
            return 'INTERNAL PERFORMANCE DATA: Not enough historical signals to generate statistics yet.';
        }

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
                const bestSig = signalMap.get(sorted[0].signal_id);
                const worstSig = signalMap.get(sorted[sorted.length - 1].signal_id);
                if (bestSig) bestSignal = { ticker: bestSig.ticker, returnPct: sorted[0].return_at_30d ?? 0 };
                if (worstSig) worstSignal = { ticker: worstSig.ticker, returnPct: sorted[sorted.length - 1].return_at_30d ?? 0 };
            }
        }

        const biasRates = await this.getWinRateByBias();
        const biasEntries = Object.entries(biasRates).filter(([, v]) => v.total >= 2);
        const sortedBias = [...biasEntries].sort((a, b) => b[1].winRate - a[1].winRate);
        const topBias = sortedBias.length > 0 ? { bias: sortedBias[0][0], winRate: sortedBias[0][1].winRate } : null;
        const worstBias = sortedBias.length > 0 ? { bias: sortedBias[sortedBias.length - 1][0], winRate: sortedBias[sortedBias.length - 1][1].winRate } : null;

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
