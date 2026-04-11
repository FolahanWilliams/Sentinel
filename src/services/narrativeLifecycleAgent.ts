/**
 * Sentinel — Narrative Lifecycle Agent (Behavioral Layer, capability #3)
 *
 * Classifies where the dominant narrative for a ticker sits on the
 * birth → early_amplification → late_amplification → saturation →
 * exhaustion → reversal curve.
 *
 * A signal's edge depends on its timing relative to the narrative:
 *  - Early-phase narratives are under-priced → long signals get a BOOST.
 *  - Saturation/exhaustion narratives are fully priced → penalty.
 *  - Reversal narratives flip sign: long signals get hit hard, short
 *    signals get rewarded.
 *
 * Historical mention context comes from on-the-fly `market_events` queries
 * (no new table, no migration). The query is bounded to the last 14 days
 * and capped at 20 headlines to keep the prompt lean and let Gemini Flash
 * Lite classify cheaply.
 */

import { GeminiService } from './gemini';
import { NARRATIVE_LIFECYCLE_AGENT_PROMPT } from './prompts';
import { NARRATIVE_LIFECYCLE_SCHEMA } from './schemas';
import { GEMINI_MODEL_LITE, NARRATIVE_MAX_ADJUSTMENT } from '@/config/constants';
import type { NarrativeLifecycleResult, NarrativePhase } from '@/types/agents';
import { safeBlock, sanitizeUntrustedText, UNTRUSTED_CONTENT_INSTRUCTION } from '@/utils/promptSanitizer';
import { supabase } from '@/config/supabase';

export interface NarrativeLifecycleInput {
    ticker: string;
    direction: 'long' | 'short';
    thesis: string;
    eventHeadline: string;
}

interface HistoricalContext {
    mentions_last_14d: number;
    recent_headlines: string[];
    oldest_mention_days: number;
}

export class NarrativeLifecycleAgent {

    /**
     * Classify the lifecycle phase of the dominant narrative for a ticker.
     *
     * Queries `market_events` for 14d mention history on the fly. If the
     * query fails we still return a neutral result — narrative analysis
     * degrades gracefully to "no signal adjustment".
     */
    static async analyze(input: NarrativeLifecycleInput): Promise<NarrativeLifecycleResult> {
        const { ticker, direction, thesis, eventHeadline } = input;

        // 1. Fetch historical mention context
        const context = await this.fetchHistoricalContext(ticker);

        // 2. Build the prompt with sanitized context
        const headlinesBlock = context.recent_headlines.length > 0
            ? context.recent_headlines
                .map((h, i) => `  ${i + 1}. ${sanitizeUntrustedText(h, 160)}`)
                .join('\n')
            : '  (no prior mentions in last 14 days)';

        const prompt = `
TICKER: ${ticker}
SIGNAL DIRECTION: ${direction.toUpperCase()}

HISTORICAL MENTION CONTEXT (last 14 days):
  Total mentions: ${context.mentions_last_14d}
  Oldest mention: ${context.oldest_mention_days} days ago
  Recent headlines:
${headlinesBlock}

CURRENT EVENT HEADLINE:${safeBlock('headline', eventHeadline, 200)}

CURRENT THESIS (direction: ${direction}):${safeBlock('prior_agent', thesis, 500)}

Classify the lifecycle phase of the dominant narrative driving this ticker. Use the mention count and recent headlines as your primary evidence. Return JSON.
`;

        try {
            const result = await GeminiService.generate<NarrativeLifecycleResult>({
                prompt,
                systemInstruction: UNTRUSTED_CONTENT_INSTRUCTION + '\n\n' + NARRATIVE_LIFECYCLE_AGENT_PROMPT,
                responseSchema: NARRATIVE_LIFECYCLE_SCHEMA,
                model: GEMINI_MODEL_LITE,
                temperature: 0.3,
                requireGroundedSearch: false,
            });

            if (!result.success || !result.data) {
                console.warn(`[Narrative] Gemini call failed for ${ticker}: ${result.error}`);
                return this.neutralResult(context);
            }

            const data = result.data;

            // Bound the adjustment so the agent can't blow past NARRATIVE_MAX_ADJUSTMENT.
            const rawAdj = Math.round(data.confidence_adjustment ?? 0);
            const boundedAdj = Math.max(-NARRATIVE_MAX_ADJUSTMENT, Math.min(NARRATIVE_MAX_ADJUSTMENT, rawAdj));

            return {
                reasoning: data.reasoning || '',
                dominant_narrative: data.dominant_narrative || 'unspecified',
                lifecycle_phase: (data.lifecycle_phase || 'late_amplification') as NarrativePhase,
                narrative_age_days: Math.max(0, Math.floor(data.narrative_age_days ?? context.oldest_mention_days)),
                mentions_last_14d: context.mentions_last_14d,
                marginal_new_info_rate: Math.max(0, Math.min(100, data.marginal_new_info_rate ?? 50)),
                saturation_score: Math.max(0, Math.min(100, data.saturation_score ?? 50)),
                direction_pressure: data.direction_pressure || 'neutral',
                confidence_adjustment: boundedAdj,
            };
        } catch (err) {
            console.error(`[Narrative] Failed for ${ticker}:`, err);
            return this.neutralResult(context);
        }
    }

    /**
     * Query market_events for recent mention context. Bounded to 14 days and
     * capped at 20 rows so the prompt stays cheap. Returns zero counts on
     * any failure — narrative analysis degrades to neutral in that case.
     */
    private static async fetchHistoricalContext(ticker: string): Promise<HistoricalContext> {
        try {
            const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

            const { data, error } = await supabase
                .from('market_events')
                .select('headline, created_at')
                .eq('ticker', ticker)
                .gte('created_at', fourteenDaysAgo)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error || !data) {
                return { mentions_last_14d: 0, recent_headlines: [], oldest_mention_days: 0 };
            }

            const headlines = (data as Array<{ headline: string | null; created_at: string }>)
                .map(row => row.headline || '')
                .filter(h => h.length > 0);

            const oldestMs = data.length > 0
                ? new Date((data[data.length - 1] as any).created_at).getTime()
                : Date.now();
            const oldestDays = Math.max(0, Math.round((Date.now() - oldestMs) / (24 * 60 * 60 * 1000)));

            return {
                mentions_last_14d: data.length,
                recent_headlines: headlines,
                oldest_mention_days: oldestDays,
            };
        } catch (err) {
            console.warn(`[Narrative] fetchHistoricalContext failed for ${ticker}:`, err);
            return { mentions_last_14d: 0, recent_headlines: [], oldest_mention_days: 0 };
        }
    }

    private static neutralResult(context: HistoricalContext): NarrativeLifecycleResult {
        return {
            reasoning: 'Narrative analysis unavailable',
            dominant_narrative: 'unspecified',
            lifecycle_phase: 'late_amplification',
            narrative_age_days: context.oldest_mention_days,
            mentions_last_14d: context.mentions_last_14d,
            marginal_new_info_rate: 50,
            saturation_score: 50,
            direction_pressure: 'neutral',
            confidence_adjustment: 0,
        };
    }
}
