/**
 * backtestEngine — Pure function backtest simulator.
 *
 * v3: Fixed pickReturn 'best' logic, breakeven handling, Sharpe calculation.
 * Added walk-forward validation and Monte Carlo simulation.
 */

export interface BacktestParams {
    startingCapital: number;
    minConfidence: number;
    agentFilter: 'all' | 'overreaction' | 'contagion';
    positionSizePct: number;
    returnHorizon: '1d' | '5d' | '10d' | '30d' | 'best';
    startDate?: string;
    endDate?: string;
    tickerFilter?: string;
}

export interface BacktestTrade {
    ticker: string;
    signal_type: string;
    bias_type: string;
    confidence: number;
    entry_price: number;
    outcome: string;
    return_1d: number | null;
    return_5d: number | null;
    return_10d: number | null;
    return_30d: number | null;
    max_drawdown: number | null;
    max_gain: number | null;
    pnl_pct: number;
    pnl_usd: number;
    equity_after: number;
    date: string;
}

export interface WinRateBreakdown {
    label: string;
    wins: number;
    losses: number;
    breakevens: number;
    total: number;
    winRate: number;
}

export interface MonthlyReturn {
    month: string;
    label: string;
    returnPct: number;
    tradeCount: number;
}

export interface ConfidenceCalibrationPoint {
    bucket: string;
    predicted: number;
    actual: number;
    count: number;
}

export interface WalkForwardResult {
    trainPeriod: { start: string; end: string; winRate: number; returnPct: number; trades: number };
    testPeriod: { start: string; end: string; winRate: number; returnPct: number; trades: number };
    degradation: number;
}

export interface MonteCarloResult {
    simulations: number;
    medianFinalEquity: number;
    percentile5: number;
    percentile95: number;
    probabilityOfLoss: number;
    probabilityOfDrawdownOver20: number;
    medianMaxDrawdownPct: number;
}

export interface BacktestResult {
    trades: BacktestTrade[];
    equityCurve: { date: string; equity: number }[];
    summary: {
        totalReturn: number;
        totalReturnPct: number;
        winRate: number;
        totalTrades: number;
        winners: number;
        losers: number;
        breakevens: number;
        avgWin: number;
        avgLoss: number;
        maxDrawdown: number;
        maxDrawdownPct: number;
        sharpeRatio: number;
        profitFactor: number;
        expectancy: number;
        bestTrade: { ticker: string; pnl_pct: number } | null;
        worstTrade: { ticker: string; pnl_pct: number } | null;
        longestWinStreak: number;
        longestLossStreak: number;
        currentStreak: { type: 'win' | 'loss' | 'none'; length: number };
    };
    breakdowns: {
        bySignalType: WinRateBreakdown[];
        byBiasType: WinRateBreakdown[];
    };
    monthlyReturns: MonthlyReturn[];
    confidenceCalibration: ConfidenceCalibrationPoint[];
    walkForward: WalkForwardResult | null;
    monteCarlo: MonteCarloResult | null;
}

// FIX: 'best' now picks the highest return, not the longest duration
function pickReturn(row: any, horizon: BacktestParams['returnHorizon']): number {
    if (horizon === 'best') {
        const candidates = [
            row.return_1d,
            row.return_5d,
            row.return_10d,
            row.return_30d,
        ].filter((v): v is number => v !== null && v !== undefined);
        if (candidates.length === 0) return 0;
        return candidates.reduce((best, v) => v > best ? v : best, candidates[0] ?? 0);
    }
    const map: Record<string, string> = {
        '1d': 'return_1d', '5d': 'return_5d',
        '10d': 'return_10d', '30d': 'return_30d',
    };
    return row[map[horizon] ?? 'return_30d'] ?? 0;
}

// Breakeven threshold: 0.1% of position (accounts for slippage)
const BREAKEVEN_THRESHOLD_PCT = 0.1;

function classifyTrade(pnlPct: number): 'win' | 'loss' | 'breakeven' {
    if (pnlPct > BREAKEVEN_THRESHOLD_PCT) return 'win';
    if (pnlPct < -BREAKEVEN_THRESHOLD_PCT) return 'loss';
    return 'breakeven';
}

function filterSignalData(signalData: any[], params: BacktestParams): any[] {
    const tickerSet = params.tickerFilter
        ? new Set(params.tickerFilter.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))
        : null;
    const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
    const endMs = params.endDate ? new Date(params.endDate).getTime() : Infinity;

    return [...signalData]
        .sort((a, b) =>
            new Date(a.tracked_at || a.created_at).getTime() -
            new Date(b.tracked_at || b.created_at).getTime()
        )
        .filter(row => {
            const rowDate = new Date(row.tracked_at || row.created_at).getTime();
            if (rowDate < startMs || rowDate > endMs) return false;
            const ticker = (row.ticker || '').toUpperCase();
            if (tickerSet && !tickerSet.has(ticker)) return false;
            if (params.agentFilter !== 'all') {
                const signalType = (row.signal_type || '').toLowerCase();
                if (params.agentFilter === 'overreaction' && !signalType.includes('overreaction')) return false;
                if (params.agentFilter === 'contagion' && !signalType.includes('contagion')) return false;
            }
            if ((row.confidence_score || 0) < params.minConfidence) return false;
            return true;
        });
}

function simulateTrades(
    filtered: any[],
    params: BacktestParams
): { trades: BacktestTrade[]; equityCurve: { date: string; equity: number }[]; tradeReturns: number[] } {
    let equity = params.startingCapital;
    const trades: BacktestTrade[] = [];
    const equityCurve: { date: string; equity: number }[] = [
        { date: 'Start', equity: params.startingCapital },
    ];
    const tradeReturns: number[] = [];

    for (const row of filtered) {
        const pnlPct = pickReturn(row, params.returnHorizon);
        const positionSize = equity * (params.positionSizePct / 100);
        const pnlUsd = positionSize * (pnlPct / 100);
        equity += pnlUsd;
        tradeReturns.push(pnlPct);

        trades.push({
            ticker: row.ticker,
            signal_type: row.signal_type || 'unknown',
            bias_type: row.bias_type || 'unknown',
            confidence: row.confidence_score || 0,
            entry_price: row.entry_price || 0,
            outcome: row.outcome || 'pending',
            return_1d: row.return_1d,
            return_5d: row.return_5d,
            return_10d: row.return_10d,
            return_30d: row.return_30d,
            max_drawdown: row.max_drawdown,
            max_gain: row.max_gain,
            pnl_pct: pnlPct,
            pnl_usd: pnlUsd,
            equity_after: equity,
            date: row.tracked_at || row.created_at || '',
        });

        equityCurve.push({
            date: new Date(row.tracked_at || row.created_at || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            equity,
        });
    }

    return { trades, equityCurve, tradeReturns };
}

export function runBacktest(
    signalData: any[],
    params: BacktestParams,
): BacktestResult {
    const filtered = filterSignalData(signalData, params);
    const { trades, equityCurve, tradeReturns } = simulateTrades(filtered, params);

    // Drawdown tracking
    let peakEquity = params.startingCapital;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    for (const t of trades) {
        if (t.equity_after > peakEquity) peakEquity = t.equity_after;
        const dd = peakEquity - t.equity_after;
        const ddPct = peakEquity > 0 ? (dd / peakEquity) * 100 : 0;
        if (dd > maxDrawdown) { maxDrawdown = dd; maxDrawdownPct = ddPct; }
    }

    // FIX: Proper breakeven classification
    const winners = trades.filter(t => classifyTrade(t.pnl_pct) === 'win');
    const losers = trades.filter(t => classifyTrade(t.pnl_pct) === 'loss');
    const breakevens = trades.filter(t => classifyTrade(t.pnl_pct) === 'breakeven');

    const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
    const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.pnl_pct, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.pnl_pct, 0) / losers.length : 0;
    const lastTrade = trades[trades.length - 1];
    const equity = lastTrade ? lastTrade.equity_after : params.startingCapital;
    const totalReturn = equity - params.startingCapital;
    const totalReturnPct = params.startingCapital > 0 ? (totalReturn / params.startingCapital) * 100 : 0;

    // FIX: Sharpe Ratio — compute annualized properly based on actual trading frequency
    let sharpeRatio = 0;
    if (tradeReturns.length > 1) {
        const meanReturn = tradeReturns.reduce((a, b) => a + b, 0) / tradeReturns.length;
        const stdDev = Math.sqrt(
            tradeReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (tradeReturns.length - 1)
        );
        if (stdDev > 0 && trades.length >= 2) {
            // Calculate actual trades per year based on date range
            const firstDate = new Date(trades[0]!.date).getTime();
            const lastDate = new Date(trades[trades.length - 1]!.date).getTime();
            const calendarDays = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
            const tradesPerYear = (trades.length / calendarDays) * 365;
            sharpeRatio = (meanReturn / stdDev) * Math.sqrt(tradesPerYear);
        }
    }

    // Profit factor
    const grossProfit = winners.reduce((s, t) => s + t.pnl_usd, 0);
    const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl_usd, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    const expectancy = trades.length > 0
        ? trades.reduce((s, t) => s + t.pnl_pct, 0) / trades.length
        : 0;

    // Streaks
    let currentStreakType: 'win' | 'loss' | 'none' = 'none';
    let currentStreakLen = 0;
    let longestWinStreak = 0;
    let longestLossStreak = 0;

    // Breakdowns & calibration accumulators
    const signalTypeMap: Record<string, { wins: number; losses: number; breakevens: number }> = {};
    const biasTypeMap: Record<string, { wins: number; losses: number; breakevens: number }> = {};
    const calibrationMap: Record<string, { wins: number; total: number }> = {};
    for (let i = 0; i < 10; i++) {
        calibrationMap[`${i * 10}-${(i + 1) * 10}`] = { wins: 0, total: 0 };
    }
    const monthlyMap: Record<string, { returnPct: number; tradeCount: number }> = {};

    for (const trade of trades) {
        const classification = classifyTrade(trade.pnl_pct);
        const isWin = classification === 'win';
        const isLoss = classification === 'loss';

        // Streaks
        if (isWin) {
            if (currentStreakType === 'win') currentStreakLen++;
            else { currentStreakType = 'win'; currentStreakLen = 1; }
            longestWinStreak = Math.max(longestWinStreak, currentStreakLen);
        } else if (isLoss) {
            if (currentStreakType === 'loss') currentStreakLen++;
            else { currentStreakType = 'loss'; currentStreakLen = 1; }
            longestLossStreak = Math.max(longestLossStreak, currentStreakLen);
        }

        // Monthly
        const dateObj = new Date(trade.date);
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { returnPct: 0, tradeCount: 0 };
        const monthEntry = monthlyMap[monthKey]!;
        monthEntry.returnPct += trade.pnl_pct;
        monthEntry.tradeCount++;

        // Signal type
        if (!signalTypeMap[trade.signal_type]) signalTypeMap[trade.signal_type] = { wins: 0, losses: 0, breakevens: 0 };
        const stEntry = signalTypeMap[trade.signal_type]!;
        if (isWin) stEntry.wins++;
        else if (isLoss) stEntry.losses++;
        else stEntry.breakevens++;

        // Bias type
        if (!biasTypeMap[trade.bias_type]) biasTypeMap[trade.bias_type] = { wins: 0, losses: 0, breakevens: 0 };
        const btEntry = biasTypeMap[trade.bias_type]!;
        if (isWin) btEntry.wins++;
        else if (isLoss) btEntry.losses++;
        else btEntry.breakevens++;

        // Calibration
        const bucketIdx = Math.min(9, Math.floor(trade.confidence / 10));
        const bucketKey = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}`;
        const calEntry = calibrationMap[bucketKey];
        if (calEntry) {
            calEntry.total++;
            if (isWin) calEntry.wins++;
        }
    }

    // Best / worst
    const sortedByPnl = [...trades].sort((a, b) => b.pnl_pct - a.pnl_pct);
    const bestTrade = sortedByPnl.length > 0 ? { ticker: sortedByPnl[0]!.ticker, pnl_pct: sortedByPnl[0]!.pnl_pct } : null;
    const lastSorted = sortedByPnl[sortedByPnl.length - 1];
    const worstTrade = lastSorted ? { ticker: lastSorted.ticker, pnl_pct: lastSorted.pnl_pct } : null;

    // Breakdowns
    const bySignalType: WinRateBreakdown[] = Object.entries(signalTypeMap).map(([label, v]) => ({
        label, wins: v.wins, losses: v.losses, breakevens: v.breakevens,
        total: v.wins + v.losses + v.breakevens,
        winRate: (v.wins + v.losses) > 0 ? (v.wins / (v.wins + v.losses)) * 100 : 0,
    }));

    const byBiasType: WinRateBreakdown[] = Object.entries(biasTypeMap).map(([label, v]) => ({
        label, wins: v.wins, losses: v.losses, breakevens: v.breakevens,
        total: v.wins + v.losses + v.breakevens,
        winRate: (v.wins + v.losses) > 0 ? (v.wins / (v.wins + v.losses)) * 100 : 0,
    }));

    // Monthly returns
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyReturns: MonthlyReturn[] = Object.entries(monthlyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => {
            const [year, month] = key.split('-');
            const monthIdx = parseInt(month || '1', 10) - 1;
            return {
                month: key,
                label: `${MONTH_NAMES[monthIdx] || month} ${year}`,
                returnPct: Math.round(v.returnPct * 100) / 100,
                tradeCount: v.tradeCount,
            };
        });

    // Confidence calibration
    const confidenceCalibration: ConfidenceCalibrationPoint[] = Object.entries(calibrationMap)
        .filter(([, v]) => v.total > 0)
        .map(([bucket, v]) => ({
            bucket,
            predicted: parseInt(bucket.split('-')[0] ?? '0') + 5,
            actual: Math.round((v.wins / v.total) * 100),
            count: v.total,
        }));

    // Walk-forward validation (70/30 split)
    let walkForward: WalkForwardResult | null = null;
    if (filtered.length >= 10) {
        const splitIdx = Math.floor(filtered.length * 0.7);
        const trainData = filtered.slice(0, splitIdx);
        const testData = filtered.slice(splitIdx);

        const trainResult = simulateTrades(trainData, params);
        const testResult = simulateTrades(testData, params);

        const trainWins = trainResult.trades.filter(t => classifyTrade(t.pnl_pct) === 'win').length;
        const testWins = testResult.trades.filter(t => classifyTrade(t.pnl_pct) === 'win').length;
        const trainWinRate = trainResult.trades.length > 0 ? (trainWins / trainResult.trades.length) * 100 : 0;
        const testWinRate = testResult.trades.length > 0 ? (testWins / testResult.trades.length) * 100 : 0;
        const lastTrainTrade = trainResult.trades[trainResult.trades.length - 1];
        const trainReturnPct = lastTrainTrade
            ? ((lastTrainTrade.equity_after - params.startingCapital) / params.startingCapital) * 100
            : 0;
        const lastTestTrade = testResult.trades[testResult.trades.length - 1];
        const testReturnPct = lastTestTrade
            ? ((lastTestTrade.equity_after - params.startingCapital) / params.startingCapital) * 100
            : 0;

        walkForward = {
            trainPeriod: {
                start: trainData[0]?.tracked_at || trainData[0]?.created_at || '',
                end: trainData[trainData.length - 1]?.tracked_at || trainData[trainData.length - 1]?.created_at || '',
                winRate: trainWinRate,
                returnPct: trainReturnPct,
                trades: trainResult.trades.length,
            },
            testPeriod: {
                start: testData[0]?.tracked_at || testData[0]?.created_at || '',
                end: testData[testData.length - 1]?.tracked_at || testData[testData.length - 1]?.created_at || '',
                winRate: testWinRate,
                returnPct: testReturnPct,
                trades: testResult.trades.length,
            },
            degradation: trainWinRate > 0 ? ((trainWinRate - testWinRate) / trainWinRate) * 100 : 0,
        };
    }

    // Monte Carlo simulation (1000 runs, random resampling)
    let monteCarlo: MonteCarloResult | null = null;
    if (tradeReturns.length >= 5) {
        const NUM_SIMS = 1000;
        const finalEquities: number[] = [];
        const maxDrawdowns: number[] = [];

        for (let sim = 0; sim < NUM_SIMS; sim++) {
            let simEquity = params.startingCapital;
            let simPeak = simEquity;
            let simMaxDD = 0;

            for (let i = 0; i < tradeReturns.length; i++) {
                // Random resample with replacement
                const randomIdx = Math.floor(Math.random() * tradeReturns.length);
                const pnlPct = tradeReturns[randomIdx] ?? 0;
                const posSize = simEquity * (params.positionSizePct / 100);
                simEquity += posSize * (pnlPct / 100);

                if (simEquity > simPeak) simPeak = simEquity;
                const dd = simPeak > 0 ? ((simPeak - simEquity) / simPeak) * 100 : 0;
                if (dd > simMaxDD) simMaxDD = dd;
            }

            finalEquities.push(simEquity);
            maxDrawdowns.push(simMaxDD);
        }

        finalEquities.sort((a, b) => a - b);
        maxDrawdowns.sort((a, b) => a - b);

        monteCarlo = {
            simulations: NUM_SIMS,
            medianFinalEquity: finalEquities[Math.floor(NUM_SIMS / 2)] ?? 0,
            percentile5: finalEquities[Math.floor(NUM_SIMS * 0.05)] ?? 0,
            percentile95: finalEquities[Math.floor(NUM_SIMS * 0.95)] ?? 0,
            probabilityOfLoss: finalEquities.filter(e => e < params.startingCapital).length / NUM_SIMS * 100,
            probabilityOfDrawdownOver20: maxDrawdowns.filter(d => d > 20).length / NUM_SIMS * 100,
            medianMaxDrawdownPct: maxDrawdowns[Math.floor(NUM_SIMS / 2)] ?? 0,
        };
    }

    return {
        trades,
        equityCurve,
        summary: {
            totalReturn,
            totalReturnPct,
            winRate,
            totalTrades: trades.length,
            winners: winners.length,
            losers: losers.length,
            breakevens: breakevens.length,
            avgWin,
            avgLoss,
            maxDrawdown,
            maxDrawdownPct,
            sharpeRatio,
            profitFactor,
            expectancy,
            bestTrade,
            worstTrade,
            longestWinStreak,
            longestLossStreak,
            currentStreak: { type: currentStreakType, length: currentStreakLen },
        },
        breakdowns: { bySignalType, byBiasType },
        monthlyReturns,
        confidenceCalibration,
        walkForward,
        monteCarlo,
    };
}
