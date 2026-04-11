/**
 * Sentinel — Conditional Self-Consistency Harness
 *
 * Background
 * ----------
 * LLM "confidence" in a single sample is noisy. Research (Wang et al. 2022,
 * "Self-Consistency Improves Chain of Thought Reasoning") shows that sampling
 * multiple reasoning paths and aggregating is one of the strongest zero-
 * training-data accuracy levers — *especially* on borderline decisions.
 *
 * Unconditional self-consistency triples API spend. This module implements
 * *conditional* self-consistency: only when the primary agent's first-sample
 * confidence lands in an uncertainty band does the scanner fire extra samples.
 * High-conviction and below-the-gate signals pass through unchanged.
 *
 * Behavior
 * --------
 *   1. First sample is the normal agent call (temperature ~0.4).
 *   2. If confidence is outside [ZONE_LOW, ZONE_HIGH] → passthrough, no cost.
 *   3. Otherwise fire N extra samples at a slightly higher temperature
 *      (0.6) in parallel via Promise.all.
 *   4. If any sample *disagrees on direction* (long/short/none) — abort.
 *      Ambiguous direction means the signal is unreliable at face value.
 *   5. Otherwise pick the sample whose confidence is closest to the median
 *      and return it. Using a real sample (not an average) preserves the
 *      thesis/reasoning coherence that averaging would destroy.
 *
 * Dry-run mode
 * ------------
 * When the env flag `SELF_CONSISTENCY_DRY_RUN === 'true'` is set, re-runs
 * still happen and all disagreement data is logged, but the original first
 * sample is returned unchanged and abort is NOT enforced. This lets operators
 * observe the agreement distribution on live traffic before committing to the
 * cost in production.
 *
 * Usage
 * -----
 *   const consistency = await runPrimaryWithSelfConsistency({
 *     firstSample: analysis,
 *     rerun: () => AgentService.evaluateOverreaction({ ...input, temperature: 0.6 }),
 *     extractConfidence: (d) => d.confidence_score,
 *     extractDirection: (d) => d.is_overreaction ? 'long' : 'none',
 *     tag: `${ev.ticker}/${signalType}`,
 *   });
 *   if (consistency.abort) continue;
 *   analysis = consistency.finalSample;
 */

import type { AgentResult } from '@/types/agents';

/** Lower bound of the uncertainty zone where we invoke self-consistency. */
export const SELF_CONSISTENCY_ZONE_LOW = 55;
/** Upper bound of the uncertainty zone (inclusive). Above this, passthrough. */
export const SELF_CONSISTENCY_ZONE_HIGH = 78;
/** Extra samples fired when inside the zone (total calls = 1 + this). */
export const SELF_CONSISTENCY_EXTRA_SAMPLES = 2;
/** Temperature used for the extra samples. */
export const SELF_CONSISTENCY_TEMP = 0.6;

export type AgentDirection = 'long' | 'short' | 'none';

export interface SelfConsistencyInput<T> {
    firstSample: AgentResult<T>;
    rerun: () => Promise<AgentResult<T>>;
    extractConfidence: (d: T) => number;
    extractDirection: (d: T) => AgentDirection;
    /** Tag for logging — e.g. "NVDA/long_overreaction". */
    tag: string;
}

export interface SelfConsistencyOutput<T> {
    /** The sample to use going forward. In passthrough or dry-run, same as firstSample. */
    finalSample: AgentResult<T>;
    /** True when scanner should skip this signal entirely (directional disagreement, live mode only). */
    abort: boolean;
    abortReason?: string;
    /** All samples collected (1 if passthrough, 1+N otherwise). */
    samples: Array<AgentResult<T>>;
    /** True if re-runs were performed (confidence was in the zone). */
    reran: boolean;
    /** True if dry-run mode is active (SELF_CONSISTENCY_DRY_RUN=true). */
    dryRun: boolean;
}

/** Cheap env-flag read for Vite browser builds (tests inject via import.meta.env too). */
function isDryRun(): boolean {
    try {
        if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SELF_CONSISTENCY_DRY_RUN === 'true') {
            return true;
        }
    } catch { /* not in module context */ }
    return false;
}

/** Median of an odd/even-length number array. */
function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        const lo = sorted[mid - 1] ?? 0;
        const hi = sorted[mid] ?? 0;
        return (lo + hi) / 2;
    }
    return sorted[mid] ?? 0;
}

export async function runPrimaryWithSelfConsistency<T>(
    input: SelfConsistencyInput<T>,
): Promise<SelfConsistencyOutput<T>> {
    const { firstSample, rerun, extractConfidence, extractDirection, tag } = input;
    const dryRun = isDryRun();

    // Passthrough short-circuits: failed primary, or confidence outside the zone.
    if (!firstSample.success || !firstSample.data) {
        return { finalSample: firstSample, abort: false, samples: [firstSample], reran: false, dryRun };
    }

    const firstConfidence = extractConfidence(firstSample.data);
    if (firstConfidence < SELF_CONSISTENCY_ZONE_LOW || firstConfidence > SELF_CONSISTENCY_ZONE_HIGH) {
        return { finalSample: firstSample, abort: false, samples: [firstSample], reran: false, dryRun };
    }

    // Inside the uncertainty zone — fire N extra samples in parallel.
    const rerunPromises: Array<Promise<AgentResult<T>>> = [];
    for (let i = 0; i < SELF_CONSISTENCY_EXTRA_SAMPLES; i++) {
        rerunPromises.push(rerun());
    }

    let extraSamples: Array<AgentResult<T>>;
    try {
        extraSamples = await Promise.all(rerunPromises);
    } catch (err: any) {
        // If any rerun throws, fall back to first sample. Not fatal.
        console.warn(`[SelfConsistency] ${tag}: rerun failed, falling back to first sample:`, err?.message || err);
        return { finalSample: firstSample, abort: false, samples: [firstSample], reran: true, dryRun };
    }

    const allSamples: Array<AgentResult<T>> = [firstSample, ...extraSamples];
    const successfulSamples = allSamples.filter(s => s.success && s.data);

    // If half or more of the extra samples failed, passthrough. Don't penalize.
    if (successfulSamples.length < 2) {
        console.warn(`[SelfConsistency] ${tag}: only ${successfulSamples.length} successful samples, passthrough`);
        return { finalSample: firstSample, abort: false, samples: allSamples, reran: true, dryRun };
    }

    const confidences = successfulSamples.map(s => extractConfidence(s.data as T));
    const directions = successfulSamples.map(s => extractDirection(s.data as T));

    // Directional-disagreement check: if any successful sample disagrees with the first sample,
    // the signal is ambiguous. Abort in live mode; warn only in dry-run.
    const firstDirection = directions[0];
    const anyDisagreement = directions.some(d => d !== firstDirection);

    if (anyDisagreement) {
        const confStr = confidences.map(c => Math.round(c)).join(',');
        const dirStr = directions.join(',');
        if (dryRun) {
            console.log(`[SelfConsistency DRY-RUN] ${tag}: DISAGREEMENT confidences=[${confStr}] directions=[${dirStr}] (would abort)`);
            return { finalSample: firstSample, abort: false, samples: allSamples, reran: true, dryRun };
        }
        console.warn(`[SelfConsistency] ${tag}: ABORT directional disagreement confidences=[${confStr}] directions=[${dirStr}]`);
        return {
            finalSample: firstSample,
            abort: true,
            abortReason: `directional disagreement (${dirStr})`,
            samples: allSamples,
            reran: true,
            dryRun,
        };
    }

    // Agreement — pick the sample whose confidence is closest to the median.
    const med = median(confidences);
    let bestIdx = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < successfulSamples.length; i++) {
        const conf = confidences[i] ?? 0;
        const delta = Math.abs(conf - med);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestIdx = i;
        }
    }
    const medianSample = successfulSamples[bestIdx] ?? firstSample;

    const confStr = confidences.map(c => Math.round(c)).join(',');
    if (dryRun) {
        console.log(`[SelfConsistency DRY-RUN] ${tag}: agree confidences=[${confStr}] median=${Math.round(med)} (first sample kept)`);
        return { finalSample: firstSample, abort: false, samples: allSamples, reran: true, dryRun };
    }

    console.log(`[SelfConsistency] ${tag}: agree confidences=[${confStr}] median=${Math.round(med)} → using sample ${bestIdx}`);
    return { finalSample: medianSample, abort: false, samples: allSamples, reran: true, dryRun };
}
