/**
 * Sentinel — Toxic Combination Detector (Decision Intel Port)
 *
 * Ported from Decision Intel's toxic-combinations.ts (Wiz-inspired model).
 * Detects when multiple individual biases combine with contextual risk factors
 * to create compound decision risk. Individual biases are manageable — but
 * certain COMBINATIONS multiply risk non-linearly.
 *
 * 6 trading-specific named patterns adapted from Decision Intel's 9 enterprise patterns.
 * Pure deterministic logic — no Gemini call (fast, free).
 */

import type { BiasDetectiveFinding, ToxicPattern, ToxicCombinationResult } from '@/types/agents';
import {
    TOXIC_COMBO_SEVERE_PENALTY,
    TOXIC_COMBO_HIGH_PENALTY,
    TOXIC_COMBO_MODERATE_PENALTY,
    TOXIC_COMBO_SEVERE_THRESHOLD,
    TOXIC_COMBO_HIGH_THRESHOLD,
    TOXIC_COMBO_MODERATE_THRESHOLD,
} from '@/config/constants';

// ── Context Flags (passed from scanner pipeline) ────────────────────────────

export interface ToxicContextFlags {
    taAlignment?: string;              // 'confirmed' | 'partial' | 'conflicting' | 'unavailable'
    sourceCount?: number;              // number of independent news sources
    debtToEquity?: number | null;      // fundamentals
    profitMargin?: number | null;
    regime?: string;                   // market regime
    volumeRatio?: number | null;       // current volume / avg volume
}

// ── Named Toxic Patterns ────────────────────────────────────────────────────

interface PatternDefinition {
    name: string;
    biases: string[];                  // ALL must be present (AND logic)
    baseRisk: number;
    amplifierCheck: (ctx: ToxicContextFlags) => { amplified: boolean; multiplier: number; reason: string };
}

const TOXIC_PATTERNS: PatternDefinition[] = [
    {
        name: 'The Momentum Trap',
        biases: ['recency', 'herding'],
        baseRisk: 70,
        amplifierCheck: (ctx) => {
            if (ctx.taAlignment === 'conflicting' || ctx.taAlignment === 'unavailable') {
                return { amplified: true, multiplier: 1.3, reason: 'No TA confirmation — chasing momentum blind' };
            }
            return { amplified: false, multiplier: 1.0, reason: '' };
        },
    },
    {
        name: 'The Anchor Chain',
        biases: ['anchoring', 'overconfidence'],
        baseRisk: 75,
        amplifierCheck: (ctx) => {
            if ((ctx.sourceCount ?? 0) <= 1) {
                return { amplified: true, multiplier: 1.4, reason: 'Thin catalyst (single source) amplifies anchoring risk' };
            }
            return { amplified: false, multiplier: 1.0, reason: '' };
        },
    },
    {
        name: 'The Echo Chamber',
        biases: ['confirmation', 'narrative_fallacy'],
        baseRisk: 72,
        amplifierCheck: (ctx) => {
            if ((ctx.sourceCount ?? 0) < 3) {
                return { amplified: true, multiplier: 1.3, reason: 'Low source diversity reinforces echo chamber' };
            }
            return { amplified: false, multiplier: 1.0, reason: '' };
        },
    },
    {
        name: 'The FOMO Spiral',
        biases: ['regret_aversion', 'availability'],
        baseRisk: 68,
        amplifierCheck: (ctx) => {
            if ((ctx.volumeRatio ?? 0) > 3.0) {
                return { amplified: true, multiplier: 1.2, reason: 'High volume spike indicates FOMO-driven buying' };
            }
            return { amplified: false, multiplier: 1.0, reason: '' };
        },
    },
    {
        name: 'The Dead Cat',
        biases: ['overreaction', 'loss_aversion'],
        baseRisk: 80,
        amplifierCheck: (ctx) => {
            if ((ctx.debtToEquity ?? 0) > 3 || (ctx.profitMargin ?? 1) < -0.1) {
                return { amplified: true, multiplier: 1.5, reason: 'Weak fundamentals — bounce may be a dead cat' };
            }
            return { amplified: false, multiplier: 1.0, reason: '' };
        },
    },
    {
        name: 'The Herd Anchor',
        biases: ['herding', 'anchoring', 'recency'],
        baseRisk: 85,
        amplifierCheck: (ctx) => {
            if (ctx.regime === 'crisis' || ctx.regime === 'correction') {
                return { amplified: true, multiplier: 1.4, reason: 'Risk-off regime amplifies herd behavior' };
            }
            return { amplified: false, multiplier: 1.0, reason: '' };
        },
    },
];

// ── Public API ──────────────────────────────────────────────────────────────

export class ToxicCombinationDetector {

    /**
     * Detect toxic bias combinations from Bias Detective findings + pipeline context.
     */
    static detect(
        biasFindings: BiasDetectiveFinding[],
        context: ToxicContextFlags,
    ): ToxicCombinationResult {
        // Extract unique bias names from findings (only severity >= 2 matters)
        const activeBiases = new Set(
            biasFindings
                .filter(f => f.severity >= 2)
                .map(f => f.bias_name)
        );

        const detectedPatterns: ToxicPattern[] = [];

        for (const pattern of TOXIC_PATTERNS) {
            // Check if ALL required biases are present
            const allPresent = pattern.biases.every(b => activeBiases.has(b));
            if (!allPresent) continue;

            // Check context amplifier
            const amplifier = pattern.amplifierCheck(context);
            const amplifiedRisk = Math.round(pattern.baseRisk * amplifier.multiplier);

            detectedPatterns.push({
                name: pattern.name,
                biases: pattern.biases,
                base_risk: pattern.baseRisk,
                amplified_risk: amplifiedRisk,
                amplifier_reason: amplifier.amplified ? amplifier.reason : null,
            });
        }

        // Compound risk = highest individual pattern risk (not additive — worst-case dominates)
        const compoundRisk = detectedPatterns.length > 0
            ? Math.max(...detectedPatterns.map(p => p.amplified_risk))
            : 0;

        // Determine penalty
        let penalty = 0;
        if (compoundRisk >= TOXIC_COMBO_SEVERE_THRESHOLD) {
            penalty = TOXIC_COMBO_SEVERE_PENALTY;
        } else if (compoundRisk >= TOXIC_COMBO_HIGH_THRESHOLD) {
            penalty = TOXIC_COMBO_HIGH_PENALTY;
        } else if (compoundRisk >= TOXIC_COMBO_MODERATE_THRESHOLD) {
            penalty = TOXIC_COMBO_MODERATE_PENALTY;
        }

        return {
            patterns_detected: detectedPatterns,
            compound_risk_score: compoundRisk,
            confidence_penalty: penalty,
            highest_risk_pattern: detectedPatterns.length > 0
                ? detectedPatterns.reduce((a, b) => a.amplified_risk > b.amplified_risk ? a : b).name
                : null,
            is_toxic: detectedPatterns.length > 0,
        };
    }
}
