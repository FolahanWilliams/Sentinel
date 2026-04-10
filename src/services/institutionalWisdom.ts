/**
 * InstitutionalWisdom — Master Case Study Library
 *
 * Provides curated, institutional-grade "Anchor Lessons" from historical market cycles.
 * These act as synthetic experience for the AI agents, providing causal context
 * and "Black Swan" awareness before live data is accumulated.
 */

export interface MasterLesson {
    id: string;
    title: string;
    description: string;
    regimeThresholds?: {
        regime?: string;
        minVix?: number;
        spyTrend?: 'above_200sma' | 'below_200sma';
    };
    sectorFocus?: string[];
    rule: string;
    causalLogic: string;
    severity: 'info' | 'warning' | 'critical';
}

const MASTER_CASE_STUDIES: MasterLesson[] = [
    {
        id: 'correction_value_trap',
        title: 'The Correction-Regime Value Trap',
        description: 'Buying high-beta growth on 10% dips during broad market liquidity contraction.',
        regimeThresholds: {
            spyTrend: 'below_200sma',
            minVix: 25
        },
        sectorFocus: ['Technology', 'Consumer Cyclical'],
        rule: 'In a broad correction (SPY < 200-SMA), "oversold" growth stocks often become liquidity traps. Reduce long confidence by 40% if the ticker has negative net income.',
        causalLogic: 'When net liquidity contracts, high-duration assets (growth) are liquidated first regardless of headline overreactions. Mean-reversion fails here.',
        severity: 'critical'
    },
    {
        id: 'crowded_short_squeeze',
        title: 'The Reflexive Short Squeeze',
        description: 'Shorting based on valuation when short interest is extreme and retail volume is surging.',
        rule: 'Never generate "Short" signals on micro/small-caps with Short Interest > 30% and a 200% surge in social sentiment volume.',
        causalLogic: 'reflexivity dictates that price action creates its own fundamental reality in a squeeze. Valuation is a trailing indicator here.',
        severity: 'critical'
    },
    {
        id: 'geopolitical_shock_rotation',
        title: 'The Geopolitical Shock Rotation',
        description: 'Immediate capital flight from risk-assets into defense/energy during conflict triggers.',
        regimeThresholds: {
            minVix: 15 // Sudden spike detection usually happens at regime level
        },
        rule: 'In the first 48 hours of a major geopolitical conflict (e.g., Iran-Israel), ignore technical "overbought" signals on Defense (ITA, LMT) and Energy (XLE). Longs here are macro-driven, not TA-driven.',
        causalLogic: 'Geopolitical risk triggers a global portfolio rebalancing. Defense and Energy act as hedges; they will rally on momentum until the "shock" is fully priced, ignoring standard oscillator exhaustion.',
        severity: 'warning'
    }
];

export class InstitutionalWisdom {
    /**
     * Get lessons relevant to the current market regime and sector.
     */
    static getRelevantLessons(context: {
        regime?: string;
        vix?: number;
        spyTrend?: 'above_200sma' | 'below_200sma' | 'unknown';
        sector?: string;
    }): MasterLesson[] {
        return MASTER_CASE_STUDIES.filter(lesson => {
            // Check regime thresholds if defined
            if (lesson.regimeThresholds) {
                if (lesson.regimeThresholds.regime && context.regime && lesson.regimeThresholds.regime !== context.regime) {
                    return false;
                }
                if (lesson.regimeThresholds.minVix && context.vix && context.vix < lesson.regimeThresholds.minVix) {
                    return false;
                }
                if (lesson.regimeThresholds.spyTrend && context.spyTrend && context.spyTrend !== 'unknown' && lesson.regimeThresholds.spyTrend !== context.spyTrend) {
                    return false;
                }
            }

            // Check sector focus if defined (if empty, applies to all)
            if (lesson.sectorFocus && lesson.sectorFocus.length > 0 && context.sector) {
                if (!lesson.sectorFocus.includes(context.sector)) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * Format relevant lessons for prompt injection.
     */
    static formatForPrompt(lessons: MasterLesson[]): string {
        if (lessons.length === 0) return '';

        const formatted = lessons.map(l => {
            const icon = l.severity === 'critical' ? '🚫' : '⚠️';
            return `${icon} [INSTITUTIONAL RULE: ${l.title}]\n   - Rule: ${l.rule}\n   - Logic: ${l.causalLogic}`;
        }).join('\n\n');

        return `\n\n--- MASTER INSTITUTIONAL WISDOM (Historical Case Studies) ---\nThe following rules are derived from major historical market cycles (e.g., 2008, 2020, 2022). These are HIGH PRIORITY constraints:\n\n${formatted}\n--- END INSTITUTIONAL WISDOM ---\n`;
    }
}
