/**
 * PostMortemService — Automated Trade Journal Generation
 *
 * When a position is closed, this service generates an AI-written
 * post-mortem analysis using gemini-3.1-flash-lite (cheap, fast).
 *
 * It gathers context about the trade (entry/exit, holding period, news)
 * and produces a concise explanation of what happened and why.
 */

import { supabase } from '@/config/supabase';
import { GeminiService } from './gemini';
import { GEMINI_MODEL_LITE } from '@/config/constants';
import { PostMortemService as LessonExtractor } from './postMortem';

const POST_MORTEM_PROMPT = `You are SENTINEL's Trade Post-Mortem Analyst.

You receive details about a closed trade and relevant news during the holding period.
Generate a concise, brutally honest post-mortem analysis.

FORMAT YOUR RESPONSE AS A SINGLE PARAGRAPH (2-4 sentences):
1. State the outcome (win/loss and magnitude)
2. Identify what drove the price action during the hold (macro, earnings, sector rotation, etc.)
3. Provide one actionable lesson for future similar setups

Be direct. No fluff. No disclaimers. Use specific numbers from the data provided.`;

export interface PostMortemInput {
    ticker: string;
    side: string;
    entry_price: number;
    exit_price: number;
    shares: number;
    realized_pnl: number;
    realized_pnl_pct: number;
    opened_at: string;
    closed_at: string;
    close_reason: string;
    original_notes?: string;
}

export class PostMortemService {
    /**
     * Generates an AI post-mortem for a closed position.
     * Uses Flash-Lite for cost efficiency (called on every trade close).
     */
    static async generatePostMortem(input: PostMortemInput): Promise<string | null> {
        try {
            console.log(`[PostMortem] Generating for ${input.ticker}...`);

            // 1. Fetch news headlines during the holding period
            const { data: news } = await supabase
                .from('rss_cache')
                .select('title, published_at, feed_category')
                .overlaps('tickers_mentioned', [input.ticker])
                .gte('published_at', input.opened_at)
                .lte('published_at', input.closed_at)
                .order('published_at', { ascending: false })
                .limit(10);

            const newsContext = news && news.length > 0
                ? news.map((n: any) => `- [${n.feed_category}] ${n.title} (${new Date(n.published_at).toLocaleDateString()})`).join('\n')
                : 'No relevant news articles found during the holding period.';

            // 2. Calculate holding period
            const holdingDays = Math.max(1, Math.round(
                (new Date(input.closed_at).getTime() - new Date(input.opened_at).getTime()) / (1000 * 60 * 60 * 24)
            ));

            // 3. Build prompt
            const prompt = `TRADE DETAILS:
- Ticker: ${input.ticker}
- Side: ${input.side.toUpperCase()}
- Entry: $${input.entry_price.toFixed(2)} → Exit: $${input.exit_price.toFixed(2)}
- Shares: ${input.shares}
- P&L: ${input.realized_pnl >= 0 ? '+' : ''}$${input.realized_pnl.toFixed(2)} (${input.realized_pnl_pct >= 0 ? '+' : ''}${input.realized_pnl_pct.toFixed(2)}%)
- Holding Period: ${holdingDays} day(s)
- Close Reason: ${input.close_reason}
${input.original_notes ? `- Original Thesis: ${input.original_notes}` : ''}

NEWS DURING HOLDING PERIOD:
${newsContext}

Write the post-mortem analysis.`;

            // 4. Call Flash-Lite (cheap model)
            const result = await GeminiService.generate<string>({
                prompt,
                systemInstruction: POST_MORTEM_PROMPT,
                model: GEMINI_MODEL_LITE,
            });

            if (!result.success || !result.data) {
                console.error('[PostMortem] Generation failed:', result.error);
                return null;
            }

            const postMortem = typeof result.data === 'string'
                ? result.data
                : JSON.stringify(result.data);

            console.log(`[PostMortem] Generated for ${input.ticker}: ${postMortem.substring(0, 100)}...`);
            return postMortem;

        } catch (err: any) {
            console.error('[PostMortem] Error:', err.message);
            return null;
        }
    }

    /**
     * Generates a post-mortem and saves it to the position's notes field.
     * Fire-and-forget — does not block the UI.
     */
    static async generateAndSave(positionId: string, input: PostMortemInput): Promise<void> {
        const postMortem = await this.generatePostMortem(input);
        if (!postMortem) return;

        const existingNotes = input.original_notes || '';
        const updatedNotes = existingNotes
            ? `${existingNotes}\n\n--- AI POST-MORTEM ---\n${postMortem}`
            : `--- AI POST-MORTEM ---\n${postMortem}`;

        const { error } = await supabase
            .from('positions')
            .update({ notes: updatedNotes } as any)
            .eq('id', positionId);

        if (error) {
            console.error('[PostMortem] Failed to save:', error);
        } else {
            console.log(`[PostMortem] Saved post-mortem for position ${positionId}`);
        }

        // Extract structured lesson to signal_lessons table (fire-and-forget)
        try {
            // Look up conviction data from the linked signal
            const { data: position } = await supabase
                .from('positions')
                .select('signal_id')
                .eq('id', positionId)
                .single();

            let signalData: any = null;
            if (position?.signal_id) {
                const { data } = await supabase
                    .from('signals')
                    .select('conviction_score, moat_rating, lynch_category, thesis')
                    .eq('id', position.signal_id)
                    .single();
                signalData = data;
            }

            const outcome = input.realized_pnl >= 0 ? 'win' : 'loss';
            await LessonExtractor.analyze({
                signal_id: position?.signal_id || undefined,
                ticker: input.ticker,
                outcome,
                return_pct: input.realized_pnl_pct,
                conviction_score: signalData?.conviction_score ?? undefined,
                moat_rating: signalData?.moat_rating ?? undefined,
                lynch_category: signalData?.lynch_category ?? undefined,
                thesis: signalData?.thesis ?? postMortem,
            });
        } catch (err) {
            console.warn('[PostMortem] Lesson extraction failed (non-fatal):', err);
        }
    }
}
