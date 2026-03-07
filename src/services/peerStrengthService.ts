/**
 * Sentinel — Peer Relative Strength Service
 *
 * Compares a signal ticker's recent performance against its closest
 * sector peers. If the signal ticker is down 5% but peers are flat,
 * the drop is idiosyncratic (better signal — higher conviction).
 * If the whole sector is down, it's a macro/sector issue (worse signal).
 *
 * Uses bulk quote fetching for efficiency.
 */

import { MarketDataService } from './marketData';
import type { Quote } from '@/types/market';

export interface PeerStrengthResult {
    ticker: string;
    tickerChange: number; // % change
    peerAvgChange: number; // average peer % change
    relativeStrength: number; // ticker change - peer avg change (negative = underperforming)
    isIdiosyncratic: boolean; // true if the move is ticker-specific, not sector-wide
    confidenceAdjustment: number; // -10 to +10
    peers: PeerComparison[];
    summary: string;
}

export interface PeerComparison {
    ticker: string;
    changePercent: number;
    divergenceFromSignal: number; // peer change - signal ticker change
}

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
};

export class PeerStrengthService {

    /**
     * Compare a ticker's performance against its sector peers.
     * Returns confidence adjustment based on whether the move is idiosyncratic.
     */
    static async analyze(ticker: string, tickerChangePercent: number): Promise<PeerStrengthResult> {
        const upperTicker = ticker.toUpperCase();
        const peers = PEER_MAP[upperTicker];

        // No known peers — skip analysis
        if (!peers || peers.length === 0) {
            return this.neutralResult(upperTicker, tickerChangePercent);
        }

        try {
            // Fetch peer quotes in bulk for efficiency
            const peerQuotes = await MarketDataService.getQuotesBulk(peers);

            const peerComparisons: PeerComparison[] = [];
            let totalPeerChange = 0;
            let validPeerCount = 0;

            for (const peerTicker of peers) {
                const quote: Quote | undefined = peerQuotes[peerTicker];
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
                return this.neutralResult(upperTicker, tickerChangePercent);
            }

            const peerAvgChange = totalPeerChange / validPeerCount;
            const relativeStrength = tickerChangePercent - peerAvgChange;

            // Determine if the move is idiosyncratic
            // If ticker is down 3%+ more than peers, it's an idiosyncratic drop
            const isIdiosyncratic = Math.abs(relativeStrength) > 2.0;

            // Calculate confidence adjustment
            let adjustment = 0;

            if (isIdiosyncratic) {
                if (relativeStrength < -3.0) {
                    // Ticker is significantly underperforming peers → idiosyncratic drop
                    // Better for mean-reversion signals (long overreaction)
                    adjustment = 10;
                } else if (relativeStrength < -2.0) {
                    adjustment = 5;
                } else if (relativeStrength > 3.0) {
                    // Ticker is outperforming peers → possibly not a real overreaction
                    adjustment = -5;
                }
            } else {
                // Sector-wide move — worse for idiosyncratic overreaction thesis
                if (Math.abs(tickerChangePercent) > 3 && Math.abs(peerAvgChange) > 2) {
                    adjustment = -10; // Sector-wide selloff, not a unique opportunity
                } else if (Math.abs(tickerChangePercent) > 2 && Math.abs(peerAvgChange) > 1.5) {
                    adjustment = -5; // Moderate sector effect
                }
            }

            const summary = isIdiosyncratic
                ? `${upperTicker} moved ${tickerChangePercent.toFixed(1)}% while peers averaged ${peerAvgChange.toFixed(1)}% — idiosyncratic move (relative: ${relativeStrength > 0 ? '+' : ''}${relativeStrength.toFixed(1)}%).`
                : `${upperTicker} moved ${tickerChangePercent.toFixed(1)}% with peers averaging ${peerAvgChange.toFixed(1)}% — sector-wide move.`;

            console.log(`[PeerStrength] ${upperTicker}: change=${tickerChangePercent.toFixed(1)}%, peers=${peerAvgChange.toFixed(1)}%, relative=${relativeStrength.toFixed(1)}%, idiosyncratic=${isIdiosyncratic}, adj=${adjustment}`);

            return {
                ticker: upperTicker,
                tickerChange: tickerChangePercent,
                peerAvgChange,
                relativeStrength,
                isIdiosyncratic,
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
     * Format peer strength data as prompt context for agents.
     */
    static formatForPrompt(result: PeerStrengthResult): string {
        if (result.peers.length === 0) return '';
        const lines = ['\nPEER RELATIVE STRENGTH:'];
        lines.push(`- ${result.ticker}: ${result.tickerChange > 0 ? '+' : ''}${result.tickerChange.toFixed(1)}%`);
        for (const peer of result.peers.slice(0, 4)) {
            lines.push(`- ${peer.ticker}: ${peer.changePercent > 0 ? '+' : ''}${peer.changePercent.toFixed(1)}%`);
        }
        lines.push(`- Peer Average: ${result.peerAvgChange > 0 ? '+' : ''}${result.peerAvgChange.toFixed(1)}%`);
        lines.push(`- Relative Strength: ${result.relativeStrength > 0 ? '+' : ''}${result.relativeStrength.toFixed(1)}%`);
        lines.push(`- ${result.isIdiosyncratic ? 'IDIOSYNCRATIC move — ticker-specific catalyst' : 'SECTOR-WIDE move — broader market force'}`);
        return lines.join('\n');
    }

    private static neutralResult(ticker: string, change: number): PeerStrengthResult {
        return {
            ticker,
            tickerChange: change,
            peerAvgChange: 0,
            relativeStrength: 0,
            isIdiosyncratic: false,
            confidenceAdjustment: 0,
            peers: [],
            summary: `No peer data available for ${ticker}.`,
        };
    }
}
