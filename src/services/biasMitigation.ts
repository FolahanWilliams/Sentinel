/**
 * Sentinel — Bias Mitigation Suggestions (P2)
 *
 * For each cognitive bias detected by the Bias Detective, provides
 * an actionable counter-check that the trader (or downstream agent)
 * can use to verify whether the bias is distorting the thesis.
 *
 * These mitigations transform abstract bias warnings into concrete
 * questions the trader can answer.
 */

import type { BiasDetectiveFinding } from '@/types/agents';

// ── Mitigation Map ──────────────────────────────────────────────────────────

const BIAS_MITIGATIONS: Record<string, string> = {
    overreaction:
        'Ignore the price move. Would you buy this stock at this price if it had been here for 6 months? If no, the thesis relies on overreaction framing.',
    anchoring:
        'Remove the 52-week high, analyst targets, and round numbers from your analysis. Compute intrinsic value independently from first principles.',
    herding:
        'What would you do if you were the only person analyzing this stock? Strip out "analysts expect" and "consensus is" — what does YOUR evidence say?',
    loss_aversion:
        'Flip the trade: if you had the opposite position, would the same evidence convince you to reverse? Asymmetric fear of loss may be inflating the thesis.',
    availability:
        'The thesis references a vivid past event. Find 3 counter-examples where a similar setup did NOT play out. How representative is the cited case?',
    recency:
        'Cover the last 5 days of price action. Does the thesis still hold based on the 6-month trend? Recency bias overweights the latest data.',
    confirmation:
        'List 3 data points that CONTRADICT the thesis. If you cannot find any, the analysis may have cherry-picked supporting evidence.',
    disposition_effect:
        'If you had no existing position, would you enter this trade fresh at this price? The desire to "get back to even" may be driving the recommendation.',
    framing:
        'Restate the key data point in the opposite frame (e.g., "5% below high" → "95% of high"). Does the thesis feel equally compelling?',
    representativeness:
        'This situation is being compared to a known pattern. List 3 ways this case DIFFERS from the template. Pattern-matching can mislead.',
    narrative_fallacy:
        'Remove the story. Express the thesis as raw numbers: entry, target, stop, probability. Does the trade still make sense without the narrative?',
    status_quo_bias:
        'If you had zero positions and were starting fresh, would you take this exact trade? Or is inertia making the current state feel "right"?',
    overconfidence:
        'List 3 things that could go wrong in the next 24 hours. If you cannot, your confidence may be masking tail risks.',
    regret_aversion:
        'Imagine you SKIP this trade and it goes to target. How bad does that feel? If "very bad," regret aversion may be pushing you in. Evaluate the setup, not the FOMO.',
    endowment_effect:
        'If someone offered you this position at current prices, would you take it? Or are you holding it because you already own it? Value the position at market, not at cost.',
};

const DEFAULT_MITIGATION = 'Re-examine the thesis with fresh eyes. Ask: what evidence would change my mind? If nothing would, bias may be present.';

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Enrich bias detective findings with actionable mitigation suggestions.
 * Mutates the findings array in place and returns it for convenience.
 */
export function enrichWithMitigations(findings: BiasDetectiveFinding[]): BiasDetectiveFinding[] {
    for (const finding of findings) {
        finding.mitigation = BIAS_MITIGATIONS[finding.bias_name] || DEFAULT_MITIGATION;
    }
    return findings;
}

/**
 * Get a mitigation suggestion for a specific bias type.
 */
export function getMitigation(biasName: string): string {
    return BIAS_MITIGATIONS[biasName] || DEFAULT_MITIGATION;
}
