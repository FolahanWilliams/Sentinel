/**
 * Sentinel — Post-Mortem Service
 *
 * Calls the post-mortem edge function after a trade is closed
 * to extract Buffett/Lynch lessons from the outcome.
 */

import { supabase } from '@/config/supabase';

export interface PostMortemInput {
    signal_id?: string;
    ticker: string;
    outcome: string;
    return_pct?: number;
    conviction_score?: number;
    moat_rating?: number;
    lynch_category?: string;
    thesis?: string;
}

export interface PostMortemResult {
    success: boolean;
    lesson?: {
        lesson_text: string;
        category: string;
        outcome_impact: string;
    };
    error?: string;
}

export class PostMortemService {
    /**
     * Run a post-mortem analysis on a closed trade.
     * Called automatically after HL CSV import or manual close.
     */
    static async analyze(input: PostMortemInput): Promise<PostMortemResult> {
        try {
            const { data, error } = await supabase.functions.invoke('post-mortem', {
                body: input,
            });

            if (error) {
                console.warn('[PostMortem] Edge function error:', error.message);
                return { success: false, error: error.message };
            }

            if (!data?.success) {
                return { success: false, error: data?.error || 'Unknown error' };
            }

            console.log('[PostMortem] Lesson generated:', data.lesson?.lesson_text);
            return {
                success: true,
                lesson: data.lesson,
            };
        } catch (err) {
            console.error('[PostMortem] Failed:', err);
            return { success: false, error: 'Failed to run post-mortem analysis' };
        }
    }

    /**
     * Fetch recent lessons for display in the UI.
     */
    static async getRecentLessons(limit = 10): Promise<Array<{
        id: string;
        ticker: string | null;
        category: string;
        lesson_text: string;
        outcome_impact: string | null;
        trade_return_pct: number | null;
        lynch_category: string | null;
        moat_rating: number | null;
        created_at: string;
    }>> {
        try {
            // signal_lessons table is created via migration but not in generated Supabase types yet
            const { data, error } = await (supabase
                .from('signal_lessons' as any)
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit) as any);

            if (error || !data) {
                console.warn('[PostMortem] Failed to fetch lessons:', error?.message);
                return [];
            }

            return data as any[];
        } catch {
            return [];
        }
    }
}
