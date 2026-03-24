/**
 * Sentinel — Decision Accuracy Hook
 *
 * Fetches and computes decision accuracy metrics:
 * - Rolling win rate over time
 * - Calibration data (confidence vs actual win rate)
 * - Bias cost breakdown
 * - Trend analysis
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import { ConfidenceCalibrator } from '@/services/confidenceCalibrator';
import { BiasCostCalculator, type BiasCostSummary } from '@/services/biasCostCalculator';

export interface AccuracyDataPoint {
    date: string;
    winRate: number;
    totalOutcomes: number;
    rollingWins: number;
    rollingTotal: number;
}

export interface CalibrationDataPoint {
    bucket: string;
    confidenceMin: number;
    confidenceMax: number;
    expectedWinRate: number;  // midpoint of confidence bucket
    actualWinRate: number;
    count: number;
}

export interface DecisionAccuracyData {
    accuracyOverTime: AccuracyDataPoint[];
    calibrationData: CalibrationDataPoint[];
    biasCost: BiasCostSummary | null;
    overallAccuracy: number;
    totalOutcomes: number;
    totalSignals: number;
    recentTrend: 'improving' | 'declining' | 'stable';
    loading: boolean;
}

export function useDecisionAccuracy(): DecisionAccuracyData {
    const [data, setData] = useState<DecisionAccuracyData>({
        accuracyOverTime: [],
        calibrationData: [],
        biasCost: null,
        overallAccuracy: 0,
        totalOutcomes: 0,
        totalSignals: 0,
        recentTrend: 'stable',
        loading: true,
    });

    const fetchData = useCallback(async () => {
        try {
            // Fetch all completed outcomes with signal data
            const [outcomesRes, signalsCountRes, calibrationCurve, biasCost] = await Promise.all([
                supabase
                    .from('signal_outcomes')
                    .select('*, signals!inner(confidence_score, created_at, bias_type, agent_outputs)')
                    .neq('outcome', 'pending')
                    .order('completed_at', { ascending: true }),
                supabase.from('signals').select('*', { count: 'exact', head: true }),
                ConfidenceCalibrator.getCachedCurve(),
                BiasCostCalculator.calculate(),
            ]);

            const outcomes = outcomesRes.data || [];
            const totalSignals = signalsCountRes.count ?? 0;

            // 1. Accuracy over time (rolling 30-day window)
            const accuracyOverTime: AccuracyDataPoint[] = [];
            const WINDOW = 30;

            for (let i = 0; i < outcomes.length; i++) {
                const windowStart = Math.max(0, i - WINDOW + 1);
                const windowSlice = outcomes.slice(windowStart, i + 1);
                const wins = windowSlice.filter(o => o.outcome === 'win').length;

                accuracyOverTime.push({
                    date: outcomes[i].completed_at || outcomes[i].tracked_at,
                    winRate: windowSlice.length > 0 ? (wins / windowSlice.length) * 100 : 0,
                    totalOutcomes: i + 1,
                    rollingWins: wins,
                    rollingTotal: windowSlice.length,
                });
            }

            // 2. Calibration data from cached curve
            const calibrationData: CalibrationDataPoint[] = [];
            if (calibrationCurve?.buckets) {
                for (const bucket of calibrationCurve.buckets) {
                    const [minStr, maxStr] = bucket.range.split('-');
                    const min = Number(minStr);
                    const max = Number(maxStr);
                    calibrationData.push({
                        bucket: bucket.range,
                        confidenceMin: min,
                        confidenceMax: max,
                        expectedWinRate: bucket.predicted,
                        actualWinRate: bucket.actualWinRate,
                        count: bucket.sampleSize,
                    });
                }
            }

            // 3. Overall accuracy
            const totalWins = outcomes.filter(o => o.outcome === 'win').length;
            const overallAccuracy = outcomes.length > 0 ? (totalWins / outcomes.length) * 100 : 0;

            // 4. Recent trend (compare last 10 vs previous 10)
            let recentTrend: 'improving' | 'declining' | 'stable' = 'stable';
            if (outcomes.length >= 20) {
                const recent10 = outcomes.slice(-10);
                const prev10 = outcomes.slice(-20, -10);
                const recentWR = recent10.filter(o => o.outcome === 'win').length / 10;
                const prevWR = prev10.filter(o => o.outcome === 'win').length / 10;
                if (recentWR - prevWR > 0.05) recentTrend = 'improving';
                else if (prevWR - recentWR > 0.05) recentTrend = 'declining';
            }

            setData({
                accuracyOverTime,
                calibrationData,
                biasCost,
                overallAccuracy,
                totalOutcomes: outcomes.length,
                totalSignals,
                recentTrend,
                loading: false,
            });
        } catch (err) {
            console.error('[useDecisionAccuracy] Failed:', err);
            setData(prev => ({ ...prev, loading: false }));
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return data;
}
