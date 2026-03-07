/**
 * Sentinel — Earnings Calendar Guard
 *
 * Checks if a ticker has upcoming earnings within a configurable window.
 * Penalizes or blocks signals near earnings to avoid thesis-invalidating events.
 *
 * Uses Gemini grounded search to check earnings dates (no external API key needed).
 * Results cached for 6 hours to minimize API calls.
 */

import { supabase } from '@/config/supabase';

export interface EarningsGuardResult {
    hasUpcomingEarnings: boolean;
    earningsDate: string | null;       // ISO date or descriptive string
    daysUntilEarnings: number | null;  // null if unknown
    confidencePenalty: number;          // 0 to -30
    shouldBlock: boolean;              // true if earnings are imminent (≤2 days)
    reason: string;
}

// In-memory cache: ticker -> { result, timestamp }
const earningsCache = new Map<string, { result: EarningsGuardResult; timestamp: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export class EarningsGuard {

    /**
     * Check if a ticker has earnings coming up within the next 14 days.
     * Returns penalty/block recommendations.
     */
    static async check(ticker: string): Promise<EarningsGuardResult> {
        const upperTicker = ticker.toUpperCase();

        // Check cache
        const cached = earningsCache.get(upperTicker);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
            return cached.result;
        }

        const noEarnings: EarningsGuardResult = {
            hasUpcomingEarnings: false,
            earningsDate: null,
            daysUntilEarnings: null,
            confidencePenalty: 0,
            shouldBlock: false,
            reason: 'No upcoming earnings detected within 14 days.',
        };

        try {
            // Use Gemini grounded search to find next earnings date
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase.functions.invoke('proxy-gemini', {
                body: {
                    prompt: `What is the next earnings report date for ${upperTicker}? Today is ${today}. Respond with ONLY a JSON object: {"has_earnings_soon": true/false, "earnings_date": "YYYY-MM-DD" or null, "days_until": number or null, "source": "brief source"}. If the earnings date is more than 30 days away or unknown, set has_earnings_soon to false.`,
                    systemInstruction: 'You are a financial data assistant. Return ONLY valid JSON with no markdown formatting.',
                    requireGroundedSearch: true,
                    temperature: 0.1,
                },
            });

            if (error || !data?.text) {
                console.warn(`[EarningsGuard] Gemini call failed for ${upperTicker}:`, error);
                earningsCache.set(upperTicker, { result: noEarnings, timestamp: Date.now() });
                return noEarnings;
            }

            // Parse the response
            let parsed: any;
            try {
                const jsonText = data.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText);
            } catch {
                console.warn(`[EarningsGuard] Failed to parse response for ${upperTicker}:`, data.text?.substring(0, 200));
                earningsCache.set(upperTicker, { result: noEarnings, timestamp: Date.now() });
                return noEarnings;
            }

            if (!parsed.has_earnings_soon) {
                earningsCache.set(upperTicker, { result: noEarnings, timestamp: Date.now() });
                return noEarnings;
            }

            const daysUntil = parsed.days_until ?? null;
            let penalty = 0;
            let shouldBlock = false;
            let reason = '';

            if (daysUntil !== null) {
                if (daysUntil <= 2) {
                    // Imminent earnings — block the signal entirely
                    shouldBlock = true;
                    penalty = -30;
                    reason = `BLOCKED: Earnings in ${daysUntil} day(s) (${parsed.earnings_date}). Signal thesis may be invalidated by report.`;
                } else if (daysUntil <= 5) {
                    // Very close — heavy penalty
                    penalty = -25;
                    reason = `Earnings in ${daysUntil} days (${parsed.earnings_date}). High risk of thesis invalidation.`;
                } else if (daysUntil <= 7) {
                    // Close — moderate penalty
                    penalty = -15;
                    reason = `Earnings in ${daysUntil} days (${parsed.earnings_date}). Signal may not play out before report.`;
                } else if (daysUntil <= 14) {
                    // Upcoming — light penalty
                    penalty = -5;
                    reason = `Earnings in ${daysUntil} days (${parsed.earnings_date}). Consider shorter timeframe.`;
                }
            } else {
                // Has earnings soon but unknown exact date
                penalty = -10;
                reason = `Earnings date reported as imminent but exact date unknown. Exercise caution.`;
            }

            const result: EarningsGuardResult = {
                hasUpcomingEarnings: true,
                earningsDate: parsed.earnings_date || null,
                daysUntilEarnings: daysUntil,
                confidencePenalty: penalty,
                shouldBlock,
                reason,
            };

            earningsCache.set(upperTicker, { result, timestamp: Date.now() });
            console.log(`[EarningsGuard] ${upperTicker}: ${reason}`);
            return result;

        } catch (err) {
            console.error(`[EarningsGuard] Error for ${upperTicker}:`, err);
            earningsCache.set(upperTicker, { result: noEarnings, timestamp: Date.now() });
            return noEarnings;
        }
    }

    /**
     * Format earnings guard result for injection into agent prompts.
     */
    static formatForPrompt(result: EarningsGuardResult): string {
        if (!result.hasUpcomingEarnings) return '';
        return `\nEARNINGS CALENDAR WARNING: ${result.reason}`;
    }
}
