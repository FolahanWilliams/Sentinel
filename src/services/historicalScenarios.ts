/**
 * Sentinel — Historical Scenario Library
 * 
 * Curated list of dates and tickers representing key market regimes:
 * - Geopolitical Shocks
 * - Liquidity Crunches (Value Traps)
 * - Retail Mania (Short Squeezes)
 * - Fundamental Surprises
 * - Macro Rotations
 */

export interface SimulationScenario {
    id: string;
    ticker: string;
    date: string;
    description: string;
    expectedDirection: 'long' | 'short';
    regimeLabel: 'crisis' | 'correction' | 'bull' | 'neutral';
    eventType: string;
}

export const MASTER_SCENARIOS: SimulationScenario[] = [
    // --- 1. GEOPOLITICAL SHOCKS ---
    {
        id: 'fukushima-2011',
        ticker: 'TM', // Toyota
        date: '2011-03-11',
        description: 'Tsunami and nuclear disaster in Japan — massive supply chain disruption.',
        expectedDirection: 'short',
        regimeLabel: 'crisis',
        eventType: 'disaster'
    },
    {
        id: 'brexit-2016',
        ticker: 'EWU', // UK ETF
        date: '2016-06-24',
        description: 'Brexit referendum results catch the market off-guard.',
        expectedDirection: 'short',
        regimeLabel: 'crisis',
        eventType: 'geopolitical'
    },
    {
        id: 'russia-ukraine-2022',
        ticker: 'LMT',
        date: '2022-02-24',
        description: 'Russia invades Ukraine — surge in defense stocks.',
        expectedDirection: 'long',
        regimeLabel: 'crisis',
        eventType: 'geopolitical'
    },

    // --- 2. LIQUIDITY CRUNCH / VALUE TRAPS ---
    {
        id: 'lehman-collapse-2008',
        ticker: 'SPY',
        date: '2008-09-15',
        description: 'Lehman Brothers files for bankruptcy — the height of the GFC.',
        expectedDirection: 'short',
        regimeLabel: 'crisis',
        eventType: 'liquidity'
    },
    {
        id: 'debt-ceiling-2011',
        ticker: 'SPY',
        date: '2011-08-05',
        description: 'S&P downgrades US Credit Rating following debt ceiling standoff.',
        expectedDirection: 'short',
        regimeLabel: 'crisis',
        eventType: 'macro'
    },
    {
        id: 'volmageddon-2018',
        ticker: 'XIV', // Inverse VIX
        date: '2018-02-05',
        description: 'VIX spikes 100% in a single day, wiping out short-vol products.',
        expectedDirection: 'short',
        regimeLabel: 'crisis',
        eventType: 'liquidity'
    },
    {
        id: 'covid-crash-2020',
        ticker: 'DIS',
        date: '2020-03-12',
        description: 'Global lockdowns triggered — "Limit Down" day for markets.',
        expectedDirection: 'short',
        regimeLabel: 'crisis',
        eventType: 'crisis'
    },

    // --- 3. RETAIL MANIA / SHORT SQUEEZES ---
    {
        id: 'gamestop-squeeze-2021',
        ticker: 'GME',
        date: '2021-01-25',
        description: 'Reddit-fueled short squeeze begins to reach its peak.',
        expectedDirection: 'long',
        regimeLabel: 'bull',
        eventType: 'sentiment'
    },
    {
        id: 'hertz-bankruptcy-rally-2020',
        ticker: 'HTZ',
        date: '2020-06-08',
        description: 'Bankrupt company HTZ rallies 100%+ despite no fundamental change.',
        expectedDirection: 'short',
        regimeLabel: 'bull',
        eventType: 'sentiment'
    },

    // --- 4. FUNDAMENTAL SURPRISE / EARNINGS ---
    {
        id: 'meta-earnings-miss-2022',
        ticker: 'META',
        date: '2022-02-03',
        description: 'Meta drops 26% after earnings reveal first-ever decline in users.',
        expectedDirection: 'short',
        regimeLabel: 'correction',
        eventType: 'earnings'
    },
    {
        id: 'nflx-guidance-crash-2022',
        ticker: 'NFLX',
        date: '2022-04-20',
        description: 'Netflix drops 35% after missing subscriber guidance significantly.',
        expectedDirection: 'short',
        regimeLabel: 'correction',
        eventType: 'earnings'
    },
    {
        id: 'nvda-ai-breakout-2023',
        ticker: 'NVDA',
        date: '2023-05-25',
        description: 'NVDA AI hardware demand guidance triggers a massive breakout.',
        expectedDirection: 'long',
        regimeLabel: 'bull',
        eventType: 'earnings'
    },

    // --- 5. MACRO ROTATIONS / RATE HIKES ---
    {
        id: 'powell-pivot-hawkish-2021',
        ticker: 'ARKK',
        date: '2021-11-22',
        description: 'Powell re-nominated, triggers aggressive rotation out of high-beta tech.',
        expectedDirection: 'short',
        regimeLabel: 'neutral',
        eventType: 'macro'
    },
    {
        id: 'svb-contagion-2023',
        ticker: 'KRE', // Regional Bank ETF
        date: '2023-03-09',
        description: 'SVB bank run begins — systemic risk in regional banks.',
        expectedDirection: 'short',
        regimeLabel: 'crisis',
        eventType: 'liquidity'
    },
    {
        id: 'jpm-svb-rescue-2023',
        ticker: 'JPM',
        date: '2023-03-13',
        description: 'Market stabilizes after Fed/JPM support for banking sector.',
        expectedDirection: 'long',
        regimeLabel: 'correction',
        eventType: 'macro'
    }
];
