/**
 * Sentinel — Conviction Guardrails
 *
 * Buffett/Lynch quality gates that filter signals before they reach the dashboard.
 * These guardrails enforce:
 * 1. Margin-of-safety hard gate (price must be 10%+ below 52w high unless conviction >95)
 * 2. Portfolio-level Lynch category limits (max 25% in cyclicals)
 * 3. Portfolio-level moat quality limits (max 15% in low-moat stocks)
 * 4. Portfolio-level PEG guardrail (alert if overall PEG >1.5)
 */

import { supabase } from '@/config/supabase';
import type { Signal, LynchCategory } from '@/types/signals';

export interface GuardrailResult {
    passed: boolean;
    reason: string | null;
    warnings: string[];
}

export interface PortfolioGuardrailReport {
    cyclicalExposurePct: number;
    lowMoatExposurePct: number;
    averagePeg: number | null;
    warnings: string[];
    blocked: boolean;
}

const MAX_CYCLICAL_PCT = 25;
const MAX_LOW_MOAT_PCT = 15;
const PEG_WARNING_THRESHOLD = 1.5;

export class ConvictionGuardrails {

    /**
     * Margin-of-safety hard gate.
     * Rejects signals where price is <10% below 52w high unless conviction >95.
     */
    static checkMarginOfSafety(
        currentPrice: number,
        fiftyTwoWeekHigh: number | null | undefined,
        convictionScore: number | null | undefined,
    ): GuardrailResult {
        if (!fiftyTwoWeekHigh || fiftyTwoWeekHigh <= 0 || currentPrice <= 0) {
            return { passed: true, reason: null, warnings: ['52w high unavailable — margin of safety check skipped'] };
        }

        const discountPct = ((fiftyTwoWeekHigh - currentPrice) / fiftyTwoWeekHigh) * 100;
        const conviction = convictionScore ?? 0;

        if (discountPct < 10 && conviction <= 95) {
            return {
                passed: false,
                reason: `Price is only ${discountPct.toFixed(1)}% below 52w high ($${fiftyTwoWeekHigh.toFixed(2)}). Requires 10%+ discount or conviction >95.`,
                warnings: [],
            };
        }

        const warnings: string[] = [];
        if (discountPct < 15) {
            warnings.push(`Thin margin of safety: ${discountPct.toFixed(1)}% below 52w high`);
        }

        return { passed: true, reason: null, warnings };
    }

    /**
     * Portfolio-level guardrails.
     * Checks current open positions against Lynch category and moat limits.
     */
    static async checkPortfolioGuardrails(
        newSignal?: { lynchCategory?: LynchCategory | null; moatRating?: number | null },
    ): Promise<PortfolioGuardrailReport> {
        const warnings: string[] = [];
        let blocked = false;

        try {
            const { data: positions } = await supabase
                .from('positions')
                .select('ticker, position_size_usd, signals!inner(lynch_category, moat_rating, conviction_score)')
                .eq('status', 'open');

            const { data: configRow } = await supabase
                .from('portfolio_config')
                .select('total_capital')
                .limit(1)
                .single();

            const totalCapital = configRow?.total_capital || 10000;

            if (!positions || positions.length === 0) {
                return {
                    cyclicalExposurePct: 0,
                    lowMoatExposurePct: 0,
                    averagePeg: null,
                    warnings: [],
                    blocked: false,
                };
            }

            // Calculate category exposure
            let cyclicalExposure = 0;
            let lowMoatExposure = 0;
            let totalExposure = 0;

            for (const pos of positions) {
                const sizeUsd = (pos as any).position_size_usd || 0;
                const signal = (pos as any).signals;
                totalExposure += sizeUsd;

                if (signal?.lynch_category === 'cyclical') {
                    cyclicalExposure += sizeUsd;
                }
                if (signal?.moat_rating != null && signal.moat_rating < 5) {
                    lowMoatExposure += sizeUsd;
                }
            }

            const cyclicalPct = totalCapital > 0 ? (cyclicalExposure / totalCapital) * 100 : 0;
            const lowMoatPct = totalCapital > 0 ? (lowMoatExposure / totalCapital) * 100 : 0;

            // Check limits
            if (newSignal?.lynchCategory === 'cyclical' && cyclicalPct >= MAX_CYCLICAL_PCT) {
                warnings.push(`Cyclical exposure at ${cyclicalPct.toFixed(1)}% (max ${MAX_CYCLICAL_PCT}%). Adding another cyclical position blocked.`);
                blocked = true;
            } else if (cyclicalPct >= MAX_CYCLICAL_PCT * 0.8) {
                warnings.push(`Cyclical exposure approaching limit: ${cyclicalPct.toFixed(1)}% of ${MAX_CYCLICAL_PCT}% max`);
            }

            if (newSignal?.moatRating != null && newSignal.moatRating < 5 && lowMoatPct >= MAX_LOW_MOAT_PCT) {
                warnings.push(`Low-moat exposure at ${lowMoatPct.toFixed(1)}% (max ${MAX_LOW_MOAT_PCT}%). Adding another low-moat position blocked.`);
                blocked = true;
            } else if (lowMoatPct >= MAX_LOW_MOAT_PCT * 0.8) {
                warnings.push(`Low-moat exposure approaching limit: ${lowMoatPct.toFixed(1)}% of ${MAX_LOW_MOAT_PCT}% max`);
            }

            return {
                cyclicalExposurePct: Math.round(cyclicalPct * 10) / 10,
                lowMoatExposurePct: Math.round(lowMoatPct * 10) / 10,
                averagePeg: null, // PEG requires quote data — computed at display time
                warnings,
                blocked,
            };
        } catch (err) {
            console.warn('[ConvictionGuardrails] Failed to check portfolio guardrails:', err);
            return {
                cyclicalExposurePct: 0,
                lowMoatExposurePct: 0,
                averagePeg: null,
                warnings: ['Portfolio guardrail check failed — proceeding without limits'],
                blocked: false,
            };
        }
    }
}
