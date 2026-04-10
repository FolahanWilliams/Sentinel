/**
 * Sentinel — Confidence Calibration Engine
 *
 * Maps AI confidence scores to actual historical win rates,
 * preventing the dangerous assumption that "0.90 confidence = 90% win rate".
 *
 * Calibration runs periodically (on ReflectionAgent cycles) and caches
 * the curve in app_settings for real-time lookup during signal generation.
 */

import { supabase } from '@/config/supabase';

export interface CalibrationBucket {
    range: string;           // "70-80"
    predicted: number;       // midpoint e.g. 75
    actualWinRate: number;   // real observed win rate (0-100)
    sampleSize: number;
}

export interface CalibrationCurve {
    buckets: CalibrationBucket[];
    lastUpdated: string;
    totalOutcomes: number;
    overallWinRate: number;
}

const APP_SETTINGS_KEY = 'confidence_calibration';
const APP_SETTINGS_KEY_BY_TYPE = 'confidence_calibration_by_type';
const APP_SETTINGS_KEY_BY_SECTOR = 'confidence_calibration_by_sector';

export class ConfidenceCalibrator {
    // In-memory cache — avoids repeated DB hits during a single scan cycle
    private static cachedCurve: CalibrationCurve | null = null;
    private static cacheTimestamp = 0;
    private static readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
    private static pendingFetch: Promise<CalibrationCurve> | null = null;
    // Per-signal-type calibration cache
    private static cachedCurvesByType: Record<string, CalibrationCurve> = {};
    private static cacheByTypeTimestamp = 0;
    // Per-sector calibration cache
    private static cachedCurvesBySector: Record<string, CalibrationCurve> = {};
    private static cacheBySectorTimestamp = 0;

    /**
     * Build calibration curve from historical signal outcomes.
     * Groups by confidence buckets and computes actual win rates.
     * Now builds curves by: Overall, Type, and Sector.
     */
    static async buildCalibrationCurve(): Promise<CalibrationCurve> {
        // Fetch completed outcomes joined with signals for confidence score + signal_type + ticker
        const { data: outcomes, error } = await supabase
            .from('signal_outcomes')
            .select('outcome, signals!inner(confidence_score, signal_type, ticker)')
            .neq('outcome', 'pending');

        if (error || !outcomes || outcomes.length === 0) {
            return this.emptyCurve();
        }

        // Fetch watchlist to map tickers to sectors
        const { data: watchlist } = await supabase
            .from('watchlist')
            .select('ticker, sector');
        const tickerToSector = new Map(watchlist?.map(w => [w.ticker, w.sector]) || []);

        // Initialize 10 buckets (0-10, 10-20, ..., 90-100)
        const bucketMap: Record<string, { wins: number; total: number }> = {};
        for (let i = 0; i < 10; i++) {
            bucketMap[`${i * 10}-${(i + 1) * 10}`] = { wins: 0, total: 0 };
        }

        // Partitioned bucket maps
        const typeBucketMaps: Record<string, Record<string, { wins: number; total: number }>> = {};
        const sectorBucketMaps: Record<string, Record<string, { wins: number; total: number }>> = {};

        let totalWins = 0;

        for (const row of outcomes) {
            const confidence = (row as any).signals?.confidence_score ?? 0;
            const signalType = (row as any).signals?.signal_type ?? 'unknown';
            const ticker = (row as any).signals?.ticker ?? 'unknown';
            const sector = tickerToSector.get(ticker) ?? 'Unknown';
            const isWin = row.outcome === 'win';

            const bucketIdx = Math.min(9, Math.floor(confidence / 10));
            const key = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}`;

            // Overall curve
            if (bucketMap[key]) {
                bucketMap[key].total++;
                if (isWin) {
                    bucketMap[key].wins++;
                    totalWins++;
                }
            }

            // Per-type curve
            if (!typeBucketMaps[signalType]) {
                typeBucketMaps[signalType] = {};
                for (let i = 0; i < 10; i++) {
                    typeBucketMaps[signalType][`${i * 10}-${(i + 1) * 10}`] = { wins: 0, total: 0 };
                }
            }
            if (typeBucketMaps[signalType][key]) {
                typeBucketMaps[signalType][key].total++;
                if (isWin) typeBucketMaps[signalType][key].wins++;
            }

            // Per-sector curve
            if (!sectorBucketMaps[sector]) {
                sectorBucketMaps[sector] = {};
                for (let i = 0; i < 10; i++) {
                    sectorBucketMaps[sector][`${i * 10}-${(i + 1) * 10}`] = { wins: 0, total: 0 };
                }
            }
            if (sectorBucketMaps[sector][key]) {
                sectorBucketMaps[sector][key].total++;
                if (isWin) sectorBucketMaps[sector][key].wins++;
            }
        }

        const buckets: CalibrationBucket[] = Object.entries(bucketMap)
            .filter(([, v]) => v.total > 0)
            .map(([range, v]) => ({
                range,
                predicted: parseInt(range.split('-')[0] ?? '0') + 5,
                actualWinRate: Math.round((v.wins / v.total) * 100 * 10) / 10,
                sampleSize: v.total,
            }));

        const curve: CalibrationCurve = {
            buckets,
            lastUpdated: new Date().toISOString(),
            totalOutcomes: outcomes.length,
            overallWinRate: outcomes.length > 0 ? Math.round((totalWins / outcomes.length) * 100 * 10) / 10 : 0,
        };

        // Build partitioned curves (Type & Sector)
        const curvesByType: Record<string, CalibrationCurve> = {};
        for (const [signalType, bMap] of Object.entries(typeBucketMaps)) {
            curvesByType[signalType] = this.buildCurveFromBucketMap(bMap);
        }

        const curvesBySector: Record<string, CalibrationCurve> = {};
        for (const [sector, bMap] of Object.entries(sectorBucketMaps)) {
            curvesBySector[sector] = this.buildCurveFromBucketMap(bMap);
        }

        // Persist all curves
        await Promise.allSettled([
            supabase.from('app_settings').upsert({
                key: APP_SETTINGS_KEY,
                value: curve as any,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key,user_id' }),
            supabase.from('app_settings').upsert({
                key: APP_SETTINGS_KEY_BY_TYPE,
                value: curvesByType as any,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key,user_id' }),
            supabase.from('app_settings').upsert({
                key: APP_SETTINGS_KEY_BY_SECTOR,
                value: curvesBySector as any,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key,user_id' }),
        ]);

        // Update in-memory caches
        this.cachedCurvesByType = curvesByType;
        this.cacheByTypeTimestamp = Date.now();
        this.cachedCurvesBySector = curvesBySector;
        this.cacheBySectorTimestamp = Date.now();

        return curve;
    }

    /**
     * Helper to build a CalibrationCurve from a bucket map.
     */
    private static buildCurveFromBucketMap(bMap: Record<string, { wins: number; total: number }>): CalibrationCurve {
        const typeBuckets: CalibrationBucket[] = Object.entries(bMap)
            .filter(([, v]) => v.total > 0)
            .map(([range, v]) => ({
                range,
                predicted: parseInt(range.split('-')[0] ?? '0') + 5,
                actualWinRate: Math.round((v.wins / v.total) * 100 * 10) / 10,
                sampleSize: v.total,
            }));
        const typeTotal = Object.values(bMap).reduce((s, v) => s + v.total, 0);
        const typeWins = Object.values(bMap).reduce((s, v) => s + v.wins, 0);
        return {
            buckets: typeBuckets,
            lastUpdated: new Date().toISOString(),
            totalOutcomes: typeTotal,
            overallWinRate: typeTotal > 0 ? Math.round((typeWins / typeTotal) * 100 * 10) / 10 : 0,
        };
    }

    /**
     * Get cached calibration curve from app_settings.
     * Returns empty curve if none exists.
     */
    static async getCachedCurve(): Promise<CalibrationCurve> {
        // Return in-memory cache if fresh
        if (this.cachedCurve && (Date.now() - this.cacheTimestamp) < this.CACHE_TTL_MS) {
            return this.cachedCurve;
        }

        // Deduplicate concurrent fetches — return the same promise if one is in-flight
        if (this.pendingFetch) return this.pendingFetch;

        this.pendingFetch = (async () => {
            try {
                const { data, error } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', APP_SETTINGS_KEY)
                    .maybeSingle();

                if (error || !data?.value) {
                    this.cachedCurve = this.emptyCurve();
                } else {
                    this.cachedCurve = data.value as unknown as CalibrationCurve;
                }
                this.cacheTimestamp = Date.now();
                return this.cachedCurve;
            } catch {
                return this.emptyCurve();
            } finally {
                this.pendingFetch = null;
            }
        })();

        return this.pendingFetch;
    }

    /**
     * Look up calibrated win rate for a given AI confidence score.
     * Falls back to the raw confidence if no calibration data exists.
     */
    static getCalibratedWinRate(aiConfidence: number, curve: CalibrationCurve): number {
        if (curve.buckets.length === 0 || curve.totalOutcomes < 10) {
            // Insufficient data — return a conservative estimate
            // Don't trust raw AI confidence; apply 20% haircut
            return Math.max(0, aiConfidence * 0.8);
        }

        const bucketIdx = Math.min(9, Math.floor(aiConfidence / 10));
        const key = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}`;
        const bucket = curve.buckets.find(b => b.range === key);

        if (bucket && bucket.sampleSize >= 3) {
            return bucket.actualWinRate;
        }

        // If this specific bucket has too few samples, use overall win rate
        return curve.overallWinRate;
    }

    /**
     * Get calibrated win rate for a specific signal type.
     * Falls back to the overall curve if the signal type has insufficient data.
     */
    static async getCalibratedWinRateByType(
        aiConfidence: number,
        signalType: string,
    ): Promise<number> {
        // Refresh per-type cache if stale
        if (Object.keys(this.cachedCurvesByType).length === 0 ||
            (Date.now() - this.cacheByTypeTimestamp) > this.CACHE_TTL_MS) {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', APP_SETTINGS_KEY_BY_TYPE)
                    .maybeSingle();
                if (data?.value) {
                    this.cachedCurvesByType = data.value as unknown as Record<string, CalibrationCurve>;
                    this.cacheByTypeTimestamp = Date.now();
                }
            } catch { /* fall through to overall curve */ }
        }

        const typeCurve = this.cachedCurvesByType[signalType];
        if (typeCurve && typeCurve.totalOutcomes >= 10) {
            return this.getCalibratedWinRate(aiConfidence, typeCurve);
        }

        // Fall back to overall curve
        const overallCurve = await this.getCachedCurve();
        return this.getCalibratedWinRate(aiConfidence, overallCurve);
    }

    /**
     * Get calibrated win rate for a specific sector.
     * Falls back to the overall curve if the sector has insufficient data.
     */
    static async getCalibratedWinRateBySector(
        aiConfidence: number,
        sector: string,
    ): Promise<number> {
        // Refresh per-sector cache if stale
        if (Object.keys(this.cachedCurvesBySector).length === 0 ||
            (Date.now() - this.cacheBySectorTimestamp) > this.CACHE_TTL_MS) {
            try {
                const { data } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', APP_SETTINGS_KEY_BY_SECTOR)
                    .maybeSingle();
                if (data?.value) {
                    this.cachedCurvesBySector = data.value as unknown as Record<string, CalibrationCurve>;
                    this.cacheBySectorTimestamp = Date.now();
                }
            } catch { /* fall through to overall curve */ }
        }

        const sectorCurve = this.cachedCurvesBySector[sector];
        if (sectorCurve && sectorCurve.totalOutcomes >= 5) { // Lower threshold for sectors
            return this.getCalibratedWinRate(aiConfidence, sectorCurve);
        }

        // Fall back to overall curve
        const overallCurve = await this.getCachedCurve();
        return this.getCalibratedWinRate(aiConfidence, overallCurve);
    }

    /**
     * Generate a prompt-injection context string that tells the AI about its own
     * historical accuracy across signal types and sectors.
     */
    static formatForPrompt(curve: CalibrationCurve, typeCurve?: CalibrationCurve, sectorCurve?: CalibrationCurve): string {
        if (curve.totalOutcomes < 10) {
            return '\nCALIBRATION DATA: Insufficient outcome history (<10 tracked). Default 20% haircut applied to your confidence scores. Be conservative.';
        }

        const overallLines = curve.buckets
            .filter(b => b.sampleSize >= 3)
            .sort((a, b) => a.predicted - b.predicted)
            .map(b => {
                const gap = b.actualWinRate - b.predicted;
                const direction = gap > 5 ? '↑ (underconfident)' : gap < -5 ? '↓ (overconfident)' : '✓ (accurate)';
                return `  ${b.range}: predicted ~${b.predicted}% → actual ${b.actualWinRate}% WR (n=${b.sampleSize}) ${direction}`;
            });

        let typeContext = '';
        if (typeCurve && typeCurve.totalOutcomes >= 5) {
            typeContext = `\nACCURACY FOR THIS SIGNAL TYPE: overall win rate ${typeCurve.overallWinRate}% (${typeCurve.totalOutcomes} samples).`;
        }

        let sectorContext = '';
        if (sectorCurve && sectorCurve.totalOutcomes >= 5) {
            sectorContext = `\nACCURACY FOR THIS SECTOR: overall win rate ${sectorCurve.overallWinRate}% (${sectorCurve.totalOutcomes} samples).`;
        }

        const overallNote = curve.overallWinRate < 45 ? 'CRITICAL: High failure rate detected. Raise your quality bar significantly.' : 'Continue optimizing for edge.';

        return `\nCALIBRATION FEEDBACK (${curve.totalOutcomes} tracked outcomes, overall WR: ${curve.overallWinRate}%):
${overallNote}${typeContext}${sectorContext}
Accuracy by overall bucket:
${overallLines.join('\n')}
Use this to self-correct — if you underperform in a sector/bucket, score more conservatively.`;
    }

    private static emptyCurve(): CalibrationCurve {
        return {
            buckets: [],
            lastUpdated: new Date().toISOString(),
            totalOutcomes: 0,
            overallWinRate: 50,
        };
    }
}
