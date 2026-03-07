/**
 * Sentinel — Intraday Signal Re-Evaluation Service
 *
 * After a signal is created, this service re-checks the thesis at
 * configurable intervals (1d and 3d). If the TA snapshot has materially
 * changed (RSI moved from oversold to neutral, volume dried up, price
 * broke past stop-loss), it auto-downgrades or closes the signal.
 *
 * Prevents "fire and forget" — signals adapt to changing conditions.
 */

import { supabase } from '@/config/supabase';
import { TechnicalAnalysisService } from './technicalAnalysis';
import { MarketDataService } from './marketData';
import type { TASnapshot } from '@/types/signals';

export interface ReEvalResult {
    signalId: string;
    ticker: string;
    action: 'unchanged' | 'downgraded' | 'upgraded' | 'closed';
    reason: string;
    oldConfidence: number;
    newConfidence: number;
    taChanges: TAChange[];
}

export interface TAChange {
    indicator: string;
    previous: number | string | null;
    current: number | string | null;
    impact: 'positive' | 'negative' | 'neutral';
}

export class SignalReEvaluator {

    /**
     * Re-evaluate all active signals that have aged past their check intervals.
     * Called during each scan cycle.
     */
    static async reEvaluateActiveSignals(): Promise<{
        processed: number;
        downgraded: number;
        closed: number;
        upgraded: number;
        results: ReEvalResult[];
    }> {
        const results: ReEvalResult[] = [];
        let downgraded = 0;
        let closed = 0;
        let upgraded = 0;

        try {
            // Fetch active signals with their TA snapshots
            // Use `as any` for select since ta_snapshot is a JSONB column not in generated types
            const { data: activeSignals, error } = await (supabase
                .from('signals')
                .select('id, ticker, confidence_score, ta_snapshot, signal_type, created_at, stop_loss, target_price, status, updated_at') as any)
                .eq('status', 'active')
                .order('created_at', { ascending: true });

            if (error || !activeSignals) {
                console.warn('[ReEval] Failed to fetch active signals:', error);
                return { processed: 0, downgraded: 0, closed: 0, upgraded: 0, results: [] };
            }

            for (const signal of activeSignals as any[]) {
                const createdAt = new Date(signal.created_at).getTime();
                const updatedAt = new Date(signal.updated_at || signal.created_at).getTime();
                const now = Date.now();
                const hoursActive = (now - createdAt) / (1000 * 60 * 60);
                const hoursSinceUpdate = (now - updatedAt) / (1000 * 60 * 60);

                // Re-evaluate at 24h and 72h marks (only if not recently re-evaluated)
                const shouldReEval = (hoursActive >= 24 && hoursSinceUpdate >= 20) ||
                                     (hoursActive >= 72 && hoursSinceUpdate >= 44);

                if (!shouldReEval) continue;

                try {
                    const result = await this.reEvaluateSignal(signal);
                    results.push(result);

                    switch (result.action) {
                        case 'downgraded': downgraded++; break;
                        case 'closed': closed++; break;
                        case 'upgraded': upgraded++; break;
                    }
                } catch (err) {
                    console.warn(`[ReEval] Failed for ${signal.ticker}:`, err);
                }
            }

            if (results.length > 0) {
                console.log(`[ReEval] Processed ${results.length} signals: ${downgraded} downgraded, ${closed} closed, ${upgraded} upgraded.`);
            }

            return {
                processed: results.length,
                downgraded,
                closed,
                upgraded,
                results,
            };
        } catch (err) {
            console.error('[ReEval] Error:', err);
            return { processed: 0, downgraded: 0, closed: 0, upgraded: 0, results: [] };
        }
    }

    /**
     * Re-evaluate a single signal by comparing original TA snapshot with current.
     */
    private static async reEvaluateSignal(signal: any): Promise<ReEvalResult> {
        const ticker = signal.ticker;
        const originalTa: TASnapshot | null = signal.ta_snapshot;
        const originalConfidence = signal.confidence_score;
        let newConfidence = originalConfidence;
        const taChanges: TAChange[] = [];
        let action: ReEvalResult['action'] = 'unchanged';
        const reasons: string[] = [];

        // 1. Fetch current TA snapshot
        let currentTa: TASnapshot | null = null;
        try {
            currentTa = await TechnicalAnalysisService.getSnapshot(ticker);
        } catch {
            return {
                signalId: signal.id,
                ticker,
                action: 'unchanged',
                reason: 'Could not fetch current TA data.',
                oldConfidence: originalConfidence,
                newConfidence: originalConfidence,
                taChanges: [],
            };
        }

        // 2. Fetch current price to check stop-loss and target
        let currentPrice: number | null = null;
        try {
            const quote = await MarketDataService.getQuote(ticker);
            currentPrice = quote?.price ?? null;
        } catch { /* non-fatal */ }

        // 3. Check if price hit stop-loss → close signal
        if (currentPrice && signal.stop_loss && currentPrice <= signal.stop_loss) {
            await supabase.from('signals').update({
                status: 'stopped_out',
                user_notes: `[Auto-closed] Price $${currentPrice.toFixed(2)} hit stop-loss $${signal.stop_loss.toFixed(2)}.`,
                updated_at: new Date().toISOString(),
            } as any).eq('id', signal.id);

            return {
                signalId: signal.id,
                ticker,
                action: 'closed',
                reason: `Price $${currentPrice.toFixed(2)} hit stop-loss $${signal.stop_loss.toFixed(2)}.`,
                oldConfidence: originalConfidence,
                newConfidence: 0,
                taChanges: [],
            };
        }

        // 4. Check if price hit target → close signal as target_hit
        if (currentPrice && signal.target_price && currentPrice >= signal.target_price) {
            await supabase.from('signals').update({
                status: 'target_hit',
                user_notes: `[Auto-closed] Price $${currentPrice.toFixed(2)} hit target $${signal.target_price.toFixed(2)}.`,
                updated_at: new Date().toISOString(),
            } as any).eq('id', signal.id);

            return {
                signalId: signal.id,
                ticker,
                action: 'closed',
                reason: `Price $${currentPrice.toFixed(2)} hit target $${signal.target_price.toFixed(2)}.`,
                oldConfidence: originalConfidence,
                newConfidence: originalConfidence,
                taChanges: [],
            };
        }

        if (!currentTa || !originalTa) {
            return {
                signalId: signal.id,
                ticker,
                action: 'unchanged',
                reason: 'Missing TA data for comparison.',
                oldConfidence: originalConfidence,
                newConfidence: originalConfidence,
                taChanges: [],
            };
        }

        // 5. Compare RSI — did it move from oversold to neutral/overbought?
        if (originalTa.rsi14 !== null && currentTa.rsi14 !== null) {
            const rsiDelta = currentTa.rsi14 - originalTa.rsi14;
            taChanges.push({
                indicator: 'RSI',
                previous: originalTa.rsi14,
                current: currentTa.rsi14,
                impact: Math.abs(rsiDelta) < 10 ? 'neutral' : (rsiDelta > 0 ? 'negative' : 'positive'),
            });

            // Long signal: RSI was oversold (<35), now neutral (>50) — thesis weakening
            if (signal.signal_type?.includes('long') && originalTa.rsi14 < 35 && currentTa.rsi14 > 50) {
                newConfidence -= 15;
                reasons.push(`RSI recovered from ${originalTa.rsi14.toFixed(0)} to ${currentTa.rsi14.toFixed(0)} — oversold thesis weakened`);
            }
            // Long signal: RSI pushed further into oversold — thesis strengthening
            if (signal.signal_type?.includes('long') && currentTa.rsi14 < originalTa.rsi14 && currentTa.rsi14 < 30) {
                newConfidence += 5;
                reasons.push(`RSI deepened to ${currentTa.rsi14.toFixed(0)} — oversold thesis strengthened`);
            }
        }

        // 6. Compare volume — did volume dry up?
        if (originalTa.volumeRatio !== null && currentTa.volumeRatio !== null) {
            taChanges.push({
                indicator: 'Volume Ratio',
                previous: originalTa.volumeRatio,
                current: currentTa.volumeRatio,
                impact: currentTa.volumeRatio < 0.5 ? 'negative' : 'neutral',
            });

            if (originalTa.volumeRatio > 1.5 && currentTa.volumeRatio < 0.5) {
                newConfidence -= 10;
                reasons.push(`Volume dried up: ${originalTa.volumeRatio.toFixed(1)}x → ${currentTa.volumeRatio.toFixed(1)}x`);
            }
        }

        // 7. Compare trend direction
        if (originalTa.trendDirection !== currentTa.trendDirection) {
            taChanges.push({
                indicator: 'Trend',
                previous: originalTa.trendDirection,
                current: currentTa.trendDirection,
                impact: currentTa.trendDirection === 'bearish' ? 'negative' : 'positive',
            });

            if (signal.signal_type?.includes('long') && currentTa.trendDirection === 'bearish') {
                newConfidence -= 15;
                reasons.push(`Trend reversed from ${originalTa.trendDirection} to bearish`);
            }
            if (signal.signal_type?.includes('long') && currentTa.trendDirection === 'bullish' && originalTa.trendDirection !== 'bullish') {
                newConfidence += 10;
                reasons.push(`Trend shifted to bullish — confirming thesis`);
            }
        }

        // 8. Compare MACD
        if (originalTa.macd && currentTa.macd) {
            const originalHist = originalTa.macd.histogram;
            const currentHist = currentTa.macd.histogram;
            if (originalHist < 0 && currentHist > 0) {
                newConfidence += 5;
                reasons.push(`MACD histogram crossed positive`);
            } else if (originalHist > 0 && currentHist < 0) {
                newConfidence -= 10;
                reasons.push(`MACD histogram crossed negative`);
            }
        }

        // 9. Clamp confidence
        newConfidence = Math.max(20, Math.min(100, newConfidence));

        // 10. Determine action
        const confidenceDelta = newConfidence - originalConfidence;
        if (newConfidence < 35) {
            action = 'closed';
            reasons.push(`Confidence dropped to ${newConfidence} — thesis invalidated`);

            await supabase.from('signals').update({
                status: 'expired',
                confidence_score: newConfidence,
                ta_snapshot: currentTa,
                user_notes: `[Re-evaluated] ${reasons.join('. ')}.`,
                updated_at: new Date().toISOString(),
            } as any).eq('id', signal.id);

        } else if (confidenceDelta <= -10) {
            action = 'downgraded';

            await supabase.from('signals').update({
                confidence_score: newConfidence,
                ta_snapshot: currentTa,
                user_notes: `[Re-evaluated] Confidence ${originalConfidence}→${newConfidence}: ${reasons.join('. ')}.`,
                updated_at: new Date().toISOString(),
            } as any).eq('id', signal.id);

        } else if (confidenceDelta >= 5) {
            action = 'upgraded';

            await supabase.from('signals').update({
                confidence_score: newConfidence,
                ta_snapshot: currentTa,
                user_notes: `[Re-evaluated] Confidence ${originalConfidence}→${newConfidence}: ${reasons.join('. ')}.`,
                updated_at: new Date().toISOString(),
            } as any).eq('id', signal.id);
        } else {
            // Mark as re-evaluated even if unchanged
            await supabase.from('signals').update({
                updated_at: new Date().toISOString(),
            } as any).eq('id', signal.id);
        }

        return {
            signalId: signal.id,
            ticker,
            action,
            reason: reasons.length > 0 ? reasons.join('. ') : 'No material TA changes detected.',
            oldConfidence: originalConfidence,
            newConfidence,
            taChanges,
        };
    }
}
