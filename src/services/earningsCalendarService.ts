export interface EarningsResult {
    hasUpcomingEarnings: boolean;
    daysUntilEarnings: number;
    earningsDate?: string;
}

export class EarningsCalendarService {
    // In a real production setup, this would fetch from an AlphaVantage or Finnhub endpoint.
    // We are maintaining a static/mock cache for the S&P500 / FTSE100 earnings gating.
    // Dates are formatted as YYYY-MM-DD.
    private static readonly MOCK_EARNINGS: Record<string, string> = {
        'AAPL': '2026-04-30',
        'MSFT': '2026-04-23',
        'AMZN': '2026-04-25',
        'NVDA': '2026-05-20',
        'META': '2026-04-24',
        'GOOGL': '2026-04-23',
        'TSLA': '2026-04-19',
        'BRK.B': '2026-05-02',
        'JPM': '2026-04-12',
        'V': '2026-04-23',
        'JNJ': '2026-04-16',
        'SHEL': '2026-05-01',
        'HSBA': '2026-04-28',
        'ULVR': '2026-04-25'
        // Add more manual overrides here when needed.
    };

    /**
     * Finds if a ticker has earnings coming up in the near future.
     */
    static async getUpcomingEarnings(ticker: string, thresholdDays: number = 7): Promise<EarningsResult> {
        const uTicker = ticker.toUpperCase();
        
        try {
            // First check if user configured Finnhub
            const finnhubKey = (import.meta as any).env?.VITE_FINNHUB_API_KEY || (globalThis as any).process?.env?.FINNHUB_API_KEY || (globalThis as any).process?.env?.VITE_FINNHUB_API_KEY;
            
            if (finnhubKey) {
                // Fetch next earnings using Finnhub earnings calendar
                // Specifically fetching from today to +14 days to catch everything
                const todayStr = new Date().toISOString().split('T')[0];
                const futureDate = new Date();
                futureDate.setDate(futureDate.getDate() + 14);
                const futureStr = futureDate.toISOString().split('T')[0];

                const url = `https://finnhub.io/api/v1/calendar/earnings?symbol=${uTicker}&from=${todayStr}&to=${futureStr}&token=${finnhubKey}`;
                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.earningsCalendar && data.earningsCalendar.length > 0) {
                        // Find the earliest upcoming earnings
                        const nextEarnings = data.earningsCalendar.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];
                        const earningsDate = new Date(nextEarnings.date);
                        const today = new Date();
                        const diffMs = earningsDate.getTime() - today.getTime();
                        const daysUntilEarnings = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                        return {
                            hasUpcomingEarnings: daysUntilEarnings >= 0 && daysUntilEarnings <= thresholdDays,
                            daysUntilEarnings,
                            earningsDate: nextEarnings.date
                        };
                    }
                }
            } 
        } catch (e) {
            console.warn(`[EarningsCalendar] Live API fetch failed for ${uTicker}, falling back to static cache:`, e);
        }

        // Fallback to static cache
        return this.checkStaticMock(uTicker, thresholdDays);
    }

    private static checkStaticMock(uTicker: string, thresholdDays: number): EarningsResult {
        const dateStr = this.MOCK_EARNINGS[uTicker];
        if (!dateStr) {
            return { hasUpcomingEarnings: false, daysUntilEarnings: 999 };
        }

        const earningsDate = new Date(dateStr);
        const today = new Date();
        const diffMs = earningsDate.getTime() - today.getTime();
        const daysUntilEarnings = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (daysUntilEarnings >= 0 && daysUntilEarnings <= thresholdDays) {
            return { hasUpcomingEarnings: true, daysUntilEarnings, earningsDate: dateStr };
        }

        return {
            hasUpcomingEarnings: false,
            daysUntilEarnings: daysUntilEarnings > 0 ? daysUntilEarnings : 999,
            earningsDate: dateStr
        };
    }
}
