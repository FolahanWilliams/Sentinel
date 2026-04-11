/**
 * Sentinel — Thesis Deduplicator
 *
 * Prevents the same ticker + signal_type from emitting near-duplicate theses
 * within a short time window. Complements `semanticDeduplicator.ts` which
 * operates on INPUT articles; this one operates on OUTPUT signals.
 *
 * Rationale
 * ---------
 * The scanner currently has no guard against re-emitting what is substantively
 * the same signal. Two RSS ingestions 6 hours apart on the same news story
 * can both produce "AAPL is oversold after iPhone launch delay" signals with
 * slightly different wording. This inflates the signal count, spams alerts,
 * and distorts downstream outcome tracking (the same underlying trade counted
 * twice).
 *
 * Algorithm: Jaccard similarity on 3-word shingles, with a short-circuit
 * first-120-chars exact match for obvious copy-paste reruns.
 *
 * Cost: one extra DB query per signal (last 24h, same ticker+type, not closed).
 * Typical result set is 0-5 rows — negligible.
 */

import { supabase } from '@/config/supabase';

/** Default window for lookup in hours. */
const DEFAULT_WINDOW_HOURS = 24;

/** Default Jaccard similarity above which a thesis is considered duplicate. */
const DEFAULT_JACCARD_THRESHOLD = 0.65;

/** Small stopword set — intentionally narrow so financial terms survive. */
const STOPWORDS = new Set([
    'a', 'an', 'and', 'or', 'but', 'the', 'of', 'in', 'on', 'at', 'to', 'for',
    'with', 'by', 'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'can', 'it', 'its', 'this', 'that',
    'these', 'those', 'than', 'then', 'so', 'if', 'not', 'no',
]);

/**
 * Normalize and tokenize a thesis string:
 *  - lowercase
 *  - strip punctuation
 *  - split on whitespace
 *  - drop stopwords and tokens of length < 2
 */
function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Build k-shingles (consecutive k-token sequences) from a tokenized text.
 * Returns an empty set if there are fewer than k tokens.
 */
export function shingle(text: string, k = 3): Set<string> {
    const tokens = tokenize(text);
    const result = new Set<string>();
    if (tokens.length < k) {
        // Fallback: treat every individual token as a 1-shingle so short theses still hash
        for (const t of tokens) result.add(t);
        return result;
    }
    for (let i = 0; i <= tokens.length - k; i++) {
        result.add(tokens.slice(i, i + k).join(' '));
    }
    return result;
}

/** Compute Jaccard similarity |A ∩ B| / |A ∪ B|. Returns 0 if both empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const x of a) {
        if (b.has(x)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

export interface ThesisDuplicateCheck {
    duplicate: boolean;
    matchedSignalId?: string;
    similarity?: number;
    reason?: string;
}

/**
 * Check whether a new thesis is substantively identical to any active signal
 * on the same ticker + signal_type within the last `windowHours`.
 *
 * Behavior:
 *  1. Short-circuit: compare the first 120 chars of the new thesis against each
 *     candidate's first 120 chars. If they match exactly (case-insensitive,
 *     whitespace-collapsed), return duplicate=true with similarity=1.0.
 *  2. Otherwise compute Jaccard on 3-shingles. Return duplicate=true if any
 *     candidate exceeds `threshold`.
 *
 * Signals with status='closed' are NOT considered (so a closed-and-reopened
 * trade can legitimately re-emit).
 *
 * Failures are logged and return `{duplicate: false}` — dedup should never
 * crash the pipeline.
 */
export async function isDuplicateThesis(
    ticker: string,
    signalType: string,
    newThesis: string,
    windowHours: number = DEFAULT_WINDOW_HOURS,
    threshold: number = DEFAULT_JACCARD_THRESHOLD,
): Promise<ThesisDuplicateCheck> {
    if (!newThesis || newThesis.trim().length === 0) {
        return { duplicate: false };
    }

    try {
        const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase
            .from('signals')
            .select('id, thesis, status')
            .eq('ticker', ticker)
            .eq('signal_type', signalType)
            .neq('status', 'closed')
            .gte('created_at', cutoff)
            .limit(20);

        if (error || !data || data.length === 0) {
            return { duplicate: false };
        }

        const newPrefix = newThesis.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
        const newShingles = shingle(newThesis, 3);

        for (const row of data as Array<{ id: string; thesis: string | null }>) {
            if (!row.thesis) continue;

            const existingPrefix = row.thesis.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 120);
            if (existingPrefix === newPrefix) {
                return {
                    duplicate: true,
                    matchedSignalId: row.id,
                    similarity: 1.0,
                    reason: 'prefix match',
                };
            }

            const sim = jaccard(newShingles, shingle(row.thesis, 3));
            if (sim >= threshold) {
                return {
                    duplicate: true,
                    matchedSignalId: row.id,
                    similarity: Math.round(sim * 100) / 100,
                    reason: `Jaccard ${sim.toFixed(2)} ≥ ${threshold}`,
                };
            }
        }

        return { duplicate: false };
    } catch (err: any) {
        console.warn(`[ThesisDedup] non-fatal error for ${ticker}:`, err?.message || err);
        return { duplicate: false };
    }
}
