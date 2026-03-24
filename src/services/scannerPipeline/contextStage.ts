/**
 * Scanner Pipeline — Context Building Stage
 *
 * Gathers all pre-scan context: performance history, reflection lessons,
 * calibration feedback, market regime, fear & greed, sector rotation,
 * adaptive thresholds, signal decay/re-eval, and auto-learning weights.
 *
 * Extracted from ScannerService.runScan() steps 3a–3g.
 */

import { supabase } from '@/config/supabase';
import { GoogleNewsService } from '../googleNews';
import { RedditSentimentService } from '../redditSentiment';
import { performanceStats } from '../performanceStats';
import { ReflectionAgent } from '../reflectionAgent';
import { ConfidenceCalibrator } from '../confidenceCalibrator';
import { MarketRegimeFilter, type MarketRegimeResult } from '../marketRegime';
import { SectorRotationService, type SectorRotationSnapshot } from '../sectorRotation';
import { AdaptiveThresholds } from '../adaptiveThresholds';
import { DynamicCalibrator } from '../dynamicCalibrator';
import { SignalDecayEngine } from '../signalDecay';
import { SignalReEvaluator } from '../signalReEvaluator';
import { AutoLearningService } from '../autoLearningService';
import { DEFAULT_MIN_CONFIDENCE, DEFAULT_MIN_PRICE_DROP_PCT } from '@/config/constants';

/** Output of the context-building stage */
export interface ScanContext {
    perfContext: string;
    regimeResult: MarketRegimeResult | null;
    regimeCtx: string;
    fearGreedScore: number | undefined;
    fearGreedRating: string | undefined;
    sectorRotationCtx: string;
    rotationSnapshot: SectorRotationSnapshot | null;
    adaptiveMinConfidence: number;
    adaptiveMinPriceDrop: number;
    autoLearnWeights: Record<string, number>;
}

/**
 * Fetch external news + sentiment for the top tickers (step 3a).
 */
export async function fetchExternalSentiment(tickers: string[]): Promise<void> {
    try {
        const headTickers = tickers.slice(0, 5);
        await Promise.allSettled([
            GoogleNewsService.fetchAndCacheNews(headTickers),
            RedditSentimentService.fetchAndCacheSentiment(headTickers),
        ]);
    } catch (extErr) {
        console.warn('[Scanner] External sentiment fetch failed (non-fatal):', extErr);
    }
}

/**
 * Build the full scan context — performance history, regime, thresholds, etc. (steps 3b–3g).
 */
export async function buildScanContext(): Promise<ScanContext> {
    // 3b. Performance context
    let perfContext = '';
    try {
        perfContext = await performanceStats.buildPerformanceContext();
        if (perfContext) {
            console.log('[Scanner] Performance context loaded for agent feedback loop.');
        } else {
            console.warn('[Scanner] Performance context is empty — agents running without historical calibration.');
        }
    } catch (perfErr) {
        console.warn('[Scanner] Failed to load performance context (non-fatal):', perfErr);
    }

    // 3c. Reflection Agent lessons (RAG loop)
    try {
        const lessons = await ReflectionAgent.getLessonsForContext();
        if (lessons) {
            perfContext += lessons;
            console.log('[Scanner] Reflection lessons injected into agent context.');
        } else {
            console.log('[Scanner] No reflection lessons available yet — run Reflection Agent after accumulating signal outcomes.');
        }
    } catch (reflErr) {
        console.warn('[Scanner] Failed to load reflection lessons (non-fatal):', reflErr);
    }

    // 3c-2. Calibration Feedback Loop
    try {
        const calibCurve = await ConfidenceCalibrator.getCachedCurve();
        const calibCtx = ConfidenceCalibrator.formatForPrompt(calibCurve);
        perfContext += calibCtx;
        if (calibCurve.totalOutcomes >= 10) {
            console.log(`[Scanner] Calibration feedback injected (${calibCurve.totalOutcomes} outcomes, ${calibCurve.overallWinRate}% win rate).`);
        }
    } catch (calibErr) {
        console.warn('[Scanner] Failed to load calibration feedback (non-fatal):', calibErr);
    }

    // 3d. Market Regime Detection
    let regimeResult: MarketRegimeResult | null = null;
    let regimeCtx = '';
    try {
        regimeResult = await MarketRegimeFilter.detect();
        regimeCtx = MarketRegimeFilter.formatForPrompt(regimeResult);
        // Set regime early so signal decay uses correct context from the start
        SignalDecayEngine.setRegime(regimeResult.regime);
        if (regimeResult.regime !== 'neutral') {
            console.log(`[Scanner] Market regime: ${regimeResult.regime.toUpperCase()} (penalty=${regimeResult.confidencePenalty})`);
        }
    } catch (regimeErr) {
        console.warn('[Scanner] Market regime detection failed (non-fatal):', regimeErr);
    }

    // 3d-1a. CNN Fear & Greed Index
    let fearGreedScore: number | undefined;
    let fearGreedRating: string | undefined;
    try {
        const { data: fgData, error: fgErr } = await supabase.functions.invoke('proxy-fear-greed');
        if (!fgErr && fgData && typeof fgData.score === 'number') {
            fearGreedScore = Math.round(fgData.score);
            fearGreedRating = fgData.rating || 'Neutral';
            console.log(`[Scanner] CNN Fear & Greed: ${fearGreedScore} (${fearGreedRating})`);
        }
    } catch (fgErr) {
        console.warn('[Scanner] Fear & Greed fetch failed (non-fatal):', fgErr);
    }

    // 3d-1b. Sector Rotation
    let sectorRotationCtx = '';
    let rotationSnapshot: SectorRotationSnapshot | null = null;
    try {
        rotationSnapshot = await SectorRotationService.getRotationSnapshot();
        sectorRotationCtx = SectorRotationService.formatForPrompt(rotationSnapshot);
        if (rotationSnapshot.regime !== 'neutral') {
            console.log(`[Scanner] Sector rotation: ${rotationSnapshot.regime.toUpperCase()} — ${rotationSnapshot.regimeReason}`);
        }
    } catch (rotErr) {
        console.warn('[Scanner] Sector rotation detection failed (non-fatal):', rotErr);
    }

    // 3d-2. Adaptive Thresholds
    let adaptiveMinConfidence = DEFAULT_MIN_CONFIDENCE;
    let adaptiveMinPriceDrop = DEFAULT_MIN_PRICE_DROP_PCT;
    try {
        const thresholds = await AdaptiveThresholds.getThresholds();
        adaptiveMinConfidence = thresholds.minConfidence;
        adaptiveMinPriceDrop = thresholds.minPriceDropPct;
        console.log(`[Scanner] Adaptive thresholds: minDrop=${thresholds.minPriceDropPct}%, minConf=${thresholds.minConfidence} (${thresholds.regime})`);
    } catch { /* non-fatal, use defaults */ }

    // 3d-3. Dynamic Calibration
    try {
        await DynamicCalibrator.refitIfNeeded();
    } catch { /* non-fatal */ }

    // 3e. Signal Decay
    try {
        const decayResult = await SignalDecayEngine.processActiveSignals();
        if (decayResult.expired > 0 || decayResult.stale > 0) {
            console.log(`[Scanner] Signal decay: ${decayResult.expired} expired, ${decayResult.stale} stale out of ${decayResult.processed} active.`);
        }
    } catch (decayErr) {
        console.warn('[Scanner] Signal decay processing failed (non-fatal):', decayErr);
    }

    // 3f. Signal Re-Evaluation
    try {
        const reEvalResult = await SignalReEvaluator.reEvaluateActiveSignals();
        if (reEvalResult.processed > 0) {
            console.log(`[Scanner] Signal re-evaluation: ${reEvalResult.downgraded} downgraded, ${reEvalResult.closed} closed, ${reEvalResult.upgraded} upgraded out of ${reEvalResult.processed} checked.`);
        }
    } catch (reEvalErr) {
        console.warn('[Scanner] Signal re-evaluation failed (non-fatal):', reEvalErr);
    }

    // 3g. Auto-Learning weights
    let autoLearnWeights: Record<string, number> = {};
    try {
        autoLearnWeights = await AutoLearningService.getWeights();
        if (Object.keys(autoLearnWeights).length > 0) {
            console.log(`[Scanner] Auto-learning weights loaded: ${Object.entries(autoLearnWeights).map(([k, v]) => `${k}=${v}`).join(', ')}`);
        }
    } catch (alErr) {
        console.warn('[Scanner] Auto-learning weights load failed (non-fatal):', alErr);
    }

    return {
        perfContext,
        regimeResult,
        regimeCtx,
        fearGreedScore,
        fearGreedRating,
        sectorRotationCtx,
        rotationSnapshot,
        adaptiveMinConfidence,
        adaptiveMinPriceDrop,
        autoLearnWeights,
    };
}
