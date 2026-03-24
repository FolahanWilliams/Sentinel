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
    /** Auto-resolution actions taken (if any) */
    resolutions: ConflictResolution[];
}

export interface ConflictResolution {
    action: 'expire_existing' | 'reduce_existing_confidence' | 'supersede' | 'none';
    existingSignalId: string;
    existingTicker: string;
    reason: string;
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

        // Auto-resolve conflicts instead of just flagging them
        const resolutions = await this.autoResolveConflicts(conflicts, activeSignals);

        // Recalculate penalties after resolution (resolved conflicts get reduced penalties)
        let penalty = 0;
        let shouldBlock = false;
        const resolvedIds = new Set(resolutions.filter(r => r.action !== 'none').map(r => r.existingSignalId));

        for (const conflict of conflicts) {
            // Resolved conflicts don't contribute to penalties
            if (resolvedIds.has(conflict.existingSignalId)) continue;

            switch (conflict.severity) {
                case 'high':
                    penalty -= 20;
                    shouldBlock = true;
                    break;
                case 'medium':
                    penalty -= 10;
                    break;
                case 'low':
                    penalty -= 5;
                    break;
            }
        }

        // If all high-severity conflicts were resolved, don't block
        if (shouldBlock && conflicts.filter(c => c.severity === 'high' && !resolvedIds.has(c.existingSignalId)).length === 0) {
            shouldBlock = false;
        }

        // Cap penalty
        penalty = Math.max(-30, penalty);

        const summary = conflicts.map(c => {
            const resolved = resolvedIds.has(c.existingSignalId) ? ' [RESOLVED]' : '';
            return `[${c.severity.toUpperCase()}] ${c.conflictType}: ${c.explanation}${resolved}`;
        }).join(' | ');

        console.log(`[ConflictDetector] ${newTicker}: ${conflicts.length} conflicts found, ${resolutions.filter(r => r.action !== 'none').length} auto-resolved (penalty=${penalty}, block=${shouldBlock})`);

        return {
            hasConflicts: true,
            conflicts,
            confidencePenalty: penalty,
            shouldBlock,
            summary,
            resolutions,
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

    /**
     * Auto-resolve conflicts by evaluating which signal has stronger evidence.
     * Resolution strategies:
     * 1. Expire stale/decayed existing signal if new signal is stronger
     * 2. Reduce existing signal's confidence if new thesis supersedes it
     * 3. Supersede: mark existing as superseded by the new signal
     */
    private static async autoResolveConflicts(
        conflicts: ThesisConflict[],
        activeSignals: any[],
    ): Promise<ConflictResolution[]> {
        const resolutions: ConflictResolution[] = [];

        for (const conflict of conflicts) {
            const existing = activeSignals.find(s => s.id === conflict.existingSignalId);
            if (!existing) {
                resolutions.push({ action: 'none', existingSignalId: conflict.existingSignalId, existingTicker: conflict.existingTicker, reason: 'Signal not found' });
                continue;
            }

            const daysActive = (Date.now() - new Date(existing.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24);

            // Strategy 1: Expire stale existing signals (>7 days old with low confidence)
            if (daysActive > 7 && existing.confidence_score < 55) {
                try {
                    await supabase.from('signals').update({
                        status: 'expired',
                        user_notes: `[Auto-resolved] Expired stale signal (${daysActive.toFixed(0)}d old, conf=${existing.confidence_score}) due to conflicting new signal on ${conflict.existingTicker}.`,
                    }).eq('id', conflict.existingSignalId);

                    resolutions.push({
                        action: 'expire_existing',
                        existingSignalId: conflict.existingSignalId,
                        existingTicker: conflict.existingTicker,
                        reason: `Expired stale ${conflict.existingDirection} signal (${daysActive.toFixed(0)}d old, confidence ${existing.confidence_score})`,
                    });
                    console.log(`[ConflictDetector] Auto-resolved: expired stale ${conflict.existingTicker} signal ${conflict.existingSignalId}`);
                } catch {
                    resolutions.push({ action: 'none', existingSignalId: conflict.existingSignalId, existingTicker: conflict.existingTicker, reason: 'DB update failed' });
                }
                continue;
            }

            // Strategy 2: Reduce confidence of older, weaker existing signal
            if (daysActive > 3 && conflict.severity === 'medium') {
                try {
                    const reducedConfidence = Math.max(30, existing.confidence_score - 15);
                    await supabase.from('signals').update({
                        confidence_score: reducedConfidence,
                        user_notes: `[Auto-resolved] Confidence reduced ${existing.confidence_score} → ${reducedConfidence} due to conflicting sector signal.`,
                    }).eq('id', conflict.existingSignalId);

                    resolutions.push({
                        action: 'reduce_existing_confidence',
                        existingSignalId: conflict.existingSignalId,
                        existingTicker: conflict.existingTicker,
                        reason: `Reduced confidence ${existing.confidence_score} → ${reducedConfidence} (sector conflict, ${daysActive.toFixed(0)}d old)`,
                    });
                    console.log(`[ConflictDetector] Auto-resolved: reduced confidence for ${conflict.existingTicker} signal ${conflict.existingSignalId}`);
                } catch {
                    resolutions.push({ action: 'none', existingSignalId: conflict.existingSignalId, existingTicker: conflict.existingTicker, reason: 'DB update failed' });
                }
                continue;
            }

            // Strategy 3: For direct contradictions on fresh signals, attempt AI-assisted resolution
            if (conflict.conflictType === 'direct_contradiction' && daysActive <= 3) {
                // Fresh direct contradiction — don't auto-resolve, let the block stand
                // but mark it so the user knows why
                resolutions.push({
                    action: 'none',
                    existingSignalId: conflict.existingSignalId,
                    existingTicker: conflict.existingTicker,
                    reason: `Fresh direct contradiction (${daysActive.toFixed(1)}d old, conf=${existing.confidence_score}) — requires manual review`,
                });
                continue;
            }

            resolutions.push({
                action: 'none',
                existingSignalId: conflict.existingSignalId,
                existingTicker: conflict.existingTicker,
                reason: 'No auto-resolution applicable',
            });
        }

        // Invalidate cache since we may have modified signals
        if (resolutions.some(r => r.action !== 'none')) {
            this.invalidateCache();
        }

        return resolutions;
    }

    // ─── Private Helpers ───

    private static async getActiveSignals(): Promise<any[]> {
        if (activeSignalCache && (Date.now() - cacheTimestamp) < CACHE_TTL) {
            return activeSignalCache;
        }

        try {
            const { data } = await supabase
                .from('signals')
                .select('id, ticker, signal_type, thesis, status, confidence_score, created_at')
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
            resolutions: [],
        };
    }
}
