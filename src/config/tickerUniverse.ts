export interface TickerInfo {
    ticker: string;
    name: string;
    sector: string;
}

// Representative sample of S&P 500 (full list would be ~500 entries)
export const SP500_TICKERS: TickerInfo[] = [
    { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
    { ticker: 'MSFT', name: 'Microsoft Corp.', sector: 'Technology' },
    { ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Communication Services' },
    { ticker: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical' },
    { ticker: 'NVDA', name: 'NVIDIA Corp.', sector: 'Technology' },
    { ticker: 'META', name: 'Meta Platforms', sector: 'Communication Services' },
    { ticker: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Cyclical' },
    { ticker: 'BRK.B', name: 'Berkshire Hathaway', sector: 'Financials' },
    { ticker: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare' },
    { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
    { ticker: 'JPM', name: 'JPMorgan Chase', sector: 'Financials' },
    { ticker: 'V', name: 'Visa Inc.', sector: 'Financials' },
    { ticker: 'PG', name: 'Procter & Gamble', sector: 'Consumer Defensive' },
    { ticker: 'XOM', name: 'Exxon Mobil', sector: 'Energy' },
    { ticker: 'HD', name: 'Home Depot', sector: 'Consumer Cyclical' },
    { ticker: 'CVX', name: 'Chevron Corp.', sector: 'Energy' },
    { ticker: 'MA', name: 'Mastercard Inc.', sector: 'Financials' },
    { ticker: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare' },
    { ticker: 'MRK', name: 'Merck & Co.', sector: 'Healthcare' },
    { ticker: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Defensive' }
];

// Representative sample of FTSE 100
export const FTSE100_TICKERS: TickerInfo[] = [
    { ticker: 'AZN.L', name: 'AstraZeneca', sector: 'Healthcare' },
    { ticker: 'SHEL.L', name: 'Shell plc', sector: 'Energy' },
    { ticker: 'HSBA.L', name: 'HSBC Holdings', sector: 'Financials' },
    { ticker: 'ULVR.L', name: 'Unilever plc', sector: 'Consumer Defensive' },
    { ticker: 'BP.L', name: 'BP plc', sector: 'Energy' },
    { ticker: 'GSK.L', name: 'GSK plc', sector: 'Healthcare' },
    { ticker: 'REL.L', name: 'RELX plc', sector: 'Communication Services' },
    { ticker: 'DGE.L', name: 'Diageo plc', sector: 'Consumer Defensive' },
    { ticker: 'RIO.L', name: 'Rio Tinto', sector: 'Basic Materials' },
    { ticker: 'BATS.L', name: 'British American Tobacco', sector: 'Consumer Defensive' }
];

export function getFullUniverse(): TickerInfo[] {
    return [...SP500_TICKERS, ...FTSE100_TICKERS];
}

export function getUSSectors(): string[] {
    return Array.from(new Set(SP500_TICKERS.map(t => t.sector))).sort();
}

export function getUKSectors(): string[] {
    return Array.from(new Set(FTSE100_TICKERS.map(t => t.sector))).sort();
}
