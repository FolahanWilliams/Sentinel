/**
 * Sentinel — Decision Twin Simulation Service (Phase 2 — P1)
 *
 * Runs every surviving thesis past 3 independent investor personas in parallel:
 *   1. Value Investor  — moat, margin of safety, quality fundamentals
 *   2. Momentum Trader — price action, trend, RSI, volume confirmation
 *   3. Risk Manager    — R/R ratio, stop quality, regime, binary event risk
 *
 * Verdict logic:
 *   - Unanimous TAKE (3×)      → +TWIN_UNANIMOUS_TAKE_BOOST
 *   - 2 TAKE + 1 CAUTION       → +TWIN_MAJORITY_TAKE_BOOST
 *   - 2 TAKE + 1 SKIP          → -TWIN_SKIP_PENALTY, flagged
 *   - 1 SKIP                   → -TWIN_SKIP_PENALTY × 1, flagged
 *   - 2 SKIP                   → -TWIN_SKIP_PENALTY × 2, flagged
 *   - 3 SKIP                   → -TWIN_MAX_PENALTY, flagged (scanner should suppress)
 *   - Other caution combos     → 0 (neutral)
 */

import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';
import {
    TWIN_UNANIMOUS_TAKE_BOOST,
    TWIN_MAJORITY_TAKE_BOOST,
    TWIN_SKIP_PENALTY,
    TWIN_MAX_PENALTY,
    CONFIDENCE_FLOOR,
} from '@/config/constants';
import {
    DECISION_TWIN_VALUE_PROMPT,
    DECISION_TWIN_MOMENTUM_PROMPT,
    DECISION_TWIN_RISK_PROMPT,
} from './prompts';
import { DECISION_TWIN_SCHEMA } from './schemas';
import type { PersonaVerdict, DecisionTwinResult } from '@/types/agents';
import type { TASnapshot } from '@/types/signals';

// ── Context passed to the simulation ─────────────────────────────────────────

export interface DecisionTwinContext {
    ticker: string;
    thesis: string;
    reasoning: string;
    confidence: number;       // post-adjustment confidence (after Bias Detective + Noise)
    targetPrice: number;
    stopLoss: number;
    currentPrice: number;
    entryHigh?: number;
    signalType?: string;
    // Value Investor inputs
    moatRating?: number;
    lynchCategory?: string;
    convictionScore?: number;
    peRatio?: number | null;
    debtToEquity?: number | null;
    profitMargin?: number | null;
    fiftyTwoWeekHigh?: number;
    // Momentum Trader inputs
    taSnapshot?: TASnapshot | null;
    // Risk Manager inputs
    vix?: number | null;
    regime?: string;
}

// ── Persona prompt builders ───────────────────────────────────────────────────

function buildValuePrompt(ctx: DecisionTwinContext): string {
    const rrRatio = ctx.targetPrice && ctx.stopLoss && ctx.currentPrice
        ? ((ctx.targetPrice - ctx.currentPrice) / (ctx.currentPrice - ctx.stopLoss)).toFixed(2)
        : 'N/A';
    const mosDiscount = ctx.fiftyTwoWeekHigh && ctx.fiftyTwoWeekHigh > 0
        ? `${(((ctx.fiftyTwoWeekHigh - ctx.currentPrice) / ctx.fiftyTwoWeekHigh) * 100).toFixed(1)}% below 52W high`
        : 'N/A';

    return `
TICKER: ${ctx.ticker}
SIGNAL TYPE: ${ctx.signalType || 'N/A'}
CURRENT PRICE: $${ctx.currentPrice.toFixed(2)} | TARGET: $${ctx.targetPrice.toFixed(2)} | STOP: $${ctx.stopLoss.toFixed(2)}
RISK/REWARD: ${rrRatio}:1 | MARGIN OF SAFETY: ${mosDiscount}
CURRENT CONFIDENCE: ${ctx.confidence}/100

QUALITY METRICS:
- Moat Rating: ${ctx.moatRating ?? 'N/A'}/10
- Lynch Category: ${ctx.lynchCategory ?? 'N/A'}
- Conviction Score: ${ctx.convictionScore ?? 'N/A'}/100
- P/E Ratio: ${ctx.peRatio ?? 'N/A'}
- Debt/Equity: ${ctx.debtToEquity ?? 'N/A'}
- Profit Margin: ${ctx.profitMargin != null ? `${(ctx.profitMargin * 100).toFixed(1)}%` : 'N/A'}

THESIS:
"${ctx.thesis}"

REASONING:
"${ctx.reasoning}"

As the VALUE INVESTOR TWIN, evaluate this thesis. Vote TAKE, CAUTION, or SKIP.
Return JSON.
`;
}

function buildMomentumPrompt(ctx: DecisionTwinContext): string {
    const ta = ctx.taSnapshot;
    const rrRatio = ctx.targetPrice && ctx.stopLoss && ctx.currentPrice
        ? ((ctx.targetPrice - ctx.currentPrice) / (ctx.currentPrice - ctx.stopLoss)).toFixed(2)
        : 'N/A';

    return `
TICKER: ${ctx.ticker}
SIGNAL TYPE: ${ctx.signalType || 'N/A'}
CURRENT PRICE: $${ctx.currentPrice.toFixed(2)} | TARGET: $${ctx.targetPrice.toFixed(2)} | STOP: $${ctx.stopLoss.toFixed(2)}
RISK/REWARD: ${rrRatio}:1
CURRENT CONFIDENCE: ${ctx.confidence}/100

TECHNICAL SNAPSHOT:
- RSI (14): ${ta?.rsi14 ?? 'N/A'}
- MACD Histogram: ${ta?.macd?.histogram ?? 'N/A'}
- SMA 50: ${ta?.sma50 != null ? `$${ta.sma50.toFixed(2)}` : 'N/A'}
- SMA 200: ${ta?.sma200 != null ? `$${ta.sma200.toFixed(2)}` : 'N/A'}
- Volume Ratio: ${ta?.volumeRatio ?? 'N/A'}x avg
- Trend Direction: ${ta?.trendDirection ?? 'N/A'}
- Bollinger Position: ${ta?.bollingerPosition ?? 'N/A'} (0=bottom band, 1=top band)
- Z-Score (20d): ${ta?.zScore20 ?? 'N/A'}

THESIS:
"${ctx.thesis}"

REASONING:
"${ctx.reasoning}"

As the MOMENTUM TRADER TWIN, evaluate this thesis using ONLY the technical picture. Vote TAKE, CAUTION, or SKIP.
Return JSON.
`;
}

function buildRiskPrompt(ctx: DecisionTwinContext): string {
    const stopDistance = ctx.currentPrice && ctx.stopLoss
        ? Math.abs(((ctx.currentPrice - ctx.stopLoss) / ctx.currentPrice) * 100).toFixed(1)
        : 'N/A';
    const rrRatio = ctx.targetPrice && ctx.stopLoss && ctx.currentPrice
        ? ((ctx.targetPrice - ctx.currentPrice) / (ctx.currentPrice - ctx.stopLoss)).toFixed(2)
        : 'N/A';

    return `
TICKER: ${ctx.ticker}
SIGNAL TYPE: ${ctx.signalType || 'N/A'}
CURRENT PRICE: $${ctx.currentPrice.toFixed(2)} | TARGET: $${ctx.targetPrice.toFixed(2)} | STOP: $${ctx.stopLoss.toFixed(2)}
RISK/REWARD: ${rrRatio}:1
STOP DISTANCE: ${stopDistance}% from entry
CURRENT CONFIDENCE: ${ctx.confidence}/100

MACRO RISK:
- VIX Level: ${ctx.vix ?? 'N/A'}
- Market Regime: ${ctx.regime ?? 'neutral'}

THESIS:
"${ctx.thesis}"

REASONING:
"${ctx.reasoning}"

As the RISK MANAGER TWIN, evaluate this thesis using ONLY the risk/reward and macro risk picture. Vote TAKE, CAUTION, or SKIP.
Return JSON.
`;
}

// ── Verdict aggregation ───────────────────────────────────────────────────────

function aggregateVerdicts(
    value: PersonaVerdict,
    momentum: PersonaVerdict,
    risk: PersonaVerdict,
    originalConfidence: number
): Pick<DecisionTwinResult, 'unanimous_take' | 'skip_count' | 'caution_count' | 'confidence_adjustment' | 'adjusted_confidence' | 'flagged' | 'summary'> {
    const verdicts = [value.verdict, momentum.verdict, risk.verdict];
    const takeCount = verdicts.filter(v => v === 'take').length;
    const skipCount = verdicts.filter(v => v === 'skip').length;
    const cautionCount = verdicts.filter(v => v === 'caution').length;

    let adjustment = 0;
    if (skipCount === 0 && cautionCount === 0) {
        // Unanimous TAKE
        adjustment = TWIN_UNANIMOUS_TAKE_BOOST;
    } else if (skipCount === 0 && takeCount === 2 && cautionCount === 1) {
        adjustment = TWIN_MAJORITY_TAKE_BOOST;
    } else if (skipCount === 1) {
        adjustment = -TWIN_SKIP_PENALTY;
    } else if (skipCount === 2) {
        adjustment = -(TWIN_SKIP_PENALTY * 2);
    } else if (skipCount === 3) {
        adjustment = -TWIN_MAX_PENALTY;
    }
    // 3x caution or 2x caution + 1 take → 0 (neutral, no adjustment)

    const flagged = skipCount > 0;
    const adjusted = Math.max(CONFIDENCE_FLOOR, originalConfidence + adjustment);

    const skipNames = [
        value.verdict === 'skip' ? 'Value' : null,
        momentum.verdict === 'skip' ? 'Momentum' : null,
        risk.verdict === 'skip' ? 'Risk' : null,
    ].filter(Boolean).join(', ');

    let summary: string;
    if (skipCount === 0 && cautionCount === 0) {
        summary = `Unanimous TAKE from all 3 personas. Confidence boosted +${TWIN_UNANIMOUS_TAKE_BOOST}.`;
    } else if (skipCount === 0 && takeCount === 2) {
        summary = `2×TAKE, 1×CAUTION. Modest boost +${TWIN_MAJORITY_TAKE_BOOST}.`;
    } else if (skipCount === 0) {
        summary = `Mixed: ${takeCount}×TAKE, ${cautionCount}×CAUTION. No adjustment.`;
    } else if (skipCount === 3) {
        summary = `All 3 personas SKIPPED. Maximum penalty −${TWIN_MAX_PENALTY}. Signal flagged for suppression.`;
    } else {
        summary = `SKIP from: ${skipNames}. Penalty −${Math.abs(adjustment)}. Signal flagged for review.`;
    }

    return {
        unanimous_take: skipCount === 0 && cautionCount === 0,
        skip_count: skipCount,
        caution_count: cautionCount,
        confidence_adjustment: adjustment,
        adjusted_confidence: adjusted,
        flagged,
        summary,
    };
}

// ── Fallback verdict when a persona call fails ────────────────────────────────

function fallbackVerdict(persona: PersonaVerdict['persona']): PersonaVerdict {
    return {
        persona,
        verdict: 'caution',
        rationale: 'Evaluation unavailable — defaulted to caution.',
        key_concern: 'API call failed; unable to assess.',
        confidence_score: 50,
    };
}

// ── Main service ──────────────────────────────────────────────────────────────

export class DecisionTwinService {

    /**
     * Run all 3 investor personas in parallel and aggregate their verdicts.
     */
    static async simulate(ctx: DecisionTwinContext): Promise<DecisionTwinResult> {

        // Fire all 3 persona calls in parallel
        const [valueResult, momentumResult, riskResult] = await Promise.all([
            GeminiService.generate({
                prompt: buildValuePrompt(ctx),
                systemInstruction: DECISION_TWIN_VALUE_PROMPT,
                requireGroundedSearch: false,
                responseSchema: DECISION_TWIN_SCHEMA,
                temperature: 0.3,
                model: GEMINI_MODEL,
            }),
            GeminiService.generate({
                prompt: buildMomentumPrompt(ctx),
                systemInstruction: DECISION_TWIN_MOMENTUM_PROMPT,
                requireGroundedSearch: false,
                responseSchema: DECISION_TWIN_SCHEMA,
                temperature: 0.3,
                model: GEMINI_MODEL,
            }),
            GeminiService.generate({
                prompt: buildRiskPrompt(ctx),
                systemInstruction: DECISION_TWIN_RISK_PROMPT,
                requireGroundedSearch: false,
                responseSchema: DECISION_TWIN_SCHEMA,
                temperature: 0.3,
                model: GEMINI_MODEL,
            }),
        ]);

        // Map raw results → PersonaVerdict (with fallback)
        const value: PersonaVerdict = valueResult.success && valueResult.data
            ? { persona: 'value_investor', ...valueResult.data }
            : fallbackVerdict('value_investor');

        const momentum: PersonaVerdict = momentumResult.success && momentumResult.data
            ? { persona: 'momentum_trader', ...momentumResult.data }
            : fallbackVerdict('momentum_trader');

        const risk: PersonaVerdict = riskResult.success && riskResult.data
            ? { persona: 'risk_manager', ...riskResult.data }
            : fallbackVerdict('risk_manager');

        const aggregate = aggregateVerdicts(value, momentum, risk, ctx.confidence);

        return { value, momentum, risk, ...aggregate };
    }
}
