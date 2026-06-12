/**
 * Sentinel — Earnings Calendar Guard
 *
 * Checks if a ticker has upcoming earnings within a configurable window and
 * penalizes or blocks signals near earnings to avoid thesis-invalidating events.
 *
 * Source priority:
 *   1. Deterministic earnings date (EarningsCalendarService → `earnings` proxy
 *      endpoint: Yahoo calendarEvents, keyless; Finnhub fallback). Real data.
 *   2. Gemini grounded search — used only when no deterministic date is found.
 *
 * Results cached for 6 hours to minimize API calls.
 */

import { supabase } from '@/config/supabase';
import { EarningsCalendarService } from './earningsCalendarService';

export interface EarningsGuardResult {
    hasUpcomingEarnings: boolean;
    earningsDate: string | null;       // ISO date or descriptive string
    daysUntilEarnings: number | null;  // null if unknown
    confidencePenalty: number;          // 0 to -30
    shouldBlock: boolean;              // true if earnings are imminent (≤2 days)
    reason: string;
}

const earningsCache = new Map<string, { result: EarningsGuardResult; timestamp: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const NO_EARNINGS: EarningsGuardResult = {
    hasUpcomingEarnings: false,
    earningsDate: null,
    daysUntilEarnings: null,
    confidencePenalty: 0,
    shouldBlock: false,
    reason: 'No upcoming earnings detected within 14 days.',
};

export class EarningsGuard {

    /**
     * Map days-until-earnings to a penalty/block recommendation. Single source
     * of the penalty ladder so the deterministic and Gemini paths can't drift.
     */
    static penaltyForDays(daysUntil: number, dateStr: string | null): EarningsGuardResult {
        if (daysUntil < 0 || daysUntil > 14) {
            return { ...NO_EARNINGS, earningsDate: dateStr, daysUntilEarnings: daysUntil };
        }
        let penalty = 0;
        let shouldBlock = false;
        let reason = '';
        if (daysUntil <= 2) {
            shouldBlock = true;
            penalty = -30;
            reason = `BLOCKED: Earnings in ${daysUntil} day(s) (${dateStr}). Signal thesis may be invalidated by report.`;
        } else if (daysUntil <= 5) {
            penalty = -25;
            reason = `Earnings in ${daysUntil} days (${dateStr}). High risk of thesis invalidation.`;
        } else if (daysUntil <= 7) {
            penalty = -15;
            reason = `Earnings in ${daysUntil} days (${dateStr}). Signal may not play out before report.`;
        } else {
            penalty = -5;
            reason = `Earnings in ${daysUntil} days (${dateStr}). Consider shorter timeframe.`;
        }
        return {
            hasUpcomingEarnings: true,
            earningsDate: dateStr,
            daysUntilEarnings: daysUntil,
            confidencePenalty: penalty,
            shouldBlock,
            reason,
        };
    }

    /**
     * Check if a ticker has earnings coming up within the next 14 days.
     */
    static async check(ticker: string): Promise<EarningsGuardResult> {
        const upperTicker = ticker.toUpperCase();

        const cached = earningsCache.get(upperTicker);
        if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
            return cached.result;
        }

        // ── 1. Deterministic source (real earnings date) ──────────────────
        try {
            const det = await EarningsCalendarService.getUpcomingEarnings(upperTicker, 30);
            if (det.earningsDate && typeof det.daysUntilEarnings === 'number') {
                const result = this.penaltyForDays(det.daysUntilEarnings, det.earningsDate);
                earningsCache.set(upperTicker, { result, timestamp: Date.now() });
                if (result.hasUpcomingEarnings) console.log(`[EarningsGuard] ${upperTicker}: ${result.reason}`);
                return result;
            }
        } catch (e) {
            console.warn(`[EarningsGuard] Deterministic lookup failed for ${upperTicker}:`, e);
        }

        // ── 2. Gemini grounded search fallback ────────────────────────────
        try {
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
                earningsCache.set(upperTicker, { result: NO_EARNINGS, timestamp: Date.now() });
                return NO_EARNINGS;
            }

            let parsed: any;
            try {
                const jsonText = data.text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
                const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
                parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText);
            } catch {
                console.warn(`[EarningsGuard] Failed to parse response for ${upperTicker}:`, data.text?.substring(0, 200));
                earningsCache.set(upperTicker, { result: NO_EARNINGS, timestamp: Date.now() });
                return NO_EARNINGS;
            }

            if (!parsed.has_earnings_soon) {
                earningsCache.set(upperTicker, { result: NO_EARNINGS, timestamp: Date.now() });
                return NO_EARNINGS;
            }

            const daysUntil = parsed.days_until ?? null;
            const result: EarningsGuardResult = daysUntil !== null
                ? this.penaltyForDays(daysUntil, parsed.earnings_date || null)
                : {
                    hasUpcomingEarnings: true,
                    earningsDate: parsed.earnings_date || null,
                    daysUntilEarnings: null,
                    confidencePenalty: -10,
                    shouldBlock: false,
                    reason: 'Earnings reported as imminent but exact date unknown. Exercise caution.',
                };

            earningsCache.set(upperTicker, { result, timestamp: Date.now() });
            console.log(`[EarningsGuard] ${upperTicker}: ${result.reason}`);
            return result;

        } catch (err) {
            console.error(`[EarningsGuard] Error for ${upperTicker}:`, err);
            earningsCache.set(upperTicker, { result: NO_EARNINGS, timestamp: Date.now() });
            return NO_EARNINGS;
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
