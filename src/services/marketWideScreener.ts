import { SP500_TICKERS, FTSE100_TICKERS } from '@/config/tickerUniverse';
import { MarketDataService } from './marketData';
import { TechnicalAnalysisService } from './technicalAnalysis';
import { 
    SCREENER_MIN_GAP_PCT, 
    SCREENER_MIN_VOLUME_MULT, 
    SCREENER_RSI_OVERSOLD, 
    SCREENER_RSI_OVERBOUGHT,
    SCREENER_MIN_DOLLAR_VOLUME
} from '@/config/constants';

export interface ScreenerAnomaly {
    ticker: string;
    event_type: 'SCREENER_ANOMALY';
    headline: string;
    metrics: {
        gapPct: number;
        volumeMult: number;
        rsi?: number;
    };
    severity: number;
}

export class MarketWideScreener {
    
    /**
     * Scans the full liquid universe for anomalies and returns candidates.
     */
    static async runScreener(): Promise<ScreenerAnomaly[]> {
        console.log(`[Screener] Initiating market-wide scan across ${SP500_TICKERS.length + FTSE100_TICKERS.length} tickers...`);
        const anomalies: ScreenerAnomaly[] = [];
        const universe = [...SP500_TICKERS, ...FTSE100_TICKERS].map(t => typeof t === 'string' ? t : t.ticker);

        // Process in chunks to avoid overwhelming rate limits (if applicable)
        const CHUNK_SIZE = 50;
        for (let i = 0; i < universe.length; i += CHUNK_SIZE) {
            const chunk = universe.slice(i, i + CHUNK_SIZE);
            const promises = chunk.map(ticker => this.analyzeTicker(ticker));
            
            const results = await Promise.all(promises);
            for (const res of results) {
                if (res) anomalies.push(res);
            }
        }

        // Sort by severity (highest first)
        anomalies.sort((a, b) => b.severity - a.severity);
        console.log(`[Screener] Scan complete. Found ${anomalies.length} anomalies.`);
        return anomalies;
    }

    private static async analyzeTicker(ticker: string): Promise<ScreenerAnomaly | null> {
        try {
            const quote = await MarketDataService.getQuote(ticker);
            if (!quote?.price) return null;

            // 1. Minimum Liquidity Gate
            const avgVol = (quote as any).averageVolume || (quote as any).avgVolume || 0;
            const dollarVol = quote.price * (quote.volume || avgVol);
            if (dollarVol < SCREENER_MIN_DOLLAR_VOLUME) {
                return null; // Ignore illiquid stocks
            }

            // 2. Metrics calculation
            const prevClose = quote.previousClose || quote.price; // Fallback
            const gapPct = prevClose > 0 ? ((quote.price - prevClose) / prevClose) * 100 : 0;
            const volumeMult = (quote.volume && avgVol && avgVol > 0) 
                                ? (quote.volume / avgVol) 
                                : 0;

            // 3. Threshold checks
            const hasGap = Math.abs(gapPct) >= SCREENER_MIN_GAP_PCT;
            const hasVolumeSpike = volumeMult >= SCREENER_MIN_VOLUME_MULT;

            if (!hasGap && !hasVolumeSpike) {
                return null; // No basic anomaly
            }

            // 4. Deeper TA check (only if we have an anomaly, to save API calls)
            let rsi: number | undefined;
            if (hasGap || hasVolumeSpike) {
                try {
                    const ta: any = await TechnicalAnalysisService.getSnapshot(ticker);
                    rsi = ta?.rsi || ta?.indicators?.rsi;
                } catch (e) {
                    // Ignore TA fetch errors
                }
            }

            const isRsiExtreme = rsi !== undefined && (rsi <= SCREENER_RSI_OVERSOLD || rsi >= SCREENER_RSI_OVERBOUGHT);
            
            // 5. Construct Headline and Severity
            const reasons: string[] = [];
            let severityLevel = 2; // Base severity for being screened
            
            if (hasGap) {
                reasons.push(`Gap ${gapPct > 0 ? 'Up' : 'Down'} ${Math.abs(gapPct).toFixed(1)}%`);
                severityLevel += 1;
            }
            if (hasVolumeSpike) {
                reasons.push(`${volumeMult.toFixed(1)}x Vol Spike`);
                severityLevel += 1;
            }
            if (isRsiExtreme && rsi !== undefined) {
                reasons.push(`RSI Extreme (${rsi.toFixed(1)})`);
                severityLevel += 1;
            }

            return {
                ticker,
                event_type: 'SCREENER_ANOMALY',
                headline: `[Market Screener] ${reasons.join(' + ')}`,
                metrics: { gapPct, volumeMult, rsi },
                severity: Math.min(severityLevel, 5) // Cap at 5
            };
        } catch (e) {
            console.warn(`[Screener] Failed to analyze ${ticker}:`, e);
            return null;
        }
    }
}
