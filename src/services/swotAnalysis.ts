/**
 * Sentinel — SWOT Analysis Service (Phase 2 — P1)
 *
 * Non-blocking narrative enrichment layer. Runs after the Decision Twin
 * and synthesises all upstream pipeline evidence into a structured
 * Strengths / Weaknesses / Opportunities / Threats analysis + executive
 * summary for display on the signal card.
 *
 * Does NOT modify confidence. Does NOT suppress signals.
 * Pure intelligence output for the trader reading the signal.
 */

import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';
import { SWOT_ANALYSIS_PROMPT } from './prompts';
import { SWOT_SCHEMA } from './schemas';
import type { SWOTResult, SWOTItem } from '@/types/agents';
import type { TASnapshot } from '@/types/signals';
import type { DecisionTwinResult } from '@/types/agents';

// ── Input context ─────────────────────────────────────────────────────────────

export interface SWOTContext {
    ticker: string;
    headline: string;
    thesis: string;
    reasoning: string;
    confidence: number;
    signalType: string;
    // Red Team + Self-Critique output
    counterThesis?: string | null;
    criticalFlaws?: string[];
    // Decision Twin concerns
    decisionTwin?: DecisionTwinResult | null;
    // Fundamental data
    moatRating?: number;
    lynchCategory?: string;
    peRatio?: number | null;
    debtToEquity?: number | null;
    profitMargin?: number | null;
    // Technical data
    taSnapshot?: TASnapshot | null;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildSWOTPrompt(ctx: SWOTContext): string {
    const ta = ctx.taSnapshot;

    // Decision Twin concern lines
    const twinLines: string[] = [];
    if (ctx.decisionTwin) {
        const { value, momentum, risk } = ctx.decisionTwin;
        twinLines.push(`- Value Investor (${value.verdict.toUpperCase()}): ${value.key_concern}`);
        twinLines.push(`- Momentum Trader (${momentum.verdict.toUpperCase()}): ${momentum.key_concern}`);
        twinLines.push(`- Risk Manager (${risk.verdict.toUpperCase()}): ${risk.key_concern}`);
    }

    const flawLines = ctx.criticalFlaws?.length
        ? ctx.criticalFlaws.map(f => `  • ${f}`).join('\n')
        : '  (none identified)';

    return `
TICKER: ${ctx.ticker}
SIGNAL TYPE: ${ctx.signalType}
HEADLINE: "${ctx.headline}"
CURRENT CONFIDENCE: ${ctx.confidence}/100

────────────────────────────────
PRIMARY THESIS:
"${ctx.thesis}"

PRIMARY REASONING:
"${ctx.reasoning}"

────────────────────────────────
RED TEAM COUNTER-THESIS:
"${ctx.counterThesis ?? 'Not available.'}"

SELF-CRITIQUE CRITICAL FLAWS:
${flawLines}

────────────────────────────────
DECISION TWIN CONCERNS:
${twinLines.length ? twinLines.join('\n') : '(Decision Twin not available.)'}
Twin Panel Summary: ${ctx.decisionTwin?.summary ?? 'N/A'}

────────────────────────────────
FUNDAMENTALS:
- Moat Rating: ${ctx.moatRating ?? 'N/A'}/10
- Lynch Category: ${ctx.lynchCategory ?? 'N/A'}
- P/E Ratio: ${ctx.peRatio ?? 'N/A'}
- Debt/Equity: ${ctx.debtToEquity ?? 'N/A'}
- Profit Margin: ${ctx.profitMargin != null ? `${(ctx.profitMargin * 100).toFixed(1)}%` : 'N/A'}

TECHNICALS:
- RSI (14): ${ta?.rsi14 ?? 'N/A'}
- Trend Direction: ${ta?.trendDirection ?? 'N/A'}
- Volume Ratio: ${ta?.volumeRatio ?? 'N/A'}x avg
- SMA50: ${ta?.sma50 != null ? `$${ta.sma50.toFixed(2)}` : 'N/A'} | SMA200: ${ta?.sma200 != null ? `$${ta.sma200.toFixed(2)}` : 'N/A'}

────────────────────────────────
Generate the SWOT analysis. Populate all four quadrants honestly using the evidence above.
Return JSON.
`;
}

// ── Fallback for failed calls ─────────────────────────────────────────────────

function fallbackSWOT(ticker: string): SWOTResult {
    const na: SWOTItem = { point: 'Analysis unavailable.', evidence: 'API call failed.' };
    return {
        strengths: [na],
        weaknesses: [na],
        opportunities: [na],
        threats: [na],
        executive_summary: `SWOT analysis for ${ticker} could not be generated. Review the thesis and counter-thesis directly.`,
    };
}

// ── Main service ──────────────────────────────────────────────────────────────

export class SWOTAnalysisService {

    /**
     * Generate a structured SWOT analysis for the given signal context.
     * Always resolves — falls back to a minimal stub on API failure.
     */
    static async analyze(ctx: SWOTContext): Promise<SWOTResult> {
        const result = await GeminiService.generate({
            prompt: buildSWOTPrompt(ctx),
            systemInstruction: SWOT_ANALYSIS_PROMPT,
            requireGroundedSearch: false,
            responseSchema: SWOT_SCHEMA,
            temperature: 0.4,
            model: GEMINI_MODEL,
        });

        if (!result.success || !result.data) {
            return fallbackSWOT(ctx.ticker);
        }

        // Validate minimum shape — fall back if core arrays missing
        const d = result.data as SWOTResult;
        if (!Array.isArray(d.strengths) || !Array.isArray(d.weaknesses) ||
            !Array.isArray(d.opportunities) || !Array.isArray(d.threats)) {
            return fallbackSWOT(ctx.ticker);
        }

        return d;
    }
}
