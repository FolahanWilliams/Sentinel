/**
 * Sentinel — Multi-Timeframe Confirmation Service
 *
 * Uses Gemini (via proxy-gemini Edge Function) with grounded search to assess
 * whether a signal's directional bias is confirmed across daily, weekly, and
 * monthly timeframes. Results are cached for 1 hour per ticker.
 */

import { supabase } from '@/config/supabase';

// ─── Types ───

export interface TimeframeConfirmation {
    timeframe: 'daily' | 'weekly' | 'monthly';
    trendDirection: 'bullish' | 'bearish' | 'neutral';
    confirmed: boolean;  // matches signal bias
    reason: string;
}

export interface MultiTimeframeResult {
    ticker: string;
    signalBias: string;
    confirmations: TimeframeConfirmation[];
    alignedCount: number;    // how many timeframes agree
    totalChecked: number;
    confidenceBonus: number; // +5 for 2/3 aligned, +10 for 3/3 aligned, -5 for 0/3
    summary: string;         // human readable
}

// ─── Cache ───

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
    data: MultiTimeframeResult;
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();

// ─── Gemini Response Shape ───

interface GeminiTimeframeEntry {
    timeframe: string;
    direction: string;
    reason: string;
}

// ─── Service ───

export class MultiTimeframeService {

    /**
     * Analyze multi-timeframe trend alignment for a ticker against a signal bias.
     * Calls Gemini with grounded search to get real-time trend assessments for
     * daily, weekly, and monthly timeframes, then checks alignment with the
     * provided signal bias (e.g. "bullish" or "bearish").
     *
     * Results are cached for 1 hour per ticker+bias combination.
     */
    static async analyze(ticker: string, signalBias: string): Promise<MultiTimeframeResult> {
        const normalizedTicker = ticker.toUpperCase();
        const normalizedBias = signalBias.toLowerCase();
        const cacheKey = `mtf_${normalizedTicker}_${normalizedBias}`;

        // Check cache
        const cached = cache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
            console.log(`[MultiTimeframe Cache Hit] ${normalizedTicker}`);
            return cached.data;
        }

        const fallback: MultiTimeframeResult = {
            ticker: normalizedTicker,
            signalBias: normalizedBias,
            confirmations: [],
            alignedCount: 0,
            totalChecked: 0,
            confidenceBonus: 0,
            summary: `Multi-timeframe analysis unavailable for ${normalizedTicker}.`,
        };

        try {
            const today = new Date().toISOString().split('T')[0];

            const prompt = `Analyze the trend direction for ${normalizedTicker} as of ${today} across three timeframes:
1. Daily (1-5 days): Recent price action, short-term momentum, and intraday trend.
2. Weekly (1-4 weeks): Medium-term trend based on moving averages and momentum indicators.
3. Monthly (1-3 months): Longer-term trend based on price structure and major moving averages.

For each timeframe, classify the trend as "bullish", "bearish", or "neutral" based on recent price action, moving average positioning, and momentum. Provide a brief reason for each classification.

Return ONLY a JSON object in this exact format:
{"timeframes": [{"timeframe": "daily", "direction": "bullish|bearish|neutral", "reason": "brief explanation"}, {"timeframe": "weekly", "direction": "bullish|bearish|neutral", "reason": "brief explanation"}, {"timeframe": "monthly", "direction": "bullish|bearish|neutral", "reason": "brief explanation"}]}`;

            const { data, error } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    prompt,
                    systemInstruction: 'You are a technical analysis expert. Assess trend direction using real market data. Return ONLY valid JSON with no markdown formatting.',
                    requireGroundedSearch: true,
                    temperature: 0.1,
                },
            });

            if (error || !data?.text) {
                console.warn(`[MultiTimeframe] Gemini call failed for ${normalizedTicker}:`, error);
                return fallback;
            }

            // Parse Gemini response
            let parsed: { timeframes: GeminiTimeframeEntry[] };
            try {
                const jsonText = data.text
                    .replace(/^```(?:json)?\s*\n?/i, '')
                    .replace(/\n?```\s*$/i, '')
                    .trim();
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText);
            } catch {
                console.warn(`[MultiTimeframe] Failed to parse Gemini response for ${normalizedTicker}`);
                return fallback;
            }

            if (!parsed.timeframes || !Array.isArray(parsed.timeframes)) {
                console.warn(`[MultiTimeframe] Invalid response structure for ${normalizedTicker}`);
                return fallback;
            }

            // Build confirmations
            const isBullishBias = normalizedBias === 'bullish' || normalizedBias === 'long' || normalizedBias === 'long_overreaction';
            const isBearishBias = normalizedBias === 'bearish' || normalizedBias === 'short' || normalizedBias === 'short_overreaction';

            const confirmations: TimeframeConfirmation[] = parsed.timeframes
                .filter((tf): tf is GeminiTimeframeEntry =>
                    tf && typeof tf.timeframe === 'string' && typeof tf.direction === 'string'
                )
                .map((tf) => {
                    const timeframe = tf.timeframe.toLowerCase() as 'daily' | 'weekly' | 'monthly';
                    const direction = tf.direction.toLowerCase() as 'bullish' | 'bearish' | 'neutral';

                    let confirmed = false;
                    if (isBullishBias && direction === 'bullish') confirmed = true;
                    if (isBearishBias && direction === 'bearish') confirmed = true;

                    return {
                        timeframe,
                        trendDirection: direction,
                        confirmed,
                        reason: tf.reason || 'No reason provided',
                    };
                });

            const alignedCount = confirmations.filter(c => c.confirmed).length;
            const totalChecked = confirmations.length;

            // Confidence bonus: +10 for 3/3, +5 for 2/3, 0 for 1/3, -5 for 0/3
            let confidenceBonus = 0;
            if (totalChecked > 0) {
                if (alignedCount === totalChecked && totalChecked === 3) confidenceBonus = 10;
                else if (alignedCount >= 2) confidenceBonus = 5;
                else if (alignedCount === 0) confidenceBonus = -5;
            }

            const biasLabel = isBullishBias ? 'bullish' : isBearishBias ? 'bearish' : normalizedBias;
            const alignmentPct = totalChecked > 0 ? Math.round((alignedCount / totalChecked) * 100) : 0;
            const summary = `Multi-timeframe for ${normalizedTicker}: ${alignedCount}/${totalChecked} timeframes align with ${biasLabel} bias (${alignmentPct}%). ` +
                confirmations.map(c =>
                    `${c.timeframe}: ${c.trendDirection}${c.confirmed ? ' (confirmed)' : ' (divergent)'}`
                ).join(', ') +
                `. Confidence adjustment: ${confidenceBonus > 0 ? '+' : ''}${confidenceBonus}.`;

            const result: MultiTimeframeResult = {
                ticker: normalizedTicker,
                signalBias: normalizedBias,
                confirmations,
                alignedCount,
                totalChecked,
                confidenceBonus,
                summary,
            };

            // Cache the result
            cache.set(cacheKey, { data: result, timestamp: Date.now() });
            console.log(`[MultiTimeframe] ${normalizedTicker}: ${alignedCount}/${totalChecked} aligned (bonus: ${confidenceBonus})`);

            return result;
        } catch (err) {
            console.error(`[MultiTimeframe] Error analyzing ${normalizedTicker}:`, err);
            return fallback;
        }
    }

    /**
     * Format a MultiTimeframeResult as a text block for injection into agent prompts.
     */
    static formatForPrompt(result: MultiTimeframeResult): string {
        if (!result.confirmations.length) return '';

        const lines = [
            '\nMULTI-TIMEFRAME CONFIRMATION:',
            `Signal bias: ${result.signalBias} | Alignment: ${result.alignedCount}/${result.totalChecked} timeframes`,
        ];

        for (const c of result.confirmations) {
            const icon = c.confirmed ? '[CONFIRMED]' : '[DIVERGENT]';
            lines.push(`- ${c.timeframe.charAt(0).toUpperCase() + c.timeframe.slice(1)}: ${c.trendDirection} ${icon} — ${c.reason}`);
        }

        lines.push(`Confidence adjustment: ${result.confidenceBonus > 0 ? '+' : ''}${result.confidenceBonus}`);
        lines.push('When all timeframes align, conviction is highest. Divergent timeframes suggest caution — the signal may face headwinds from the broader trend.');

        return lines.join('\n');
    }
}
