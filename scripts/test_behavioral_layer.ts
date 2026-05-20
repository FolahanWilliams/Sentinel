/**
 * Sentinel — Behavioral Layer Integration Test
 *
 * Runs the runBehavioralLayer() orchestrator with mocked sub-agents to verify
 * the gate, soft-adjustment, and partial-failure semantics WITHOUT hitting
 * the live Gemini proxy.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/test_behavioral_layer.ts
 *
 * Mocking approach: we reassign the static `.simulate` / `.analyze` methods
 * on each agent class after import — ES module bindings forbid replacing the
 * import itself, but properties on the exported class object are mutable.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
    OtherMindResult,
    NarrativeLifecycleResult,
    CohortSequenceResult,
} from '../src/types/agents';

// Load .env.local into process.env BEFORE importing src/ modules — env.ts
// reads its config at module init.
(function loadEnvLocal() {
    try {
        const text = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
            if (!m) continue;
            const [, k, rawV] = m;
            const v = rawV.replace(/^['"]|['"]$/g, '').trim();
            if (!(k in process.env)) process.env[k] = v;
        }
    } catch { /* optional */ }
})();

// Dynamic imports so .env.local is loaded first
const { OtherMindAgent } = await import('../src/services/otherMindAgent');
const { NarrativeLifecycleAgent } = await import('../src/services/narrativeLifecycleAgent');
const { CohortSequencerAgent } = await import('../src/services/cohortSequencer');
const { runBehavioralLayer } = await import('../src/services/behavioralLayer');
const { OTHER_MIND_MIN_EDGE_CLARITY } = await import('../src/config/constants');
type BehavioralLayerInput = import('../src/services/behavioralLayer').BehavioralLayerInput;

// ── Mock factory helpers ───────────────────────────────────────────────────

function mockOtherMind(overrides: Partial<OtherMindResult> = {}): OtherMindResult {
    return {
        reasoning: 'mock',
        counterparty_cohort: 'retail_yolo',
        counterparty_latency: 'hours',
        counterparty_dominant_bias: 'recency bias',
        counterparty_trigger: 'headline shock',
        counterparty_best_case: 'they could be right if growth re-accelerates',
        counterparty_weakness: 'ignored buyback dilution',
        correction_catalyst: 'next earnings',
        correction_window_days: 14,
        edge_clarity: 80,
        emit_recommendation: 'emit',
        ...overrides,
    };
}

function mockNarrative(overrides: Partial<NarrativeLifecycleResult> = {}): NarrativeLifecycleResult {
    return {
        reasoning: 'mock',
        dominant_narrative: 'AI capex slowdown',
        lifecycle_phase: 'early_amplification',
        narrative_age_days: 4,
        mentions_last_14d: 12,
        marginal_new_info_rate: 60,
        saturation_score: 30,
        direction_pressure: 'long_supportive',
        confidence_adjustment: 0,
        ...overrides,
    };
}

function mockCohort(overrides: Partial<CohortSequenceResult> = {}): CohortSequenceResult {
    return {
        reasoning: 'mock',
        reaction_sequence: [],
        primary_mispricer: 'retail_yolo',
        sequence_stage: 'first_wave',
        correction_catalyst: 'macro print Thursday',
        confidence_in_sequence: 70,
        confidence_adjustment: 0,
        ...overrides,
    };
}

function installMocks(opts: {
    otherMind?: OtherMindResult | (() => Promise<OtherMindResult>) | Error;
    narrative?: NarrativeLifecycleResult | Error;
    cohort?: CohortSequenceResult | Error;
}) {
    OtherMindAgent.simulate = async () => {
        if (opts.otherMind instanceof Error) throw opts.otherMind;
        if (typeof opts.otherMind === 'function') return await opts.otherMind();
        return opts.otherMind ?? mockOtherMind();
    };
    NarrativeLifecycleAgent.analyze = async () => {
        if (opts.narrative instanceof Error) throw opts.narrative;
        return opts.narrative ?? mockNarrative();
    };
    CohortSequencerAgent.analyze = async () => {
        if (opts.cohort instanceof Error) throw opts.cohort;
        return opts.cohort ?? mockCohort();
    };
}

const baseInput: BehavioralLayerInput = {
    ticker: 'TEST',
    signalType: 'overreaction',
    direction: 'long',
    thesis: 'Mocked thesis for testing',
    reasoning: 'Mocked reasoning',
    eventHeadline: 'Mocked headline',
    eventDesc: 'Mocked event description',
    priceChangePct: -5.2,
};

// ── Assertion helpers ──────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean, detail?: string) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${label}`);
    } else {
        failed++;
        const msg = detail ? `${label} — ${detail}` : label;
        failures.push(msg);
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

// ── Scenarios ──────────────────────────────────────────────────────────────

async function scenario1_BlockOnSuppress() {
    console.log('\n[Scenario 1] Block on suppress recommendation');
    installMocks({
        otherMind: mockOtherMind({ edge_clarity: 90, emit_recommendation: 'suppress' }),
    });
    const r = await runBehavioralLayer(baseInput);
    assert('blocked === true', r.emitBlock.blocked === true);
    assert('block reason mentions suppress', !!r.emitBlock.reason?.includes('suppress'));
    assert('otherMind populated', r.otherMind !== null);
}

async function scenario2_BlockOnLowClarity() {
    console.log('\n[Scenario 2] Block on low edge_clarity (below OTHER_MIND_MIN_EDGE_CLARITY)');
    installMocks({
        otherMind: mockOtherMind({ edge_clarity: OTHER_MIND_MIN_EDGE_CLARITY - 10, emit_recommendation: 'emit' }),
    });
    const r = await runBehavioralLayer(baseInput);
    assert('blocked === true', r.emitBlock.blocked === true);
    assert('block reason mentions edge_clarity', !!r.emitBlock.reason?.includes('edge_clarity'));
}

async function scenario3_PassThrough() {
    console.log('\n[Scenario 3] Emit pass-through (high clarity, emit recommendation)');
    installMocks({
        otherMind: mockOtherMind({ edge_clarity: 85, emit_recommendation: 'emit' }),
        narrative: mockNarrative({ confidence_adjustment: 0 }),
        cohort: mockCohort({ confidence_adjustment: 0 }),
    });
    const r = await runBehavioralLayer(baseInput);
    assert('blocked === false', r.emitBlock.blocked === false);
    assert('totalAdjustment === 0', r.totalAdjustment === 0, `got ${r.totalAdjustment}`);
}

async function scenario4_NarrativeAdjustment() {
    console.log('\n[Scenario 4] Narrative-only soft adjustment');
    installMocks({
        otherMind: mockOtherMind({ edge_clarity: 85, emit_recommendation: 'emit' }),
        narrative: mockNarrative({ confidence_adjustment: 7 }),
        cohort: mockCohort({ confidence_adjustment: 0 }),
    });
    const r = await runBehavioralLayer(baseInput);
    assert('blocked === false', r.emitBlock.blocked === false);
    assert('totalAdjustment === 7', r.totalAdjustment === 7, `got ${r.totalAdjustment}`);
}

async function scenario5_CombinedAdjustments() {
    console.log('\n[Scenario 5] Narrative + cohort adjustments sum correctly');
    installMocks({
        otherMind: mockOtherMind({ edge_clarity: 85, emit_recommendation: 'emit' }),
        narrative: mockNarrative({ confidence_adjustment: 5 }),
        cohort: mockCohort({ confidence_adjustment: -3 }),
    });
    const r = await runBehavioralLayer(baseInput);
    assert('totalAdjustment === 2', r.totalAdjustment === 2, `got ${r.totalAdjustment}`);
    assert('narrative result captured', r.narrative?.confidence_adjustment === 5);
    assert('cohort result captured', r.cohortSequence?.confidence_adjustment === -3);
}

async function scenario6_PartialFailure() {
    console.log('\n[Scenario 6] OtherMind throws — orchestrator returns null gate, no block');
    installMocks({
        otherMind: new Error('Simulated Gemini timeout'),
        narrative: mockNarrative({ confidence_adjustment: 4 }),
        cohort: mockCohort({ confidence_adjustment: -1 }),
    });
    const r = await runBehavioralLayer(baseInput);
    assert('otherMind === null', r.otherMind === null);
    assert('blocked === false (no gate without OtherMind)', r.emitBlock.blocked === false);
    assert('narrative + cohort still summed', r.totalAdjustment === 3, `got ${r.totalAdjustment}`);
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function main() {
    console.log('===  Behavioral Layer Integration Test  ===');
    console.log(`OTHER_MIND_MIN_EDGE_CLARITY = ${OTHER_MIND_MIN_EDGE_CLARITY}`);

    await scenario1_BlockOnSuppress();
    await scenario2_BlockOnLowClarity();
    await scenario3_PassThrough();
    await scenario4_NarrativeAdjustment();
    await scenario5_CombinedAdjustments();
    await scenario6_PartialFailure();

    console.log('\n─── Summary ───');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    if (failures.length > 0) {
        console.log('\nFailures:');
        for (const f of failures) console.log(`  - ${f}`);
        process.exit(1);
    }
    console.log('\nAll behavioral layer assertions passed.');
}

main().catch((err) => {
    console.error('Fatal error in test runner:', err);
    process.exit(1);
});
