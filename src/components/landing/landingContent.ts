/**
 * landingContent — canonical source for the public landing + /about showcase.
 *
 * Both surfaces import from here so copy, agent definitions, audit fields, and
 * architecture counts can never drift between the two pages. When a pipeline
 * fact changes, edit it ONCE here.
 *
 * Discipline locks honoured:
 *  - Market-intelligence framing only (no enterprise / cross-domain naming).
 *  - The "applied elsewhere" angle stays generic — see APPLICATION_LAYER.
 *  - No performance numbers. Every figure below is an architecture/mechanism
 *    count that is verifiable from the codebase, never a live-trading claim.
 */

import { BIAS_TYPES } from '@/config/constants';
import { RSS_FEEDS } from '@/config/rssFeeds';

/** Counts computed from canonical sources so stats can't drift from the code. */
export const BIAS_COUNT = BIAS_TYPES.length;
export const FEED_COUNT = RSS_FEEDS.length;

export interface PipelineAgent {
    /** Display name (canonical pipeline order). */
    name: string;
    /** One-line role. */
    role: string;
    /** Longer description for the detailed /about cut. */
    detail: string;
    /** Hex accent from the sentinel semantic palette. */
    color: string;
    /** Short verdict-style tag rendered in the flow nodes. */
    tag: string;
}

/**
 * The 5-agent reasoning pipeline. Order is load-bearing: a signal flows through
 * each agent in sequence, and Red Team can kill it outright at the end.
 */
export const PIPELINE_AGENTS: PipelineAgent[] = [
    {
        name: 'Overreaction',
        role: 'Irrational move, or justified repricing?',
        detail:
            'Quantifies the gap between the market’s emotional response and fundamental reality — the core mispricing the rest of the pipeline pressure-tests.',
        color: '#3b82f6',
        tag: 'MISPRICING',
    },
    {
        name: 'Contagion',
        role: 'Isolated shock, or epicenter of a spread?',
        detail:
            'Maps cross-market spillover — whether the move is contained to one name or the leading edge of correlated contagion across a sector.',
        color: '#8b5cf6',
        tag: 'SPILLOVER',
    },
    {
        name: 'Catalyst',
        role: 'A catalyst the market hasn’t priced in?',
        detail:
            'Hunts the inverse failure mode: genuine catalysts the market has under-reacted to and not yet repriced.',
        color: '#10b981',
        tag: 'UNDER-REACTION',
    },
    {
        name: 'Earnings Guard',
        role: 'Is event risk about to swamp the edge?',
        detail:
            'Blocks theses exposed to imminent earnings or scheduled event risk large enough to overwhelm the signal, no matter how clean the setup looks.',
        color: '#f59e0b',
        tag: 'EVENT RISK',
    },
    {
        name: 'Red Team',
        role: 'Find the fatal flaw — or it ships.',
        detail:
            'An adversarial pass that mounts the strongest counter-thesis it can. A fatal flaw kills the signal outright — never downgraded to “advisory.” This is the structural difference from a normal signal generator.',
        color: '#ef4444',
        tag: 'KILL SWITCH',
    },
];

/** The two passes that run AFTER the agents reach a thesis. */
export const POST_PIPELINE_STAGES = [
    {
        name: 'Self-Critique',
        detail:
            'Every thesis is turned back on itself before it can score. Load-bearing — never skipped for latency.',
        color: '#06b6d4',
    },
    {
        name: 'Calibration',
        detail:
            'Raw model confidence is remapped against observed win rates via isotonic regression, so a “70%” means a measured 70%.',
        color: '#a855f7',
    },
];

/**
 * Representative audit-trail fields persisted on every signal. Not the full
 * schema — the visualisation renders these to show the shape of the record.
 */
export const AUDIT_TRAIL_FIELDS: { key: string; sample: string; kind: 'id' | 'price' | 'reason' | 'score' | 'outcome' }[] = [
    { key: 'signal_id', sample: '7c3a…9f', kind: 'id' },
    { key: 'timestamp_utc', sample: '2026-06-09T13:30Z', kind: 'id' },
    { key: 'ticker', sample: 'NVDA', kind: 'id' },
    { key: 'entry_price', sample: '118.42', kind: 'price' },
    { key: 'agent_reasoning_chain', sample: '5 agents · full text', kind: 'reason' },
    { key: 'bias_flags', sample: '[anchoring · sev 2]', kind: 'reason' },
    { key: 'noise_score', sample: '0.18 jury var.', kind: 'score' },
    { key: 'sqi', sample: '82 / 100', kind: 'score' },
    { key: 'confidence_raw', sample: '0.74', kind: 'score' },
    { key: 'confidence_calibrated', sample: '0.61', kind: 'score' },
    { key: 'calibration_version', sample: 'v7', kind: 'score' },
    { key: 'projected_rr', sample: '2.8R', kind: 'price' },
    { key: 'outcome_1d / 5d / 10d / 30d', sample: 'tracked', kind: 'outcome' },
    { key: 'post_mortem_narrative', sample: 'on window close', kind: 'outcome' },
];

/** Architecture / mechanism counts. All verifiable from the codebase. */
export interface ArchStat {
    value: number;
    suffix?: string;
    label: string;
    sub: string;
}

export const ARCHITECTURE_STATS: ArchStat[] = [
    { value: 5, label: 'Reasoning agents', sub: 'sequential, adversarial pipeline' },
    { value: BIAS_COUNT, label: 'Cognitive biases classified', sub: 'severity-scored, with passage refs' },
    { value: 8, label: 'Corroborating sources', sub: 'cross-checked per signal (SQI)' },
    { value: FEED_COUNT, label: 'Live intelligence feeds', sub: 'scanned continuously' },
];

/** Extra depth stats surfaced only on the /about builder cut. */
export const BUILDER_STATS: ArchStat[] = [
    { value: 70, suffix: '+', label: 'Specialized services', sub: 'typed, composable' },
    { value: 13, label: 'Edge functions', sub: 'rate-limited AI + data plane' },
    { value: 200, label: 'Trade reference class', sub: 'matched for recognition-primed recall' },
    { value: 1, label: 'Calibration engine', sub: 'isotonic regression, versioned' },
];

/** Cognitive failure modes — sampled for the problem-section marquee. */
export const BIAS_SAMPLES = [
    'anchoring', 'confirmation', 'recency', 'loss aversion', 'sunk cost',
    'herding', 'overconfidence', 'narrative fallacy', 'availability',
    'disposition effect', 'hindsight', 'survivorship',
];

/** Three-layer narrative — the investor/peer story, kept generic at layer 3. */
export const THREE_LAYER = {
    problem: {
        title: 'The universal problem',
        body: 'Every decision under uncertainty is degraded by the same cognitive failure modes — anchoring, herding, overconfidence, narrative fallacy. They are invisible from the inside, and they compound silently.',
    },
    proof: {
        title: 'The live proof',
        body: 'Markets are the fast-feedback proving ground: every thesis is timestamped, reasoned in full, scored, and graded against the tape at fixed windows. The audit trail is out-of-sample by construction — it starts the day the signal fires, not in a backtest.',
    },
    application: {
        title: 'The same engine, applied elsewhere',
        body: 'The reasoning-audit mechanism is domain-agnostic. Trading is where it is proven in public; the underlying engine generalises to any high-stakes decision that deserves the same scrutiny.',
    },
};

export const APPLICATION_LAYER = THREE_LAYER.application;

/**
 * Principles → operationalized. Each fundamental decision-science principle and
 * the concrete mechanism in the codebase that puts it to work. `icon` is a key
 * mapped to a lucide icon in the renderer. Every mechanism here is real and
 * verifiable from src/services.
 */
export interface Principle {
    icon: string;
    color: string;
    principle: string;
    lineage: string;
    mechanism: string;
    output: string;
}

export const PRINCIPLES: Principle[] = [
    {
        icon: 'brain',
        color: '#ef4444',
        principle: 'Cognitive bias',
        lineage: 'Kahneman & Tversky',
        mechanism: `Every thesis is scanned against a ${BIAS_COUNT}-point bias classification, each flag severity-rated 1–3.`,
        output: 'Up to −25 confidence, tagged with the passage that triggered it',
    },
    {
        icon: 'waves',
        color: '#8b5cf6',
        principle: 'Noise',
        lineage: 'Kahneman · “Noise” (2021)',
        mechanism: 'Three judges score the same thesis at rising temperatures; their disagreement is measured directly.',
        output: 'Jury variance → penalty when they diverge, boost when they converge',
    },
    {
        icon: 'skull',
        color: '#f59e0b',
        principle: 'Pre-mortem',
        lineage: 'Gary Klein',
        mechanism: 'A dedicated pass assumes the trade has already failed and works backward to find why.',
        output: 'Three failure modes + a fragile / moderate / resilient rating',
    },
    {
        icon: 'history',
        color: '#3b82f6',
        principle: 'Reference-class forecasting',
        lineage: 'Klein (RPD) · the outside view',
        mechanism: 'The setup is matched against 200 closed trades by 5-dimensional similarity.',
        output: 'Historical win rate of the closest analogues adjusts confidence',
    },
    {
        icon: 'users',
        color: '#10b981',
        principle: 'Dialectical reasoning',
        lineage: 'Multiple-perspective decision-making',
        mechanism: 'Three investor personas argue the same signal independently — value, momentum, risk.',
        output: 'TAKE / CAUTION / SKIP votes, aggregated into an adjustment',
    },
    {
        icon: 'combine',
        color: '#a855f7',
        principle: 'Bias interaction effects',
        lineage: 'Behavioral economics',
        mechanism: 'Detects compounds where biases amplify each other — 6 named toxic patterns, 4 beneficial.',
        output: 'A compound-risk score, separate from any single bias',
    },
    {
        icon: 'radar',
        color: '#22d3ee',
        principle: 'Source triangulation',
        lineage: 'Intelligence tradecraft',
        mechanism: 'Each signal is corroborated against 8 independent sources before it can rate.',
        output: 'A Platinum → Unconfirmed quality tier (the SQI)',
    },
    {
        icon: 'shield',
        color: '#ef4444',
        principle: 'Adversarial review',
        lineage: 'Red-teaming',
        mechanism: 'A final agent attacks the thesis with the authority to terminate it.',
        output: 'A fatal flaw kills the signal — never softened to “advisory”',
    },
    {
        icon: 'target',
        color: '#a855f7',
        principle: 'Calibration',
        lineage: 'Tetlock · superforecasting',
        mechanism: 'Confidence is remapped against observed win rates via isotonic regression, with per-type and per-sector curves.',
        output: 'A stated 70% that has historically won ~70% — and is versioned',
    },
];

/**
 * Confidence ledger — how a raw model score is composed into a calibrated one,
 * each principle applying a signed adjustment. Deltas are representative; the
 * real values are computed live per signal and sit inside the documented ranges
 * of each service (e.g. cross-source +15/+10/+5/0/−5, bias up to −25).
 */
export interface LedgerStep {
    label: string;
    principle: string;
    delta: number;
}

export const LEDGER_START = 72;
/** Final value after the calibration remap (not a simple sum — see CalibrationCurve). */
export const LEDGER_FINAL = 61;

export const CONFIDENCE_LEDGER: LedgerStep[] = [
    { label: 'Bias classifier', principle: 'moderate anchoring flagged', delta: -6 },
    { label: 'Noise jury', principle: 'judges diverged (σ high)', delta: -10 },
    { label: 'Decision Twin', principle: '3× TAKE, unanimous', delta: +8 },
    { label: 'Pre-mortem', principle: 'one severe failure mode', delta: -5 },
    { label: 'Reference class', principle: 'analogues won > 65%', delta: +3 },
    { label: 'Cross-source (Gold)', principle: '4 sources corroborate', delta: +10 },
    { label: 'Self-critique', principle: 'overconfidence trimmed', delta: -4 },
];

/**
 * The full reasoning stack — every layer a signal passes through, top to bottom.
 * Shows that the pipeline is far more than its 5 headline agents.
 */
export interface ReasoningLayer {
    name: string;
    detail: string;
    color: string;
}

export const REASONING_LAYERS: ReasoningLayer[] = [
    { name: 'Ingestion', detail: `${FEED_COUNT} live feeds → de-noised, actionable events`, color: '#64748b' },
    { name: '5-agent pipeline', detail: 'Overreaction → Contagion → Catalyst → Earnings Guard → Red Team', color: '#3b82f6' },
    { name: 'Bias & noise audit', detail: `${BIAS_COUNT}-bias scan · 3-judge noise jury`, color: '#8b5cf6' },
    { name: 'Perspective & pattern', detail: 'Decision Twin · pre-mortem · 200-trade reference class · compound-pattern detectors', color: '#10b981' },
    { name: 'Corroboration', detail: '8-source cross-validation → SQI quality tier', color: '#22d3ee' },
    { name: 'Self-critique', detail: 'the thesis is turned back on itself', color: '#06b6d4' },
    { name: 'Calibration', detail: 'remap to observed win rate, versioned per type & sector', color: '#a855f7' },
    { name: 'Audit trail', detail: 'full record persisted, graded at 1D / 5D / 10D / 30D', color: '#f59e0b' },
];
