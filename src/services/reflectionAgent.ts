/**
 * ReflectionAgent — Self-Learning via RAG Feedback Loop
 *
 * Analyzes historical signal_outcomes to generate "Lessons Learned" rules.
 * These rules are persisted in app_settings and injected into agent prompts
 * on future analyses, creating a self-improving feedback loop.
 *
 * Uses gemini-3-flash-preview for deep pattern analysis.
 */

import { supabase } from '@/config/supabase';
import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';

export interface LessonRule {
    id: string;
    bias_type: string;
    sector: string;
    rule: string;
    win_rate: number;
    sample_size: number;
    severity: 'info' | 'warning' | 'critical';
}

export interface ReflectionResult {
    lessons: LessonRule[];
    outcomes_analyzed: number;
    generated_at: string;
}

const REFLECTION_PROMPT = `You are the REFLECTION AGENT for SENTINEL, a quantitative trading AI.

You are given a dataset of historical signal outcomes — each row represents a trade signal the AI generated in the past, along with what actually happened (the return after 1, 5, 10, and 30 days).

Your job is to find PATTERNS in the AI's mistakes and generate a set of concrete, actionable "Lessons Learned" rules that will improve future performance.

ANALYSIS FRAMEWORK:
1. Group outcomes by bias_type (overreaction, contagion, earnings_overreaction) and look for systematic errors
2. Group by sector to find sector-specific blind spots
3. Look at confidence calibration — are high-confidence signals actually performing better?
4. Identify specific conditions where the AI is consistently wrong
5. Consider user_rating feedback — signals rated "down" by the user indicate dissatisfaction even if the numerical outcome was OK. Signals rated "up" confirm the thesis was useful.

OUTPUT FORMAT: Return a JSON object with a "lessons" array. Each lesson must have:
- id: unique short identifier (e.g., "tech_overreaction_high_rsi")
- bias_type: which agent/bias this applies to
- sector: which sector (or "all" if universal)
- rule: the specific actionable rule in plain English (e.g., "Do NOT generate bullish overreaction signals on semiconductor stocks during Fed tightening cycles — historical win rate is only 20%")
- win_rate: the observed win rate for this category (0-100)
- sample_size: how many outcomes this is based on
- severity: "info" (win rate 40-60%), "warning" (win rate 20-40%), "critical" (win rate < 20%)

Generate 3-10 rules. Prioritize rules with the most statistical significance (highest sample sizes).
If the data is insufficient (< 5 total outcomes), return an empty lessons array.`;

export class ReflectionAgent {
    /**
     * Runs the full reflection cycle:
     * 1. Fetch all completed signal outcomes
     * 2. Join with signal metadata
     * 3. Send to Gemini for pattern analysis
     * 4. Store generated lessons in app_settings
     */
    static async runReflection(): Promise<ReflectionResult> {
        console.log('[ReflectionAgent] Starting reflection cycle...');

        // 1. Fetch completed outcomes with signal data
        const { data: outcomes, error } = await supabase
            .from('signal_outcomes')
            .select('*, signals!inner(ticker, signal_type, bias_type, confidence_score, thesis, risk_level)')
            .not('return_at_1d', 'is', null) // Only completed outcomes
            .order('tracked_at', { ascending: false })
            .limit(200); // Cap at 200 for context window

        if (error) {
            console.error('[ReflectionAgent] Failed to fetch outcomes:', error);
            throw new Error('Failed to fetch signal outcomes for reflection');
        }

        if (!outcomes || outcomes.length < 5) {
            console.log('[ReflectionAgent] Insufficient data (<5 outcomes). Skipping.');
            return {
                lessons: [],
                outcomes_analyzed: outcomes?.length || 0,
                generated_at: new Date().toISOString(),
            };
        }

        // 2a. Fetch user ratings to enrich the dataset
        const signalIds = outcomes.map((o: any) => o.signal_id).filter(Boolean);
        const ratingsMap: Record<string, string> = {};
        if (signalIds.length > 0) {
            try {
                const { data: ratings } = await (supabase
                    .from('signal_ratings' as any)
                    .select('signal_id, rating') as any)
                    .in('signal_id', signalIds);
                if (ratings) {
                    for (const r of ratings as any[]) {
                        ratingsMap[r.signal_id] = r.rating;
                    }
                }
            } catch { /* signal_ratings table may not exist yet */ }
        }

        // 2. Build a condensed dataset for the prompt
        const condensed = outcomes.map((o: any) => ({
            ticker: o.signals?.ticker || o.ticker,
            bias_type: o.signals?.bias_type || 'unknown',
            signal_type: o.signals?.signal_type || 'unknown',
            confidence: o.signals?.confidence_score || 0,
            outcome: o.outcome,
            return_1d: o.return_at_1d,
            return_5d: o.return_at_5d,
            return_10d: o.return_at_10d,
            return_30d: o.return_at_30d,
            max_drawdown: o.max_drawdown,
            max_gain: o.max_gain,
            hit_target: o.hit_target,
            hit_stop_loss: o.hit_stop_loss,
            user_rating: ratingsMap[o.signal_id] || null,
        }));

        // 3. Quick stats for context
        const totalWins = condensed.filter((c: any) => (c.return_5d ?? c.return_1d ?? 0) > 0).length;
        const overallWinRate = ((totalWins / condensed.length) * 100).toFixed(1);

        const prompt = `Here are ${condensed.length} historical signal outcomes for analysis.

OVERALL STATS:
- Total outcomes: ${condensed.length}
- Overall win rate (5D return > 0): ${overallWinRate}%

OUTCOME DATA:
${JSON.stringify(condensed, null, 2)}

Analyze this data and generate the Lessons Learned rules.`;

        // 4. Call Gemini (Flash — needs deep reasoning)
        const result = await GeminiService.generate<{ lessons: LessonRule[] }>({
            prompt,
            systemInstruction: REFLECTION_PROMPT,
            model: GEMINI_MODEL,
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    lessons: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                id: { type: 'STRING' },
                                bias_type: { type: 'STRING' },
                                sector: { type: 'STRING' },
                                rule: { type: 'STRING' },
                                win_rate: { type: 'NUMBER' },
                                sample_size: { type: 'NUMBER' },
                                severity: { type: 'STRING', enum: ['info', 'warning', 'critical'] },
                            },
                            required: ['id', 'bias_type', 'sector', 'rule', 'win_rate', 'sample_size', 'severity'],
                        },
                    },
                },
                required: ['lessons'],
            },
        });

        if (!result.success || !result.data?.lessons) {
            console.error('[ReflectionAgent] Gemini analysis failed:', result.error);
            throw new Error('Reflection analysis failed: ' + (result.error || 'Unknown'));
        }

        const reflectionResult: ReflectionResult = {
            lessons: result.data.lessons,
            outcomes_analyzed: condensed.length,
            generated_at: new Date().toISOString(),
        };

        // 5. Persist to app_settings
        const { error: upsertError } = await supabase
            .from('app_settings')
            .upsert({
                key: 'reflection_lessons',
                value: reflectionResult as any,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });

        if (upsertError) {
            console.error('[ReflectionAgent] Failed to save lessons:', upsertError);
        }

        console.log(`[ReflectionAgent] Generated ${result.data.lessons.length} lessons from ${condensed.length} outcomes.`);
        return reflectionResult;
    }

    /**
     * Retrieves cached lessons relevant to a specific bias type and/or sector.
     * Returns a formatted string ready to inject into agent prompts.
     */
    static async getLessonsForContext(biasType?: string, sector?: string): Promise<string> {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'reflection_lessons')
                .maybeSingle();

            if (error || !data?.value) return '';

            const reflection = data.value as unknown as ReflectionResult;
            if (!reflection.lessons || reflection.lessons.length === 0) return '';

            // Filter lessons relevant to the context
            const relevant = reflection.lessons.filter(lesson => {
                const matchesBias = !biasType || lesson.bias_type === biasType || lesson.bias_type === 'all';
                const matchesSector = !sector || lesson.sector === sector || lesson.sector === 'all';
                return matchesBias || matchesSector;
            });

            if (relevant.length === 0) return '';

            const formatted = relevant.map(l => {
                const icon = l.severity === 'critical' ? '🚨' : l.severity === 'warning' ? '⚠️' : 'ℹ️';
                return `${icon} [${l.bias_type}/${l.sector}] ${l.rule} (Win Rate: ${l.win_rate}%, n=${l.sample_size})`;
            }).join('\n');

            return `\n\n--- LESSONS FROM PAST PERFORMANCE (Self-Learning Context) ---\nThe following rules were learned from analyzing ${reflection.outcomes_analyzed} historical signal outcomes. RESPECT these rules and adjust your confidence accordingly:\n\n${formatted}\n--- END LESSONS ---\n`;

        } catch (err) {
            console.error('[ReflectionAgent] Failed to fetch lessons:', err);
            return '';
        }
    }

    /**
     * Returns the raw ReflectionResult for UI display.
     */
    static async getStoredReflection(): Promise<ReflectionResult | null> {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'reflection_lessons')
                .maybeSingle();

            if (error || !data?.value) return null;
            return data.value as unknown as ReflectionResult;
        } catch {
            return null;
        }
    }
}
