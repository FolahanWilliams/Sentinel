/**
 * Sentinel — Sector Rotation Service
 *
 * Tracks money flow between market sectors using sector ETF relative performance.
 * Compares Growth vs Defensive vs Cyclical sector groups to determine the current
 * market regime: risk_on, risk_off, rotation, or neutral.
 *
 * Uses MarketDataService.getQuotesBulk() for price data.
 * Results cached for 30 minutes — sector rotation is a slow-moving signal.
 */

import { MarketDataService } from './marketData';

// ---------------------------------------------------------------------------
// Sector & ETF definitions
// ---------------------------------------------------------------------------

export type SectorCategory = 'Growth' | 'Defensive' | 'Cyclical';

export interface SectorETF {
    ticker: string;
    name: string;
    category: SectorCategory;
}

const SECTOR_ETFS: SectorETF[] = [
    // Growth
    { ticker: 'XLK', name: 'Technology',       category: 'Growth' },
    { ticker: 'SMH', name: 'Semiconductors',   category: 'Growth' },
    // Defensive
    { ticker: 'XLV', name: 'Healthcare',        category: 'Defensive' },
    { ticker: 'XLU', name: 'Utilities',          category: 'Defensive' },
    { ticker: 'XLP', name: 'Consumer Staples',   category: 'Defensive' },
    // Cyclical
    { ticker: 'XLE', name: 'Energy',             category: 'Cyclical' },
    { ticker: 'XLI', name: 'Industrials',        category: 'Cyclical' },
    { ticker: 'XLF', name: 'Financials',         category: 'Cyclical' },
];

// We don't have a dedicated AI/Cloud ETF in the core list, but XLK + SMH
// cover the growth tech theme well enough for rotation detection.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RotationRegime = 'risk_on' | 'risk_off' | 'rotation' | 'neutral';

export interface SectorPerformance {
    ticker: string;
    name: string;
    category: SectorCategory;
    changePct: number;          // Current day change %
    price: number;
}

export interface SectorRotationSnapshot {
    regime: RotationRegime;
    regimeReason: string;
    sectorRankings: SectorPerformance[];   // Sorted best-to-worst by changePct
    topInflows: SectorPerformance[];       // Top 3 gaining sectors
    topOutflows: SectorPerformance[];      // Bottom 3 losing sectors
    growthAvg: number;                     // Avg change % for Growth group
    defensiveAvg: number;                  // Avg change % for Defensive group
    cyclicalAvg: number;                   // Avg change % for Cyclical group
    timestamp: Date;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

let cachedSnapshot: SectorRotationSnapshot | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SectorRotationService {

    /**
     * Get the current sector rotation snapshot.
     * Fetches sector ETF quotes, ranks them, and determines the regime.
     */
    static async getRotationSnapshot(): Promise<SectorRotationSnapshot> {
        // Return cached result if still fresh
        if (cachedSnapshot && (Date.now() - cacheTimestamp) < CACHE_TTL) {
            console.log('[SectorRotation] Returning cached snapshot');
            return cachedSnapshot;
        }

        const tickers = SECTOR_ETFS.map(s => s.ticker);
        const quotes = await MarketDataService.getQuotesBulk(tickers);

        // Build performance entries from quotes
        const performances: SectorPerformance[] = [];
        for (const etf of SECTOR_ETFS) {
            const quote = quotes[etf.ticker];
            if (!quote) {
                console.warn(`[SectorRotation] Missing quote for ${etf.ticker}, skipping`);
                continue;
            }
            performances.push({
                ticker: etf.ticker,
                name: etf.name,
                category: etf.category,
                changePct: quote.changePercent,
                price: quote.price,
            });
        }

        if (performances.length === 0) {
            const empty: SectorRotationSnapshot = {
                regime: 'neutral',
                regimeReason: 'Unable to fetch sector ETF data.',
                sectorRankings: [],
                topInflows: [],
                topOutflows: [],
                growthAvg: 0,
                defensiveAvg: 0,
                cyclicalAvg: 0,
                timestamp: new Date(),
            };
            return empty;
        }

        // Sort best-to-worst
        const sorted = [...performances].sort((a, b) => b.changePct - a.changePct);

        // Group averages
        const growthAvg = this.groupAverage(performances, 'Growth');
        const defensiveAvg = this.groupAverage(performances, 'Defensive');
        const cyclicalAvg = this.groupAverage(performances, 'Cyclical');

        // Determine regime
        const { regime, reason } = this.classifyRegime(growthAvg, defensiveAvg, cyclicalAvg, sorted);

        const snapshot: SectorRotationSnapshot = {
            regime,
            regimeReason: reason,
            sectorRankings: sorted,
            topInflows: sorted.slice(0, 3),
            topOutflows: sorted.slice(-3).reverse(), // worst first
            growthAvg,
            defensiveAvg,
            cyclicalAvg,
            timestamp: new Date(),
        };

        // Cache
        cachedSnapshot = snapshot;
        cacheTimestamp = Date.now();

        console.log(
            `[SectorRotation] Regime: ${regime} | Growth: ${growthAvg.toFixed(2)}% | ` +
            `Defensive: ${defensiveAvg.toFixed(2)}% | Cyclical: ${cyclicalAvg.toFixed(2)}%`
        );

        return snapshot;
    }

    /**
     * Format a rotation snapshot as a text block suitable for injection into
     * agent prompts (Gemini system instructions, reflection agent context, etc.).
     */
    static formatForPrompt(snapshot: SectorRotationSnapshot): string {
        if (snapshot.sectorRankings.length === 0) {
            return '';
        }

        const lines: string[] = [
            '',
            'SECTOR ROTATION:',
            `- Regime: ${snapshot.regime.toUpperCase().replace('_', ' ')}`,
            `- ${snapshot.regimeReason}`,
            `- Growth avg: ${snapshot.growthAvg >= 0 ? '+' : ''}${snapshot.growthAvg.toFixed(2)}%`,
            `- Defensive avg: ${snapshot.defensiveAvg >= 0 ? '+' : ''}${snapshot.defensiveAvg.toFixed(2)}%`,
            `- Cyclical avg: ${snapshot.cyclicalAvg >= 0 ? '+' : ''}${snapshot.cyclicalAvg.toFixed(2)}%`,
            '- Rankings (best to worst):',
        ];

        for (const s of snapshot.sectorRankings) {
            const sign = s.changePct >= 0 ? '+' : '';
            lines.push(`    ${s.ticker} (${s.name}): ${sign}${s.changePct.toFixed(2)}%`);
        }

        lines.push(`- Top inflows: ${snapshot.topInflows.map(s => s.ticker).join(', ')}`);
        lines.push(`- Top outflows: ${snapshot.topOutflows.map(s => s.ticker).join(', ')}`);

        if (snapshot.regime === 'risk_off') {
            lines.push('NOTE: Defensive leadership suggests caution on growth/momentum longs.');
        } else if (snapshot.regime === 'risk_on') {
            lines.push('NOTE: Growth leadership supports aggressive positioning in tech/semis.');
        } else if (snapshot.regime === 'rotation') {
            lines.push('NOTE: Cyclical rotation — focus on sectors gaining relative strength.');
        }

        return lines.join('\n');
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    /**
     * Average changePct for a given sector category.
     */
    private static groupAverage(perfs: SectorPerformance[], category: SectorCategory): number {
        const group = perfs.filter(p => p.category === category);
        if (group.length === 0) return 0;
        return group.reduce((sum, p) => sum + p.changePct, 0) / group.length;
    }

    /**
     * Classify the rotation regime based on group averages and spread.
     */
    private static classifyRegime(
        growthAvg: number,
        defensiveAvg: number,
        cyclicalAvg: number,
        sorted: SectorPerformance[],
    ): { regime: RotationRegime; reason: string } {
        const growthVsDefensive = growthAvg - defensiveAvg;
        const cyclicalVsAll = cyclicalAvg - (growthAvg + defensiveAvg) / 2;

        // Threshold: 0.3% spread is meaningful for a single day
        const SPREAD_THRESHOLD = 0.3;

        // Risk-on: Growth meaningfully outperforming Defensive
        if (growthVsDefensive > SPREAD_THRESHOLD) {
            return {
                regime: 'risk_on',
                reason: `Growth outperforming Defensive by ${growthVsDefensive.toFixed(2)}pp — risk appetite is elevated.`,
            };
        }

        // Risk-off: Defensive meaningfully outperforming Growth
        if (growthVsDefensive < -SPREAD_THRESHOLD) {
            return {
                regime: 'risk_off',
                reason: `Defensive outperforming Growth by ${Math.abs(growthVsDefensive).toFixed(2)}pp — flight to safety.`,
            };
        }

        // Rotation: Cyclicals diverging from both Growth and Defensive
        if (Math.abs(cyclicalVsAll) > SPREAD_THRESHOLD) {
            const direction = cyclicalVsAll > 0 ? 'into' : 'out of';
            return {
                regime: 'rotation',
                reason: `Money rotating ${direction} cyclicals (${cyclicalVsAll > 0 ? '+' : ''}${cyclicalVsAll.toFixed(2)}pp vs average). Sector-specific moves dominating.`,
            };
        }

        // Check for wide dispersion within the ranking (even if group averages are close)
        if (sorted.length >= 4) {
            const topBottom = sorted[0]!.changePct - sorted[sorted.length - 1]!.changePct;
            if (topBottom > 1.0) {
                return {
                    regime: 'rotation',
                    reason: `Wide sector dispersion (${topBottom.toFixed(2)}pp spread). Active rotation between individual sectors.`,
                };
            }
        }

        return {
            regime: 'neutral',
            reason: 'No clear sector leadership — broad market moving in lockstep.',
        };
    }
}
