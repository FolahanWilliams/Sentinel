/**
 * Sentinel — API Cost Estimator & Budget Tracking (Patch 2)
 *
 * Tracks Gemini API usage costs against daily/monthly budgets.
 * Pricing based on Gemini Flash tier.
 */

import { supabase } from '@/config/supabase';
import { DEFAULT_DAILY_BUDGET, DEFAULT_MONTHLY_BUDGET } from '@/config/constants';

// Gemini pricing (USD per 1M tokens — approximate)
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number; groundedPer1M: number }> = {
    'gemini-3-flash': { inputPer1M: 0.075, outputPer1M: 0.30, groundedPer1M: 0.50 },
    'gemini-2.0-flash': { inputPer1M: 0.075, outputPer1M: 0.30, groundedPer1M: 0.50 },
    polygon: { inputPer1M: 0, outputPer1M: 0, groundedPer1M: 0 },
    alphavantage: { inputPer1M: 0, outputPer1M: 0, groundedPer1M: 0 },
};

/**
 * Estimate cost for a single API call.
 */
export function estimateCost(
    provider: string,
    inputTokens: number,
    outputTokens: number,
    grounded: boolean,
): number {
    const rates = PRICING[provider] || PRICING['gemini-3-flash'];
    const inputCost = (inputTokens / 1_000_000) * rates.inputPer1M;
    const outputCost = (outputTokens / 1_000_000) * (grounded ? rates.groundedPer1M : rates.outputPer1M);
    return inputCost + outputCost;
}

/**
 * Get total spend for today (UTC day).
 */
export async function getDailySpend(): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('api_usage')
        .select('estimated_cost_usd')
        .gte('created_at', todayStart.toISOString());

    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + (row.estimated_cost_usd || 0), 0);
}

/**
 * Get total spend for this month (UTC).
 */
export async function getMonthlySpend(): Promise<number> {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('api_usage')
        .select('estimated_cost_usd')
        .gte('created_at', monthStart.toISOString());

    if (error || !data) return 0;
    return data.reduce((sum, row) => sum + (row.estimated_cost_usd || 0), 0);
}

/**
 * Get remaining daily budget.
 */
export async function getRemainingDailyBudget(): Promise<number> {
    const spent = await getDailySpend();
    return Math.max(0, DEFAULT_DAILY_BUDGET - spent);
}

/**
 * Check if daily budget is exceeded.
 */
export async function isBudgetExceeded(): Promise<boolean> {
    const spent = await getDailySpend();
    return spent >= DEFAULT_DAILY_BUDGET;
}

/**
 * Get call counts grouped by provider for today.
 */
export async function getDailyCallCounts(): Promise<Record<string, number>> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('api_usage')
        .select('provider')
        .gte('created_at', todayStart.toISOString());

    if (error || !data) return {};

    const counts: Record<string, number> = {};
    for (const row of data) {
        counts[row.provider] = (counts[row.provider] || 0) + 1;
    }
    return counts;
}

/**
 * Get full budget summary for the Budget Widget.
 */
export async function getBudgetSummary() {
    const [dailySpend, monthlySpend, callCounts] = await Promise.all([
        getDailySpend(),
        getMonthlySpend(),
        getDailyCallCounts(),
    ]);

    const totalCalls = Object.values(callCounts).reduce((a, b) => a + b, 0);

    return {
        dailySpend: Math.round(dailySpend * 10000) / 10000,
        dailyBudget: DEFAULT_DAILY_BUDGET,
        dailyPct: DEFAULT_DAILY_BUDGET > 0 ? Math.min(100, Math.round((dailySpend / DEFAULT_DAILY_BUDGET) * 100)) : 0,
        monthlySpend: Math.round(monthlySpend * 10000) / 10000,
        monthlyBudget: DEFAULT_MONTHLY_BUDGET,
        monthlyPct: DEFAULT_MONTHLY_BUDGET > 0 ? Math.min(100, Math.round((monthlySpend / DEFAULT_MONTHLY_BUDGET) * 100)) : 0,
        callCounts,
        totalCalls,
        avgCostPerCall: totalCalls > 0 ? Math.round((dailySpend / totalCalls) * 10000) / 10000 : 0,
        isExceeded: dailySpend >= DEFAULT_DAILY_BUDGET,
    };
}
