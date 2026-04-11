/**
 * Sentinel — Behavioral Layer Orchestrator (Category-Defining)
 *
 * Runs three new Gemini agents IN PARALLEL via Promise.allSettled:
 *
 *   1. Other-Mind Simulation  — names the weak counterparty (HARD gate)
 *   2. Narrative Lifecycle    — phases the dominant story (SOFT adjust)
 *   3. Cohort Sequencer       — predicts temporal reaction order (SOFT adjust)
 *
 * This is the core doctrine shift: Sentinel stops reading news better than
 * the market and starts modeling the SPECIFIC mistakes of OTHER market
 * participants. Every signal that ships must name a weak counterparty, a
 * cognitive mechanism, and a correction catalyst — or it won't ship.
 *
 * Dry-run mode
 * ------------
 * Each of the three sub-agents has its own dry-run flag:
 *   - VITE_BEHAVIORAL_OTHER_MIND_DRY_RUN  — Other-Mind runs but doesn't gate
 *   - VITE_BEHAVIORAL_NARRATIVE_DRY_RUN    — Narrative runs but doesn't adjust
 *   - VITE_BEHAVIORAL_COHORT_DRY_RUN       — Cohort runs but doesn't adjust
 *
 * Dry-run flags let operators observe agent outputs on real traffic before
 * committing to the gating/adjustment side effects. Same pattern as
 * src/services/selfConsistency.ts.
 *
 * Non-fatal semantics
 * -------------------
 * Each sub-agent is wrapped in Promise.allSettled so a single failure does
 * not cascade. The orchestrator always returns a complete result object —
 * failed sub-agents contribute `null` and zero adjustment.
 */

import { OtherMindAgent, type OtherMindInput } from './otherMindAgent';
import { NarrativeLifecycleAgent, type NarrativeLifecycleInput } from './narrativeLifecycleAgent';
import { CohortSequencerAgent, type CohortSequencerInput } from './cohortSequencer';
import {
    OTHER_MIND_MIN_EDGE_CLARITY,
} from '@/config/constants';
import type {
    OtherMindResult,
    NarrativeLifecycleResult,
    CohortSequenceResult,
} from '@/types/agents';
import type { TASnapshot } from '@/types/signals';

export interface BehavioralLayerInput {
    ticker: string;
    signalType: string;
    direction: 'long' | 'short';
    thesis: string;
    reasoning: string;
    eventHeadline: string;
    eventDesc: string;
    priceChangePct: number;
    taSnapshot?: TASnapshot | null;
    marketRegime?: string;
    fearGreedScore?: number;
}

export interface BehavioralLayerResult {
    otherMind: OtherMindResult | null;
    narrative: NarrativeLifecycleResult | null;
    cohortSequence: CohortSequenceResult | null;
    /** Aggregated gate decision — the scanner uses this to decide whether to block. */
    emitBlock: { blocked: boolean; reason?: string };
    /** Sum of soft confidence adjustments (narrative + cohort). Other-Mind is pure gate, no adjustment. */
    totalAdjustment: number;
    /** Which sub-agents were in dry-run mode during this run. */
    dryRunFlags: { otherMind: boolean; narrative: boolean; cohort: boolean };
}

// ── Dry-run helpers ────────────────────────────────────────────────────────────

function readEnvFlag(name: string): boolean {
    // Vite env
    try {
        if (typeof import.meta !== 'undefined' && (import.meta as any).env?.[name] === 'true') {
            return true;
        }
    } catch { /* not in module context */ }
    // Node env (tests, scripts)
    try {
        if (typeof process !== 'undefined' && process?.env?.[name.replace(/^VITE_/, '')] === 'true') {
            return true;
        }
    } catch { /* no process global */ }
    return false;
}

function readDryRunFlags(): { otherMind: boolean; narrative: boolean; cohort: boolean } {
    return {
        otherMind: readEnvFlag('VITE_BEHAVIORAL_OTHER_MIND_DRY_RUN'),
        narrative: readEnvFlag('VITE_BEHAVIORAL_NARRATIVE_DRY_RUN'),
        cohort: readEnvFlag('VITE_BEHAVIORAL_COHORT_DRY_RUN'),
    };
}

// ── Main orchestrator ──────────────────────────────────────────────────────────

/**
 * Run the full behavioral layer for a signal.
 *
 * All three agents fire in parallel. Returns aggregated gate + adjustment so
 * the scanner integration is a single call. Failed sub-agents contribute null.
 */
export async function runBehavioralLayer(
    input: BehavioralLayerInput,
): Promise<BehavioralLayerResult> {
    const dryRunFlags = readDryRunFlags();
    const tag = `${input.ticker}/${input.signalType}`;

    // Build per-agent inputs once so we don't recompute inside each sub-agent.
    const otherMindInput: OtherMindInput = {
        ticker: input.ticker,
        signalType: input.signalType,
        direction: input.direction,
        thesis: input.thesis,
        reasoning: input.reasoning,
        eventHeadline: input.eventHeadline,
        priceChangePct: input.priceChangePct,
        marketRegime: input.marketRegime,
    };

    const narrativeInput: NarrativeLifecycleInput = {
        ticker: input.ticker,
        direction: input.direction,
        thesis: input.thesis,
        eventHeadline: input.eventHeadline,
    };

    const cohortInput: CohortSequencerInput = {
        ticker: input.ticker,
        direction: input.direction,
        thesis: input.thesis,
        eventHeadline: input.eventHeadline,
        eventDesc: input.eventDesc,
        priceChangePct: input.priceChangePct,
        taScore: input.taSnapshot?.taScore ?? null,
        volumeRatio: input.taSnapshot?.volumeRatio ?? null,
        marketRegime: input.marketRegime,
        fearGreedScore: input.fearGreedScore,
    };

    const startMs = Date.now();

    // Fire all three in parallel. Promise.allSettled so one failure doesn't
    // cascade — each sub-agent already falls back to a neutral result on error
    // but we still use allSettled as belt-and-suspenders.
    const [otherMindSettled, narrativeSettled, cohortSettled] = await Promise.allSettled([
        OtherMindAgent.simulate(otherMindInput),
        NarrativeLifecycleAgent.analyze(narrativeInput),
        CohortSequencerAgent.analyze(cohortInput),
    ]);

    const durationMs = Date.now() - startMs;

    const otherMind = otherMindSettled.status === 'fulfilled' ? otherMindSettled.value : null;
    const narrative = narrativeSettled.status === 'fulfilled' ? narrativeSettled.value : null;
    const cohortSequence = cohortSettled.status === 'fulfilled' ? cohortSettled.value : null;

    // ── Logging: every run emits structured lines per sub-agent ────────────
    if (otherMind) {
        const drTag = dryRunFlags.otherMind ? 'DRY-RUN' : 'LIVE';
        console.log(
            `[OtherMind ${drTag}] ${tag}: cohort=${otherMind.counterparty_cohort} ` +
            `bias="${otherMind.counterparty_dominant_bias}" ` +
            `catalyst="${otherMind.correction_catalyst}" ` +
            `edge_clarity=${otherMind.edge_clarity} rec=${otherMind.emit_recommendation}`
        );
    }
    if (narrative) {
        const drTag = dryRunFlags.narrative ? 'DRY-RUN' : 'LIVE';
        console.log(
            `[Narrative ${drTag}] ${tag}: phase=${narrative.lifecycle_phase} ` +
            `mentions=${narrative.mentions_last_14d} ` +
            `saturation=${narrative.saturation_score} ` +
            `adjustment=${narrative.confidence_adjustment}`
        );
    }
    if (cohortSequence) {
        const drTag = dryRunFlags.cohort ? 'DRY-RUN' : 'LIVE';
        console.log(
            `[CohortSequence ${drTag}] ${tag}: stage=${cohortSequence.sequence_stage} ` +
            `primary_mispricer=${cohortSequence.primary_mispricer} ` +
            `conf=${cohortSequence.confidence_in_sequence} ` +
            `adjustment=${cohortSequence.confidence_adjustment}`
        );
    }

    console.log(`[BehavioralLayer] ${tag} completed in ${durationMs}ms (otherMind=${!!otherMind}, narrative=${!!narrative}, cohort=${!!cohortSequence})`);

    // ── Gate decision (Other-Mind is the only hard gate) ───────────────────
    let emitBlock: { blocked: boolean; reason?: string } = { blocked: false };
    if (otherMind && !dryRunFlags.otherMind) {
        if (otherMind.emit_recommendation === 'suppress') {
            emitBlock = {
                blocked: true,
                reason: `OtherMind suppress (edge_clarity=${otherMind.edge_clarity}, cohort=${otherMind.counterparty_cohort})`,
            };
        } else if (otherMind.edge_clarity < OTHER_MIND_MIN_EDGE_CLARITY) {
            emitBlock = {
                blocked: true,
                reason: `OtherMind edge_clarity=${otherMind.edge_clarity} < ${OTHER_MIND_MIN_EDGE_CLARITY}`,
            };
        }
    }

    // ── Soft adjustments (Narrative + Cohort Sequencer) ────────────────────
    // Each sub-agent already bounded its own adjustment; we sum them here.
    // Skipped when the respective dry-run flag is set.
    let totalAdjustment = 0;
    if (narrative && !dryRunFlags.narrative) {
        totalAdjustment += narrative.confidence_adjustment;
    }
    if (cohortSequence && !dryRunFlags.cohort) {
        totalAdjustment += cohortSequence.confidence_adjustment;
    }

    return {
        otherMind,
        narrative,
        cohortSequence,
        emitBlock,
        totalAdjustment,
        dryRunFlags,
    };
}
