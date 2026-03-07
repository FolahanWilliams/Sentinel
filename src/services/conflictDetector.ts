/**
 * Sentinel — Cross-Signal Thesis Conflict Detection
 *
 * Detects contradictions between active signals:
 * - Long on AAPL + bearish signal on Technology sector
 * - Bullish on NVDA + short on SMH (semiconductor ETF)
 * - Multiple opposing signals on correlated tickers
 *
 * Flags conflicts and applies confidence penalties to prevent
 * the system from hedging against itself.
 */

import { supabase } from '@/config/supabase';
import { GeminiService } from './gemini';
import { GEMINI_MODEL } from '@/config/constants';

export interface ConflictResult {
    hasConflicts: boolean;
    conflicts: ThesisConflict[];
    confidencePenalty: number; // aggregate penalty for the new signal
    shouldBlock: boolean;
    summary: string;
}

export interface ThesisConflict {
    existingSignalId: string;
    existingTicker: string;
    existingDirection: 'long' | 'short';
    existingThesis: string;
    conflictType: 'direct_contradiction' | 'sector_conflict' | 'correlated_opposition';
    severity: 'low' | 'medium' | 'high';
    explanation: string;
}

// Sector and ETF mapping for conflict detection
const SECTOR_ETF_MAP: Record<string, string[]> = {
    'Technology': ['XLK', 'QQQ', 'VGT', 'AAPL', 'MSFT', 'GOOG', 'GOOGL', 'META'],
    'Semiconductors': ['SMH', 'SOXX', 'NVDA', 'AMD', 'INTC', 'TSM', 'AVGO', 'QCOM', 'MU'],
    'AI/Cloud': ['CLOU', 'BOTZ', 'NVDA', 'MSFT', 'GOOG', 'AMZN', 'CRM', 'SNOW', 'PLTR'],
    'Biotech': ['XBI', 'IBB', 'MRNA', 'PFE', 'JNJ', 'ABBV', 'LLY'],
    'Cybersecurity': ['HACK', 'BUG', 'CRWD', 'PANW', 'ZS', 'FTNT', 'S'],
    'Fintech': ['ARKF', 'SQ', 'PYPL', 'COIN', 'SOFI', 'AFRM', 'UPST'],
    'Energy': ['XLE', 'XOP', 'XOM', 'CVX', 'OXY', 'SLB', 'COP'],
};

// Cache: refresh active signals once per scan cycle
let activeSignalCache: any[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 2 * 60 * 1000; // 2 min

export class ConflictDetector {

    /**
     * Check if a proposed new signal conflicts with existing active signals.
     */
    static async checkConflicts(
        newTicker: string,
        newDirection: 'long' | 'short',
        _newThesis: string,
        newSector: string
    ): Promise<ConflictResult> {
        const activeSignals = await this.getActiveSignals();

        if (activeSignals.length === 0) {
            return this.noConflictResult();
        }

        const conflicts: ThesisConflict[] = [];

        for (const signal of activeSignals) {
            // Skip same ticker — that's handled by freshness check
            const existingDirection = this.inferDirection(signal.signal_type);

            // 1. Direct contradiction: same ticker, opposing direction
            if (signal.ticker === newTicker && existingDirection !== newDirection) {
                conflicts.push({
                    existingSignalId: signal.id,
                    existingTicker: signal.ticker,
                    existingDirection,
                    existingThesis: signal.thesis || '',
                    conflictType: 'direct_contradiction',
                    severity: 'high',
                    explanation: `Active ${existingDirection} signal on ${signal.ticker} contradicts new ${newDirection} signal.`,
                });
                continue;
            }

            // 2. Sector conflict: long on ticker in sector X + short/bearish signal on sector X
            if (newDirection !== existingDirection) {
                const existingSector = this.getSectorForTicker(signal.ticker);
                if (existingSector && existingSector === newSector) {
                    conflicts.push({
                        existingSignalId: signal.id,
                        existingTicker: signal.ticker,
                        existingDirection,
                        existingThesis: signal.thesis || '',
                        conflictType: 'sector_conflict',
                        severity: 'medium',
                        explanation: `Active ${existingDirection} on ${signal.ticker} (${existingSector}) conflicts with new ${newDirection} on ${newTicker} in same sector.`,
                    });
                    continue;
                }
            }

            // 3. Correlated opposition: tickers in same sector ETF basket
            if (newDirection !== existingDirection && this.areCorrelated(newTicker, signal.ticker)) {
                conflicts.push({
                    existingSignalId: signal.id,
                    existingTicker: signal.ticker,
                    existingDirection,
                    existingThesis: signal.thesis || '',
                    conflictType: 'correlated_opposition',
                    severity: 'low',
                    explanation: `${newTicker} and ${signal.ticker} are correlated — opposing directions may cancel out.`,
                });
            }
        }

        if (conflicts.length === 0) {
            return this.noConflictResult();
        }

        // Calculate aggregate penalty
        let penalty = 0;
        let shouldBlock = false;

        for (const conflict of conflicts) {
            switch (conflict.severity) {
                case 'high':
                    penalty -= 20;
                    shouldBlock = true; // Direct contradiction = block
                    break;
                case 'medium':
                    penalty -= 10;
                    break;
                case 'low':
                    penalty -= 5;
                    break;
            }
        }

        // Cap penalty
        penalty = Math.max(-30, penalty);

        const summary = conflicts.map(c =>
            `[${c.severity.toUpperCase()}] ${c.conflictType}: ${c.explanation}`
        ).join(' | ');

        console.log(`[ConflictDetector] ${newTicker}: ${conflicts.length} conflicts found (penalty=${penalty}, block=${shouldBlock})`);

        return {
            hasConflicts: true,
            conflicts,
            confidencePenalty: penalty,
            shouldBlock,
            summary,
        };
    }

    /**
     * Use AI to detect subtle thesis conflicts that rule-based checks might miss.
     * Only called when there are active signals in related sectors.
     */
    static async deepConflictCheck(
        newTicker: string,
        newThesis: string,
        activeSignals: Array<{ ticker: string; thesis: string; signal_type: string }>
    ): Promise<{ hasConflict: boolean; explanation: string; penalty: number }> {
        if (activeSignals.length === 0) {
            return { hasConflict: false, explanation: '', penalty: 0 };
        }

        const signalContext = activeSignals.map(s =>
            `- ${s.ticker} (${s.signal_type}): ${s.thesis}`
        ).join('\n');

        try {
            const result = await GeminiService.generate<any>({
                prompt: `NEW PROPOSED SIGNAL:
Ticker: ${newTicker}
Thesis: ${newThesis}

EXISTING ACTIVE SIGNALS:
${signalContext}

Does the new signal's thesis fundamentally contradict any existing signal?
Consider: sector rotation implications, macro thesis conflicts, supply chain dependencies.

Return JSON: {"has_conflict": true/false, "explanation": "why or why not", "penalty": 0 to -15}
If no conflict: {"has_conflict": false, "explanation": "No conflict detected.", "penalty": 0}`,
                requireGroundedSearch: false,
                temperature: 0.2,
                model: GEMINI_MODEL,
                responseSchema: {
                    type: 'OBJECT',
                    properties: {
                        has_conflict: { type: 'BOOLEAN' },
                        explanation: { type: 'STRING' },
                        penalty: { type: 'NUMBER' },
                    },
                    required: ['has_conflict', 'explanation', 'penalty'],
                },
            });

            if (result.success && result.data) {
                return {
                    hasConflict: result.data.has_conflict ?? false,
                    explanation: result.data.explanation ?? '',
                    penalty: Math.max(-15, Math.min(0, result.data.penalty ?? 0)),
                };
            }
        } catch (err) {
            console.warn('[ConflictDetector] Deep check failed:', err);
        }

        return { hasConflict: false, explanation: '', penalty: 0 };
    }

    /**
     * Format conflict data for agent prompt injection.
     */
    static formatForPrompt(result: ConflictResult): string {
        if (!result.hasConflicts) return '';
        const lines = ['\nTHESIS CONFLICT WARNING:'];
        for (const c of result.conflicts) {
            lines.push(`- [${c.severity.toUpperCase()}] ${c.conflictType}: ${c.explanation}`);
        }
        lines.push(`Total penalty: ${result.confidencePenalty}. ${result.shouldBlock ? 'SIGNAL BLOCKED due to direct contradiction.' : 'Adjust confidence accordingly.'}`);
        return lines.join('\n');
    }

    /**
     * Invalidate active signal cache (call after new signal creation).
     */
    static invalidateCache(): void {
        activeSignalCache = null;
        cacheTimestamp = 0;
    }

    // ─── Private Helpers ───

    private static async getActiveSignals(): Promise<any[]> {
        if (activeSignalCache && (Date.now() - cacheTimestamp) < CACHE_TTL) {
            return activeSignalCache;
        }

        try {
            const { data } = await supabase
                .from('signals')
                .select('id, ticker, signal_type, thesis, status, confidence_score')
                .eq('status', 'active');

            activeSignalCache = data || [];
            cacheTimestamp = Date.now();
            return activeSignalCache;
        } catch {
            return [];
        }
    }

    private static inferDirection(signalType: string): 'long' | 'short' {
        if (signalType.includes('short')) return 'short';
        return 'long'; // Default for overreaction, contagion = long plays
    }

    private static getSectorForTicker(ticker: string): string | null {
        for (const [sector, tickers] of Object.entries(SECTOR_ETF_MAP)) {
            if (tickers.includes(ticker.toUpperCase())) return sector;
        }
        return null;
    }

    private static areCorrelated(tickerA: string, tickerB: string): boolean {
        const a = tickerA.toUpperCase();
        const b = tickerB.toUpperCase();
        for (const tickers of Object.values(SECTOR_ETF_MAP)) {
            if (tickers.includes(a) && tickers.includes(b)) return true;
        }
        return false;
    }

    private static noConflictResult(): ConflictResult {
        return {
            hasConflicts: false,
            conflicts: [],
            confidencePenalty: 0,
            shouldBlock: false,
            summary: 'No thesis conflicts detected.',
        };
    }
}
