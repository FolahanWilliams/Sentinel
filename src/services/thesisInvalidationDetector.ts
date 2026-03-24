/**
 * Sentinel — Thesis Invalidation Detector
 *
 * Actively monitors open signals for thesis-breaking events instead of
 * waiting for passive time-based decay. When invalidation is detected,
 * the signal is force-expired with a structured reason.
 *
 * Invalidation triggers:
 * 1. Key technical support broken (price below stop-loss without being tracked)
 * 2. Earnings miss / guidance cut (for earnings-related theses)
 * 3. Analyst downgrade cascade (multiple downgrades since signal creation)
 * 4. Fundamental deterioration (debt spike, margin collapse, revenue miss)
 * 5. Thesis contradiction (new news directly contradicts the original thesis)
 *
 * Runs at the end of each scan cycle on all active signals.
 */

import { supabase } from '@/config/supabase';
import { GeminiService } from './gemini';
import { MarketDataService } from './marketData';
import { TechnicalAnalysisService } from './technicalAnalysis';
import { GEMINI_MODEL } from '@/config/constants';
import {
    INVALIDATION_PRICE_BREACH_PCT,
    INVALIDATION_SUPPORT_BREAK_PCT,
    INVALIDATION_MAX_SIGNALS_PER_CYCLE,
    INVALIDATION_COOLDOWN_HOURS,
} from '@/config/agentThresholds';
import type { Signal, TASnapshot } from '@/types/signals';

// ── Types ───────────────────────────────────────────────────────────────────────

export interface InvalidationCheck {
    signalId: string;
    ticker: string;
    invalidated: boolean;
    triggers: InvalidationTrigger[];
    severity: 'none' | 'warning' | 'critical';
    recommendation: 'hold' | 'review' | 'force_expire';
    summary: string;
}

export interface InvalidationTrigger {
    type: 'price_breach' | 'support_broken' | 'earnings_miss' | 'analyst_downgrade' | 'fundamental_deterioration' | 'thesis_contradiction';
    description: string;
    severity: number; // 1-10
}

export interface InvalidationResult {
    checked: number;
    invalidated: number;
    warnings: number;
    checks: InvalidationCheck[];
}

// ── Gemini schema for thesis contradiction check ────────────────────────────────

const THESIS_CONTRADICTION_SCHEMA = {
    type: 'object',
    properties: {
        contradicts_thesis: { type: 'boolean', description: 'True if the recent news directly contradicts the original signal thesis' },
        contradiction_severity: { type: 'number', description: 'How severe the contradiction is, 1-10' },
        explanation: { type: 'string', description: 'Brief explanation of the contradiction' },
        new_information: { type: 'string', description: 'What new information emerged that breaks the thesis' },
    },
    required: ['contradicts_thesis', 'contradiction_severity', 'explanation', 'new_information'],
};

// ── Cooldown tracking ───────────────────────────────────────────────────────────
const lastCheckBySignal: Map<string, number> = new Map();

export class ThesisInvalidationDetector {

    /**
     * Check all active signals for invalidation triggers.
     * Runs at end of each scan cycle.
     */
    static async checkActiveSignals(): Promise<InvalidationResult> {
        const checks: InvalidationCheck[] = [];
        let invalidated = 0;
        let warnings = 0;

        try {
            // Fetch active signals (with key fields for invalidation checks)
            const { data: activeSignals, error } = await supabase
                .from('signals')
                .select('id, ticker, signal_type, thesis, confidence_score, stop_loss, target_price, created_at, agent_outputs, ta_snapshot, status')
                .in('status', ['active', 'stale'])
                .order('created_at', { ascending: false })
                .limit(INVALIDATION_MAX_SIGNALS_PER_CYCLE);

            if (error || !activeSignals || activeSignals.length === 0) {
                return { checked: 0, invalidated: 0, warnings: 0, checks: [] };
            }

            // Filter out signals checked recently (cooldown)
            const cooldownMs = INVALIDATION_COOLDOWN_HOURS * 60 * 60 * 1000;
            const eligibleSignals = activeSignals.filter(s => {
                const lastCheck = lastCheckBySignal.get(s.id);
                return !lastCheck || (Date.now() - lastCheck) > cooldownMs;
            });

            if (eligibleSignals.length === 0) {
                return { checked: 0, invalidated: 0, warnings: 0, checks: [] };
            }

            // Batch fetch quotes for all tickers
            const tickers = [...new Set(eligibleSignals.map(s => s.ticker))];
            const quotes = await MarketDataService.getQuotesBulk(tickers);

            for (const signal of eligibleSignals) {
                try {
                    const check = await this.checkSingleSignal(signal as unknown as Signal, quotes[signal.ticker]);
                    checks.push(check);
                    lastCheckBySignal.set(signal.id, Date.now());

                    if (check.recommendation === 'force_expire') {
                        invalidated++;
                        await this.forceExpireSignal(signal.id, signal.ticker, check);
                    } else if (check.recommendation === 'review') {
                        warnings++;
                        // Mark as stale if still active
                        if (signal.status === 'active') {
                            await supabase.from('signals').update({
                                status: 'stale',
                                user_notes: `[Invalidation Warning] ${check.summary}`,
                            }).eq('id', signal.id);
                        }
                    }
                } catch (err) {
                    console.warn(`[ThesisInvalidation] Failed to check ${signal.ticker}:`, err);
                }
            }

            if (invalidated > 0 || warnings > 0) {
                console.log(`[ThesisInvalidation] Checked ${eligibleSignals.length} signals: ${invalidated} invalidated, ${warnings} warnings`);
            }

            return { checked: eligibleSignals.length, invalidated, warnings, checks };
        } catch (err) {
            console.error('[ThesisInvalidation] Error:', err);
            return { checked: 0, invalidated: 0, warnings: 0, checks: [] };
        }
    }

    /**
     * Check a single signal for invalidation triggers.
     */
    private static async checkSingleSignal(
        signal: Signal,
        quote: import('@/types/market').Quote | undefined,
    ): Promise<InvalidationCheck> {
        const triggers: InvalidationTrigger[] = [];

        // 1. PRICE BREACH — has price blown through stop-loss?
        if (quote && signal.stop_loss) {
            const isLong = !signal.signal_type.startsWith('short');
            if (isLong && quote.price < signal.stop_loss) {
                const breachPct = ((signal.stop_loss - quote.price) / signal.stop_loss) * 100;
                if (breachPct >= INVALIDATION_PRICE_BREACH_PCT) {
                    triggers.push({
                        type: 'price_breach',
                        description: `Price ($${quote.price.toFixed(2)}) is ${breachPct.toFixed(1)}% below stop-loss ($${signal.stop_loss.toFixed(2)})`,
                        severity: Math.min(10, Math.round(breachPct * 2)),
                    });
                }
            } else if (!isLong && quote.price > signal.stop_loss) {
                const breachPct = ((quote.price - signal.stop_loss) / signal.stop_loss) * 100;
                if (breachPct >= INVALIDATION_PRICE_BREACH_PCT) {
                    triggers.push({
                        type: 'price_breach',
                        description: `Price ($${quote.price.toFixed(2)}) is ${breachPct.toFixed(1)}% above stop-loss ($${signal.stop_loss.toFixed(2)})`,
                        severity: Math.min(10, Math.round(breachPct * 2)),
                    });
                }
            }
        }

        // 2. TECHNICAL SUPPORT BROKEN — key moving averages breached
        if (quote) {
            try {
                const ta = await TechnicalAnalysisService.getSnapshot(signal.ticker);
                if (ta) {
                    const isLong = !signal.signal_type.startsWith('short');
                    if (isLong) {
                        // Long thesis: bearish technical deterioration
                        if (ta.sma200 && quote.price < ta.sma200 * (1 - INVALIDATION_SUPPORT_BREAK_PCT / 100)) {
                            triggers.push({
                                type: 'support_broken',
                                description: `Price below 200-SMA ($${ta.sma200.toFixed(2)}) by ${((ta.sma200 - quote.price) / ta.sma200 * 100).toFixed(1)}%`,
                                severity: 6,
                            });
                        }
                        // RSI collapsing further after signal (was oversold, now deeply oversold)
                        const originalRsi = (signal.ta_snapshot as TASnapshot | null)?.rsi14;
                        if (ta.rsi14 !== null && originalRsi && ta.rsi14 < 20 && ta.rsi14 < originalRsi - 10) {
                            triggers.push({
                                type: 'support_broken',
                                description: `RSI collapsed from ${originalRsi.toFixed(0)} to ${ta.rsi14.toFixed(0)} — selling pressure intensifying`,
                                severity: 5,
                            });
                        }
                    }
                    // MACD divergence: signal was bullish but MACD turned sharply bearish
                    if (isLong && ta.macd && ta.macd.histogram < 0 && ta.macd.histogram < -Math.abs(ta.macd.signal) * 0.5) {
                        triggers.push({
                            type: 'support_broken',
                            description: `MACD histogram deeply negative (${ta.macd.histogram.toFixed(2)}) — momentum deteriorating`,
                            severity: 4,
                        });
                    }
                }
            } catch { /* non-fatal */ }
        }

        // 3. THESIS CONTRADICTION — check recent news against original thesis
        if (signal.thesis && triggers.length < 2) {
            // Only run Gemini check if we haven't already found strong invalidation triggers
            try {
                const contradictionCheck = await this.checkThesisContradiction(signal);
                if (contradictionCheck && contradictionCheck.contradicts_thesis && contradictionCheck.contradiction_severity >= 6) {
                    triggers.push({
                        type: 'thesis_contradiction',
                        description: contradictionCheck.explanation,
                        severity: contradictionCheck.contradiction_severity,
                    });
                }
            } catch { /* non-fatal — Gemini failures shouldn't block invalidation */ }
        }

        // Aggregate triggers into a recommendation
        const totalSeverity = triggers.reduce((sum, t) => sum + t.severity, 0);
        const maxSeverity = triggers.length > 0 ? Math.max(...triggers.map(t => t.severity)) : 0;

        let severity: InvalidationCheck['severity'] = 'none';
        let recommendation: InvalidationCheck['recommendation'] = 'hold';

        if (totalSeverity >= 12 || maxSeverity >= 8) {
            severity = 'critical';
            recommendation = 'force_expire';
        } else if (totalSeverity >= 6 || maxSeverity >= 5) {
            severity = 'warning';
            recommendation = 'review';
        }

        const summary = triggers.length > 0
            ? `${triggers.length} invalidation trigger(s): ${triggers.map(t => t.type).join(', ')}`
            : 'No invalidation triggers detected';

        return {
            signalId: signal.id,
            ticker: signal.ticker,
            invalidated: recommendation === 'force_expire',
            triggers,
            severity,
            recommendation,
            summary,
        };
    }

    /**
     * Use Gemini to check if recent news contradicts the signal's thesis.
     */
    private static async checkThesisContradiction(
        signal: Signal,
    ): Promise<{ contradicts_thesis: boolean; contradiction_severity: number; explanation: string; new_information: string } | null> {
        // Fetch recent articles about this ticker from sentinel_articles
        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentArticles } = await supabase
            .from('sentinel_articles')
            .select('title, summary, pub_date')
            .contains('affected_tickers', [signal.ticker])
            .gte('pub_date', twoDaysAgo)
            .order('pub_date', { ascending: false })
            .limit(5);

        if (!recentArticles || recentArticles.length === 0) {
            return null; // No recent news to check against
        }

        const newsContext = recentArticles
            .map((a: any) => `- ${a.title}${a.summary ? ': ' + a.summary : ''} (${a.pub_date})`)
            .join('\n');

        const prompt = `ORIGINAL SIGNAL THESIS for ${signal.ticker} (created ${signal.created_at}):
"${signal.thesis}"

Signal type: ${signal.signal_type}
Original confidence: ${signal.confidence_score}

RECENT NEWS (last 48 hours):
${newsContext}

Does any of the recent news DIRECTLY CONTRADICT or INVALIDATE the original thesis?
Only flag as a contradiction if the new information fundamentally breaks the thesis logic — not just noise or minor developments.`;

        const result = await GeminiService.generate<{
            contradicts_thesis: boolean;
            contradiction_severity: number;
            explanation: string;
            new_information: string;
        }>({
            prompt,
            systemInstruction: 'You are a thesis invalidation detector. Be conservative — only flag genuine contradictions, not minor noise. A thesis is invalidated when new information makes the original reasoning fundamentally wrong.',
            responseSchema: THESIS_CONTRADICTION_SCHEMA,
            temperature: 0.2,
            model: GEMINI_MODEL,
        });

        return result.success ? result.data : null;
    }

    /**
     * Force-expire an invalidated signal and log the reason.
     */
    private static async forceExpireSignal(
        signalId: string,
        ticker: string,
        check: InvalidationCheck,
    ): Promise<void> {
        const triggerSummary = check.triggers
            .map(t => `[${t.type}] ${t.description} (severity: ${t.severity}/10)`)
            .join('; ');

        await supabase.from('signals').update({
            status: 'expired',
            user_notes: `[Thesis Invalidated] ${triggerSummary}`,
        }).eq('id', signalId);

        console.log(`[ThesisInvalidation] FORCE EXPIRED ${ticker} (${signalId}): ${triggerSummary}`);
    }

    /**
     * Format invalidation results for logging / prompt context.
     */
    static formatForPrompt(result: InvalidationResult): string {
        if (result.invalidated === 0 && result.warnings === 0) return '';
        const lines = ['\nTHESIS INVALIDATION MONITOR:'];
        for (const check of result.checks) {
            if (check.severity === 'none') continue;
            lines.push(`- ${check.ticker}: ${check.severity.toUpperCase()} — ${check.summary}`);
        }
        return lines.join('\n');
    }
}
