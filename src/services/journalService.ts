/**
 * JournalService — Trade Journal & Reflection System
 *
 * Provides structured trade journal entries with:
 * - Position linking (auto-populate from closed positions)
 * - AI-generated post-mortem reviews on closed trades
 * - Screenshot/image attachment support (base64 stored in entry)
 * - Entry rationale capture at open, post-trade review at close
 */

import { supabase } from '@/config/supabase';
import { PostMortemService, type PostMortemInput } from './postMortemService';

export interface JournalEntry {
    id: string;
    ticker: string | null;
    signal_id: string | null;
    entry_type: string;
    content: string;
    mood: string | null;
    tags: string[];
    created_at: string;
    // Extended fields stored in content as structured JSON
    structured?: StructuredTradeEntry;
}

export interface StructuredTradeEntry {
    direction: 'long' | 'short';
    entry_price: number | null;
    exit_price: number | null;
    shares: number | null;
    stop_loss: number | null;
    target_price: number | null;
    entry_rationale: string;
    post_trade_review: string;
    ai_post_mortem: string | null;
    screenshots: string[];  // base64 data URLs
    position_id: string | null;
    pnl_pct: number | null;
    pnl_usd: number | null;
    holding_days: number | null;
    lessons_learned: string;
    what_went_well: string;
    what_went_wrong: string;
    would_take_again: boolean | null;
}

/**
 * Parse a journal entry's content field to extract structured data.
 * Older entries store plaintext; newer ones store JSON with a marker.
 */
export function parseJournalContent(entry: any): JournalEntry & { structured?: StructuredTradeEntry } {
    const result: JournalEntry = {
        id: entry.id,
        ticker: entry.ticker,
        signal_id: entry.signal_id,
        entry_type: entry.entry_type,
        content: entry.content,
        mood: entry.mood,
        tags: entry.tags || [],
        created_at: entry.created_at,
    };

    // Try parsing structured JSON from content
    if (entry.content?.startsWith('{"structured":')) {
        try {
            const parsed = JSON.parse(entry.content);
            result.structured = parsed.structured;
            result.content = parsed.display_content || entry.content;
        } catch { /* fall through to raw content */ }
    }

    return result;
}

export class JournalService {
    /**
     * Create a structured trade journal entry.
     */
    static async createEntry(params: {
        ticker: string;
        signal_id?: string;
        direction: 'long' | 'short';
        entry_price: number | null;
        exit_price: number | null;
        shares: number | null;
        stop_loss: number | null;
        target_price: number | null;
        entry_rationale: string;
        post_trade_review: string;
        mood: string;
        tags: string[];
        screenshots: string[];
        position_id?: string;
        lessons_learned?: string;
        what_went_well?: string;
        what_went_wrong?: string;
        would_take_again?: boolean;
    }): Promise<{ success: boolean; id?: string; error?: string }> {
        try {
            const pnl_pct = params.entry_price && params.exit_price
                ? ((params.exit_price - params.entry_price) / params.entry_price) * 100 * (params.direction === 'short' ? -1 : 1)
                : null;
            const pnl_usd = pnl_pct !== null && params.shares && params.entry_price
                ? (params.exit_price! - params.entry_price) * params.shares * (params.direction === 'short' ? -1 : 1)
                : null;

            const structured: StructuredTradeEntry = {
                direction: params.direction,
                entry_price: params.entry_price,
                exit_price: params.exit_price,
                shares: params.shares,
                stop_loss: params.stop_loss,
                target_price: params.target_price,
                entry_rationale: params.entry_rationale,
                post_trade_review: params.post_trade_review,
                ai_post_mortem: null,
                screenshots: params.screenshots.slice(0, 3), // Max 3 screenshots
                position_id: params.position_id || null,
                pnl_pct,
                pnl_usd,
                holding_days: null,
                lessons_learned: params.lessons_learned || '',
                what_went_well: params.what_went_well || '',
                what_went_wrong: params.what_went_wrong || '',
                would_take_again: params.would_take_again ?? null,
            };

            // Build display content for older UI compatibility
            const displayLines = [
                `${params.direction.toUpperCase()} ${params.ticker}`,
                params.entry_price ? `Entry: $${params.entry_price}` : '',
                params.exit_price ? `Exit: $${params.exit_price}` : 'Status: OPEN',
                params.stop_loss ? `Stop: $${params.stop_loss}` : '',
                params.target_price ? `Target: $${params.target_price}` : '',
                '',
                params.entry_rationale ? `Rationale: ${params.entry_rationale}` : '',
                params.post_trade_review ? `Review: ${params.post_trade_review}` : '',
                params.lessons_learned ? `Lessons: ${params.lessons_learned}` : '',
            ].filter(Boolean).join('\n');

            const contentPayload = JSON.stringify({
                structured,
                display_content: displayLines,
            });

            const { data, error } = await supabase.from('journal_entries').insert({
                ticker: params.ticker.toUpperCase(),
                signal_id: params.signal_id || null,
                entry_type: params.direction,
                content: contentPayload,
                mood: params.mood,
                tags: [params.direction, ...params.tags],
            } as any).select('id').single();

            if (error) throw error;

            // If trade is closed, auto-generate AI post-mortem (fire and forget)
            if (params.exit_price && params.entry_price) {
                void this.generatePostMortem(data.id, params);
            }

            return { success: true, id: data.id };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Generate and attach an AI post-mortem to a journal entry.
     */
    static async generatePostMortem(entryId: string, params: {
        ticker: string;
        direction: 'long' | 'short';
        entry_price: number | null;
        exit_price: number | null;
        shares: number | null;
        entry_rationale: string;
    }): Promise<void> {
        if (!params.entry_price || !params.exit_price) return;

        try {
            const input: PostMortemInput = {
                ticker: params.ticker,
                side: params.direction,
                entry_price: params.entry_price,
                exit_price: params.exit_price,
                shares: params.shares || 0,
                realized_pnl: (params.exit_price - params.entry_price) * (params.shares || 1) * (params.direction === 'short' ? -1 : 1),
                realized_pnl_pct: ((params.exit_price - params.entry_price) / params.entry_price) * 100 * (params.direction === 'short' ? -1 : 1),
                opened_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                closed_at: new Date().toISOString(),
                close_reason: 'manual',
                original_notes: params.entry_rationale,
            };

            const postMortem = await PostMortemService.generatePostMortem(input);
            if (!postMortem) return;

            // Update the journal entry with the AI post-mortem
            const { data: entry } = await supabase
                .from('journal_entries')
                .select('content')
                .eq('id', entryId)
                .single();

            if (entry?.content) {
                try {
                    const parsed = JSON.parse(entry.content);
                    if (parsed.structured) {
                        parsed.structured.ai_post_mortem = postMortem;
                        await supabase
                            .from('journal_entries')
                            .update({ content: JSON.stringify(parsed) } as any)
                            .eq('id', entryId);
                    }
                } catch { /* non-structured entry, skip */ }
            }

            console.log(`[JournalService] AI post-mortem attached to entry ${entryId}`);
        } catch (err) {
            console.warn('[JournalService] Post-mortem generation failed:', err);
        }
    }

    /**
     * Auto-create a journal entry from a closed position.
     */
    static async createFromPosition(position: {
        id: string;
        ticker: string;
        side: string;
        entry_price: number | null;
        exit_price: number | null;
        shares: number | null;
        realized_pnl: number | null;
        realized_pnl_pct: number | null;
        signal_id: string | null;
        opened_at: string | null;
        closed_at: string | null;
        close_reason: string | null;
        notes: string | null;
    }): Promise<{ success: boolean; id?: string }> {
        return this.createEntry({
            ticker: position.ticker,
            signal_id: position.signal_id || undefined,
            direction: (position.side as 'long' | 'short') || 'long',
            entry_price: position.entry_price,
            exit_price: position.exit_price,
            shares: position.shares,
            stop_loss: null,
            target_price: null,
            entry_rationale: position.notes || 'Auto-logged from position close',
            post_trade_review: '',
            mood: (position.realized_pnl ?? 0) > 0 ? '🔥' : '😐',
            tags: ['auto-logged', position.close_reason || 'manual'],
            screenshots: [],
            position_id: position.id,
        });
    }
}
