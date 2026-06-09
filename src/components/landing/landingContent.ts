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
            'Raw model confidence is remapped against observed outcomes via isotonic regression, so a “70%” means a measured 70%.',
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
    { value: 20, suffix: '+', label: 'Audited fields per signal', sub: 'persisted, never compressed' },
    { value: 4, label: 'Outcome windows', sub: '1D · 5D · 10D · 30D post-mortems' },
    { value: 42, label: 'Live intelligence feeds', sub: 'scanned continuously' },
];

/** Extra depth stats surfaced only on the /about builder cut. */
export const BUILDER_STATS: ArchStat[] = [
    { value: 40, suffix: '+', label: 'Specialized services', sub: 'typed, composable' },
    { value: 13, label: 'Edge functions', sub: 'rate-limited AI + data plane' },
    { value: 15, label: 'Route surfaces', sub: 'scanner → audit → post-mortem' },
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
