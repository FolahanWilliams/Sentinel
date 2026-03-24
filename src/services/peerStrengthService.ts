/**
 * Sentinel — Peer Relative Strength Service (Enhanced)
 *
 * Compares a signal ticker's recent performance against its closest
 * sector peers AND the sector ETF benchmark. Determines whether a
 * move is idiosyncratic (ticker-specific) or sector-wide.
 *
 * Enhancements over v1:
 * - Sector ETF benchmark comparison (XLK, XLV, XLE, etc.)
 * - Momentum divergence scoring (is the ticker accelerating vs. peers?)
 * - Relative volume analysis (is the ticker seeing unusual volume vs. peers?)
 * - Broader peer coverage with sector ETF fallback for unknown tickers
 *
 * Uses bulk quote fetching for efficiency.
 */

import { MarketDataService } from './marketData';
import {
    PEER_RS_IDIOSYNCRATIC_THRESHOLD,
    PEER_RS_SECTOR_WIDE_TICKER_MIN,
    PEER_RS_SECTOR_WIDE_PEER_MIN,
    PEER_RS_STRONG_DIVERGENCE,
    PEER_RS_MAX_BOOST,
    PEER_RS_MAX_PENALTY,
} from '@/config/agentThresholds';
import type { Quote } from '@/types/market';

export interface PeerStrengthResult {
    ticker: string;
    tickerChange: number; // % change
    peerAvgChange: number; // average peer % change
    sectorEtfChange: number | null; // sector ETF % change
    relativeStrength: number; // ticker change - peer avg change (negative = underperforming)
    relativeToSector: number | null; // ticker change - sector ETF change
    isIdiosyncratic: boolean; // true if the move is ticker-specific, not sector-wide
    momentumDivergence: 'accelerating' | 'decelerating' | 'aligned' | 'unknown';
    volumeSignal: 'unusual_high' | 'unusual_low' | 'normal' | 'unknown';
    confidenceAdjustment: number; // -15 to +15
    peers: PeerComparison[];
    summary: string;
}

export interface PeerComparison {
    ticker: string;
    changePercent: number;
    divergenceFromSignal: number; // peer change - signal ticker change
    volumeRatio?: number; // current volume / avg volume
}

// ── Sector ETF mapping ──────────────────────────────────────────────────────────
// Used as a benchmark and fallback when no direct peers are mapped
const SECTOR_ETF_MAP: Record<string, string> = {
    'Technology': 'XLK',
    'Semiconductors': 'SMH',
    'Software': 'IGV',
    'Healthcare': 'XLV',
    'Biotechnology': 'XBI',
    'Financials': 'XLF',
    'Energy': 'XLE',
    'Consumer Discretionary': 'XLY',
    'Consumer Staples': 'XLP',
    'Industrials': 'XLI',
    'Materials': 'XLB',
    'Utilities': 'XLU',
    'Real Estate': 'XLRE',
    'Communication Services': 'XLC',
};

// Ticker → sector name (for ETF lookup)
const TICKER_SECTOR_MAP: Record<string, string> = {
    // Technology / Software
    'AAPL': 'Technology', 'MSFT': 'Technology', 'GOOG': 'Technology',
    'GOOGL': 'Technology', 'META': 'Communication Services', 'AMZN': 'Consumer Discretionary',
    'CRM': 'Software', 'NOW': 'Software', 'WDAY': 'Software',
    'SNOW': 'Software', 'DDOG': 'Software', 'PLTR': 'Software',
    'SHOP': 'Technology', 'MDB': 'Software',
    // Semiconductors
    'NVDA': 'Semiconductors', 'AMD': 'Semiconductors', 'INTC': 'Semiconductors',
    'TSM': 'Semiconductors', 'AVGO': 'Semiconductors', 'QCOM': 'Semiconductors',
    'MU': 'Semiconductors', 'TXN': 'Semiconductors', 'MRVL': 'Semiconductors',
    'ASML': 'Semiconductors',
    // Cybersecurity
    'CRWD': 'Software', 'PANW': 'Software', 'ZS': 'Software', 'FTNT': 'Software',
    // Biotech / Healthcare
    'MRNA': 'Biotechnology', 'PFE': 'Healthcare', 'BNTX': 'Biotechnology',
    'LLY': 'Healthcare', 'ABBV': 'Healthcare', 'JNJ': 'Healthcare',
    'MRK': 'Healthcare', 'BMY': 'Healthcare', 'NVO': 'Healthcare',
    'NVAX': 'Biotechnology',
    // Fintech
    'SQ': 'Financials', 'PYPL': 'Financials', 'SOFI': 'Financials',
    'COIN': 'Financials', 'HOOD': 'Financials', 'AFRM': 'Financials',
    // Energy
    'XOM': 'Energy', 'CVX': 'Energy', 'COP': 'Energy',
    'OXY': 'Energy', 'SLB': 'Energy', 'DVN': 'Energy', 'BP': 'Energy',
    // EV / Auto
    'TSLA': 'Consumer Discretionary', 'RIVN': 'Consumer Discretionary',
    'LCID': 'Consumer Discretionary', 'NIO': 'Consumer Discretionary',
    'F': 'Consumer Discretionary', 'GM': 'Consumer Discretionary',
    // Retail
    'WMT': 'Consumer Staples', 'COST': 'Consumer Staples', 'TGT': 'Consumer Discretionary',
    // Industrials
    'BA': 'Industrials', 'CAT': 'Industrials', 'DE': 'Industrials', 'GE': 'Industrials',
    // Crypto-adjacent
    'MARA': 'Financials', 'RIOT': 'Financials',
};

// Peer groups: ticker → closest 3-5 competitors
const PEER_MAP: Record<string, string[]> = {
    // Technology
    'AAPL': ['MSFT', 'GOOG', 'AMZN', 'META'],
    'MSFT': ['AAPL', 'GOOG', 'AMZN', 'CRM'],
    'GOOG': ['META', 'MSFT', 'AMZN', 'AAPL'],
    'GOOGL': ['META', 'MSFT', 'AMZN', 'AAPL'],
    'META': ['GOOG', 'SNAP', 'PINS', 'MSFT'],
    'AMZN': ['MSFT', 'GOOG', 'AAPL', 'SHOP'],
    // Semiconductors
    'NVDA': ['AMD', 'INTC', 'TSM', 'AVGO'],
    'AMD': ['NVDA', 'INTC', 'QCOM', 'MU'],
    'INTC': ['AMD', 'NVDA', 'TXN', 'QCOM'],
    'TSM': ['NVDA', 'AVGO', 'ASML', 'INTC'],
    'AVGO': ['QCOM', 'NVDA', 'TXN', 'MRVL'],
    'QCOM': ['AVGO', 'AMD', 'MRVL', 'TXN'],
    'MU': ['WDC', 'STX', 'AMD', 'NVDA'],
    // AI/Cloud
    'CRM': ['NOW', 'WDAY', 'SNOW', 'MSFT'],
    'SNOW': ['DDOG', 'CRM', 'MDB', 'PLTR'],
    'PLTR': ['SNOW', 'AI', 'DDOG', 'CRM'],
    // Cybersecurity
    'CRWD': ['PANW', 'ZS', 'FTNT', 'S'],
    'PANW': ['CRWD', 'FTNT', 'ZS', 'S'],
    'ZS': ['CRWD', 'PANW', 'FTNT', 'S'],
    // Biotech
    'MRNA': ['PFE', 'BNTX', 'NVAX', 'JNJ'],
    'PFE': ['MRNA', 'JNJ', 'ABBV', 'MRK'],
    'LLY': ['NVO', 'JNJ', 'ABBV', 'MRK'],
    'ABBV': ['LLY', 'PFE', 'JNJ', 'BMY'],
    // Fintech
    'SQ': ['PYPL', 'SOFI', 'COIN', 'AFRM'],
    'PYPL': ['SQ', 'SOFI', 'AFRM', 'SHOP'],
    'COIN': ['SQ', 'HOOD', 'MARA', 'RIOT'],
    'SOFI': ['SQ', 'PYPL', 'AFRM', 'HOOD'],
    // Energy
    'XOM': ['CVX', 'COP', 'OXY', 'SLB'],
    'CVX': ['XOM', 'COP', 'OXY', 'BP'],
    'OXY': ['XOM', 'CVX', 'COP', 'DVN'],
    // EV / Auto
    'TSLA': ['RIVN', 'LCID', 'NIO', 'F'],
    'RIVN': ['TSLA', 'LCID', 'NIO', 'GM'],
    // Retail
    'WMT': ['COST', 'TGT', 'KR'],
    'COST': ['WMT', 'TGT', 'BJ'],
    // Industrials
    'BA': ['LMT', 'RTX', 'GD', 'NOC'],
    'CAT': ['DE', 'CNH', 'AGCO'],
};

export class PeerStrengthService {

    /**
     * Compare a ticker's performance against its sector peers and sector ETF.
     * Returns confidence adjustment based on whether the move is idiosyncratic.
     */
    static async analyze(ticker: string, tickerChangePercent: number): Promise<PeerStrengthResult> {
        const upperTicker = ticker.toUpperCase();
        const peers = PEER_MAP[upperTicker];

        // No known peers — try sector ETF fallback
        if (!peers || peers.length === 0) {
            return this.analyzeSectorOnly(upperTicker, tickerChangePercent);
        }

        try {
            // Build fetch list: signal ticker + peers + sector ETF
            const sectorName = TICKER_SECTOR_MAP[upperTicker];
            const sectorEtf = sectorName ? SECTOR_ETF_MAP[sectorName] : undefined;
            const fetchTickers = [upperTicker, ...peers, ...(sectorEtf ? [sectorEtf] : [])];

            // Fetch all quotes in bulk
            const allQuotes = await MarketDataService.getQuotesBulk(fetchTickers);

            // Extract sector ETF performance
            let sectorEtfChange: number | null = null;
            if (sectorEtf && allQuotes[sectorEtf]) {
                sectorEtfChange = allQuotes[sectorEtf].changePercent ?? null;
            }

            // Process peer comparisons
            const peerComparisons: PeerComparison[] = [];
            let totalPeerChange = 0;
            let validPeerCount = 0;

            for (const peerTicker of peers) {
                const quote: Quote | undefined = allQuotes[peerTicker];
                if (quote && typeof quote.changePercent === 'number') {
                    const peerChange = quote.changePercent;
                    peerComparisons.push({
                        ticker: peerTicker,
                        changePercent: peerChange,
                        divergenceFromSignal: peerChange - tickerChangePercent,
                    });
                    totalPeerChange += peerChange;
                    validPeerCount++;
                }
            }

            if (validPeerCount === 0) {
                return this.analyzeSectorOnly(upperTicker, tickerChangePercent);
            }

            const peerAvgChange = totalPeerChange / validPeerCount;
            const relativeStrength = tickerChangePercent - peerAvgChange;
            const relativeToSector = sectorEtfChange !== null ? tickerChangePercent - sectorEtfChange : null;

            // Determine if the move is idiosyncratic
            const isIdiosyncratic = Math.abs(relativeStrength) > PEER_RS_IDIOSYNCRATIC_THRESHOLD;

            // Momentum divergence: is the ticker accelerating vs peers?
            const momentumDivergence = this.classifyMomentumDivergence(
                tickerChangePercent, peerAvgChange, sectorEtfChange,
            );

            // Volume signal: unusual activity relative to peers
            const volumeSignal = this.classifyVolumeSignal(allQuotes, upperTicker, 0, 0);

            // Calculate confidence adjustment (enhanced scoring)
            const adjustment = this.calculateAdjustment(
                relativeStrength, isIdiosyncratic, tickerChangePercent,
                peerAvgChange, momentumDivergence, volumeSignal,
            );

            const summary = this.buildSummary(
                upperTicker, tickerChangePercent, peerAvgChange,
                sectorEtfChange, relativeStrength, isIdiosyncratic,
                momentumDivergence,
            );

            console.log(`[PeerStrength] ${upperTicker}: change=${tickerChangePercent.toFixed(1)}%, peers=${peerAvgChange.toFixed(1)}%, sector=${sectorEtfChange?.toFixed(1) ?? 'N/A'}%, relative=${relativeStrength.toFixed(1)}%, momentum=${momentumDivergence}, vol=${volumeSignal}, adj=${adjustment}`);

            return {
                ticker: upperTicker,
                tickerChange: tickerChangePercent,
                peerAvgChange,
                sectorEtfChange,
                relativeStrength,
                relativeToSector,
                isIdiosyncratic,
                momentumDivergence,
                volumeSignal,
                confidenceAdjustment: adjustment,
                peers: peerComparisons,
                summary,
            };

        } catch (err: any) {
            console.warn(`[PeerStrength] Failed for ${ticker}:`, err.message);
            return this.neutralResult(upperTicker, tickerChangePercent);
        }
    }

    /**
     * Fallback: compare ticker against sector ETF only (no direct peers).
     */
    private static async analyzeSectorOnly(
        ticker: string,
        tickerChangePercent: number,
    ): Promise<PeerStrengthResult> {
        const sectorName = TICKER_SECTOR_MAP[ticker];
        const sectorEtf = sectorName ? SECTOR_ETF_MAP[sectorName] : undefined;

        if (!sectorEtf) {
            return this.neutralResult(ticker, tickerChangePercent);
        }

        try {
            const quotes = await MarketDataService.getQuotesBulk([sectorEtf]);
            const etfQuote = quotes[sectorEtf];
            if (!etfQuote || typeof etfQuote.changePercent !== 'number') {
                return this.neutralResult(ticker, tickerChangePercent);
            }

            const sectorEtfChange = etfQuote.changePercent;
            const relativeToSector = tickerChangePercent - sectorEtfChange;
            const isIdiosyncratic = Math.abs(relativeToSector) > PEER_RS_IDIOSYNCRATIC_THRESHOLD;

            let adjustment = 0;
            if (isIdiosyncratic) {
                if (relativeToSector < -PEER_RS_STRONG_DIVERGENCE) {
                    adjustment = PEER_RS_MAX_BOOST; // Idiosyncratic drop — mean-reversion opportunity
                } else if (relativeToSector < -PEER_RS_IDIOSYNCRATIC_THRESHOLD) {
                    adjustment = Math.round(PEER_RS_MAX_BOOST * 0.5);
                }
            } else if (Math.abs(tickerChangePercent) > PEER_RS_SECTOR_WIDE_TICKER_MIN && Math.abs(sectorEtfChange) > PEER_RS_SECTOR_WIDE_PEER_MIN) {
                adjustment = Math.round(PEER_RS_MAX_PENALTY * 0.6); // sector-wide
            }

            return {
                ticker,
                tickerChange: tickerChangePercent,
                peerAvgChange: sectorEtfChange,
                sectorEtfChange,
                relativeStrength: relativeToSector,
                relativeToSector,
                isIdiosyncratic,
                momentumDivergence: 'unknown',
                volumeSignal: 'unknown',
                confidenceAdjustment: adjustment,
                peers: [{ ticker: sectorEtf, changePercent: sectorEtfChange, divergenceFromSignal: sectorEtfChange - tickerChangePercent }],
                summary: `${ticker} moved ${tickerChangePercent.toFixed(1)}% vs sector ETF ${sectorEtf} at ${sectorEtfChange.toFixed(1)}% — ${isIdiosyncratic ? 'idiosyncratic' : 'sector-wide'} move.`,
            };
        } catch {
            return this.neutralResult(ticker, tickerChangePercent);
        }
    }

    /**
     * Classify momentum divergence between ticker and peers.
     */
    private static classifyMomentumDivergence(
        tickerChange: number,
        peerAvg: number,
        sectorEtf: number | null,
    ): PeerStrengthResult['momentumDivergence'] {
        const benchmark = sectorEtf ?? peerAvg;
        const delta = tickerChange - benchmark;

        // Ticker falling faster than peers/sector = decelerating
        if (delta < -2.0) return 'decelerating';
        // Ticker rising faster or falling less = accelerating
        if (delta > 2.0) return 'accelerating';
        return 'aligned';
    }

    /**
     * Detect unusual volume in signal ticker vs peer group.
     * Compares raw volumes since Quote doesn't carry avgVolume.
     * A ticker with 2x+ peer-average volume is flagged as unusual.
     */
    private static classifyVolumeSignal(
        quotes: Record<string, Quote>,
        ticker: string,
        _peerVolumeRatioSum: number,
        _peerVolumeCount: number,
    ): PeerStrengthResult['volumeSignal'] {
        const tickerQuote = quotes[ticker];
        if (!tickerQuote?.volume) return 'unknown';

        // Compare ticker volume against peer volume average
        const peerVolumes: number[] = [];
        for (const [t, q] of Object.entries(quotes)) {
            if (t !== ticker && q?.volume) peerVolumes.push(q.volume);
        }
        if (peerVolumes.length === 0) return 'unknown';

        // Normalize by market cap to compare fairly (if available)
        // Fallback: just compare relative to peer group median
        peerVolumes.sort((a, b) => a - b);
        const medianPeerVolume = peerVolumes[Math.floor(peerVolumes.length / 2)] ?? 0;
        if (medianPeerVolume === 0) return 'unknown';

        // Volume ratios are noisy across different-sized companies,
        // so use a high threshold
        if (tickerQuote.volume > medianPeerVolume * 3.0) {
            return 'unusual_high';
        }
        if (tickerQuote.volume < medianPeerVolume * 0.1) {
            return 'unusual_low';
        }
        return 'normal';
    }

    /**
     * Calculate confidence adjustment with enhanced factors.
     */
    private static calculateAdjustment(
        relativeStrength: number,
        isIdiosyncratic: boolean,
        tickerChange: number,
        peerAvg: number,
        momentum: PeerStrengthResult['momentumDivergence'],
        volume: PeerStrengthResult['volumeSignal'],
    ): number {
        let adjustment = 0;

        if (isIdiosyncratic) {
            if (relativeStrength < -PEER_RS_STRONG_DIVERGENCE) {
                // Strong idiosyncratic underperformance → best mean-reversion setup
                adjustment = PEER_RS_MAX_BOOST;
            } else if (relativeStrength < -PEER_RS_IDIOSYNCRATIC_THRESHOLD) {
                adjustment = Math.round(PEER_RS_MAX_BOOST * 0.5);
            } else if (relativeStrength > PEER_RS_STRONG_DIVERGENCE) {
                // Ticker outperforming peers → overreaction thesis weakened
                adjustment = Math.round(PEER_RS_MAX_PENALTY * 0.4);
            }
        } else {
            // Sector-wide move — penalize idiosyncratic overreaction thesis
            if (Math.abs(tickerChange) > PEER_RS_SECTOR_WIDE_TICKER_MIN && Math.abs(peerAvg) > PEER_RS_SECTOR_WIDE_PEER_MIN) {
                adjustment = PEER_RS_MAX_PENALTY; // Full sector-wide penalty
            } else if (Math.abs(tickerChange) > PEER_RS_SECTOR_WIDE_PEER_MIN && Math.abs(peerAvg) > 1.5) {
                adjustment = Math.round(PEER_RS_MAX_PENALTY * 0.5);
            }
        }

        // Momentum modifier: decelerating = more urgency, accelerating = less
        if (momentum === 'decelerating' && adjustment > 0) {
            adjustment = Math.min(PEER_RS_MAX_BOOST, adjustment + 2); // Boost: falling faster than peers
        } else if (momentum === 'accelerating' && adjustment < 0) {
            adjustment = Math.max(PEER_RS_MAX_PENALTY, adjustment - 2); // Penalty: recovering faster
        }

        // Volume modifier: unusual high volume on a drop = conviction
        if (volume === 'unusual_high' && isIdiosyncratic && adjustment > 0) {
            adjustment = Math.min(PEER_RS_MAX_BOOST, adjustment + 3); // High volume idiosyncratic drop
        } else if (volume === 'unusual_low' && adjustment > 0) {
            adjustment = Math.max(0, adjustment - 2); // Low volume = weak signal
        }

        return Math.max(PEER_RS_MAX_PENALTY, Math.min(PEER_RS_MAX_BOOST, adjustment));
    }

    /**
     * Build a human-readable summary.
     */
    private static buildSummary(
        ticker: string,
        tickerChange: number,
        peerAvg: number,
        sectorEtf: number | null,
        relativeStrength: number,
        isIdiosyncratic: boolean,
        momentum: PeerStrengthResult['momentumDivergence'],
    ): string {
        const parts: string[] = [];
        parts.push(`${ticker} moved ${tickerChange > 0 ? '+' : ''}${tickerChange.toFixed(1)}%`);

        if (sectorEtf !== null) {
            parts.push(`vs peers ${peerAvg > 0 ? '+' : ''}${peerAvg.toFixed(1)}% and sector ETF ${sectorEtf > 0 ? '+' : ''}${sectorEtf.toFixed(1)}%`);
        } else {
            parts.push(`vs peers ${peerAvg > 0 ? '+' : ''}${peerAvg.toFixed(1)}%`);
        }

        if (isIdiosyncratic) {
            parts.push(`— idiosyncratic move (RS: ${relativeStrength > 0 ? '+' : ''}${relativeStrength.toFixed(1)}%)`);
        } else {
            parts.push('— sector-wide move');
        }

        if (momentum !== 'aligned' && momentum !== 'unknown') {
            parts.push(`[${momentum}]`);
        }

        return parts.join(' ');
    }

    /**
     * Format peer strength data as prompt context for agents.
     */
    static formatForPrompt(result: PeerStrengthResult): string {
        if (result.peers.length === 0) return '';
        const lines = ['\nPEER RELATIVE STRENGTH:'];
        lines.push(`- ${result.ticker}: ${result.tickerChange > 0 ? '+' : ''}${result.tickerChange.toFixed(1)}%`);
        for (const peer of result.peers.slice(0, 4)) {
            lines.push(`- ${peer.ticker}: ${peer.changePercent > 0 ? '+' : ''}${peer.changePercent.toFixed(1)}%${peer.volumeRatio ? ` (vol: ${peer.volumeRatio.toFixed(1)}x)` : ''}`);
        }
        lines.push(`- Peer Average: ${result.peerAvgChange > 0 ? '+' : ''}${result.peerAvgChange.toFixed(1)}%`);
        if (result.sectorEtfChange !== null) {
            lines.push(`- Sector ETF: ${result.sectorEtfChange > 0 ? '+' : ''}${result.sectorEtfChange.toFixed(1)}%`);
        }
        lines.push(`- Relative Strength: ${result.relativeStrength > 0 ? '+' : ''}${result.relativeStrength.toFixed(1)}%`);
        lines.push(`- ${result.isIdiosyncratic ? 'IDIOSYNCRATIC move — ticker-specific catalyst' : 'SECTOR-WIDE move — broader market force'}`);
        if (result.momentumDivergence !== 'aligned' && result.momentumDivergence !== 'unknown') {
            lines.push(`- Momentum: ${result.momentumDivergence} vs peers`);
        }
        if (result.volumeSignal === 'unusual_high') {
            lines.push('- Volume: UNUSUAL HIGH — institutional activity suspected');
        } else if (result.volumeSignal === 'unusual_low') {
            lines.push('- Volume: Unusual low — weak conviction');
        }
        return lines.join('\n');
    }

    private static neutralResult(ticker: string, change: number): PeerStrengthResult {
        return {
            ticker,
            tickerChange: change,
            peerAvgChange: 0,
            sectorEtfChange: null,
            relativeStrength: 0,
            relativeToSector: null,
            isIdiosyncratic: false,
            momentumDivergence: 'unknown',
            volumeSignal: 'unknown',
            confidenceAdjustment: 0,
            peers: [],
            summary: `No peer data available for ${ticker}.`,
        };
    }
}
