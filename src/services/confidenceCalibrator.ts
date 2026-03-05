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

export class ConfidenceCalibrator {

    /**
     * Build calibration curve from historical signal outcomes.
     * Groups by confidence buckets and computes actual win rates.
     */
    static async buildCalibrationCurve(): Promise<CalibrationCurve> {
        // Fetch completed outcomes joined with signals for confidence score
        const { data: outcomes, error } = await supabase
            .from('signal_outcomes')
            .select('outcome, signals!inner(confidence_score)')
            .neq('outcome', 'pending');

        if (error || !outcomes || outcomes.length === 0) {
            return this.emptyCurve();
        }

        // Initialize 10 buckets (0-10, 10-20, ..., 90-100)
        const bucketMap: Record<string, { wins: number; total: number }> = {};
        for (let i = 0; i < 10; i++) {
            bucketMap[`${i * 10}-${(i + 1) * 10}`] = { wins: 0, total: 0 };
        }

        let totalWins = 0;

        for (const row of outcomes) {
            const confidence = (row as any).signals?.confidence_score ?? 0;
            const isWin = row.outcome === 'win';

            const bucketIdx = Math.min(9, Math.floor(confidence / 10));
            const key = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}`;

            if (bucketMap[key]) {
                bucketMap[key].total++;
                if (isWin) {
                    bucketMap[key].wins++;
                    totalWins++;
                }
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

        // Persist to app_settings
        await supabase.from('app_settings').upsert({
            key: APP_SETTINGS_KEY,
            value: curve as any,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'key' });

        return curve;
    }

    /**
     * Get cached calibration curve from app_settings.
     * Returns empty curve if none exists.
     */
    static async getCachedCurve(): Promise<CalibrationCurve> {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', APP_SETTINGS_KEY)
                .maybeSingle();

            if (error || !data?.value) return this.emptyCurve();
            return data.value as unknown as CalibrationCurve;
        } catch {
            return this.emptyCurve();
        }
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

    private static emptyCurve(): CalibrationCurve {
        return {
            buckets: [],
            lastUpdated: new Date().toISOString(),
            totalOutcomes: 0,
            overallWinRate: 50,
        };
    }
}
