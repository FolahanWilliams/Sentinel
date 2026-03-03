/**
 * backtestEngine — Pure function backtest simulator.
 *
 * Takes filtered signal_outcomes joined with signals data,
 * simulates sequential trading, and returns equity curve + stats.
 *
 * v2: Added date-range filtering, ticker filtering, return-horizon
 * selector, monthly return breakdown, win-rate breakdowns, streaks,
 * and expectancy.
 */

export interface BacktestParams {
    startingCapital: number;
    minConfidence: number;
    agentFilter: 'all' | 'overreaction' | 'contagion';
    positionSizePct: number; // % of capital per trade
    returnHorizon: '1d' | '5d' | '10d' | '30d' | 'best';
    startDate?: string; // ISO date string — only include trades on or after
    endDate?: string;   // ISO date string — only include trades on or before
    tickerFilter?: string; // comma-separated tickers, blank = all
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
    total: number;
    winRate: number;
}

export interface MonthlyReturn {
    month: string; // "YYYY-MM"
    label: string; // "Jan 2026"
    returnPct: number;
    tradeCount: number;
}

export interface ConfidenceCalibrationPoint {
    bucket: string;    // "60-70"
    predicted: number; // midpoint e.g. 65
    actual: number;    // actual win rate in that bucket
    count: number;
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
}

function pickReturn(row: any, horizon: BacktestParams['returnHorizon']): number {
    if (horizon === 'best') {
        return row.return_30d ?? row.return_10d ?? row.return_5d ?? row.return_1d ?? 0;
    }
    const map: Record<string, string> = {
        '1d': 'return_1d', '5d': 'return_5d',
        '10d': 'return_10d', '30d': 'return_30d',
    };
    return row[map[horizon] ?? 'return_30d'] ?? 0;
}

export function runBacktest(
    signalData: any[],
    params: BacktestParams,
): BacktestResult {
    let equity = params.startingCapital;
    let peakEquity = equity;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    const trades: BacktestTrade[] = [];
    const equityCurve: { date: string; equity: number }[] = [
        { date: 'Start', equity: params.startingCapital },
    ];
    const dailyReturns: number[] = [];

    // Parse ticker filter
    const tickerSet = params.tickerFilter
        ? new Set(params.tickerFilter.split(',').map(t => t.trim().toUpperCase()).filter(Boolean))
        : null;

    // Parse date boundaries
    const startMs = params.startDate ? new Date(params.startDate).getTime() : 0;
    const endMs = params.endDate ? new Date(params.endDate).getTime() : Infinity;

    // Sort by date
    const sorted = [...signalData].sort((a, b) =>
        new Date(a.tracked_at || a.created_at).getTime() -
        new Date(b.tracked_at || b.created_at).getTime()
    );

    // Monthly P&L accumulator
    const monthlyMap: Record<string, { returnPct: number; tradeCount: number }> = {};

    // Win-rate breakdown accumulators
    const signalTypeMap: Record<string, { wins: number; losses: number }> = {};
    const biasTypeMap: Record<string, { wins: number; losses: number }> = {};

    // Confidence calibration accumulators
    const calibrationMap: Record<string, { wins: number; total: number }> = {};
    for (let i = 0; i < 10; i++) {
        calibrationMap[`${i * 10}-${(i + 1) * 10}`] = { wins: 0, total: 0 };
    }

    // Streak tracking
    let currentStreakType: 'win' | 'loss' | 'none' = 'none';
    let currentStreakLen = 0;
    let longestWinStreak = 0;
    let longestLossStreak = 0;

    for (const row of sorted) {
        // Date filter
        const rowDate = new Date(row.tracked_at || row.created_at).getTime();
        if (rowDate < startMs || rowDate > endMs) continue;

        // Ticker filter
        const ticker = (row.ticker || '').toUpperCase();
        if (tickerSet && !tickerSet.has(ticker)) continue;

        // Filter by agent type
        if (params.agentFilter !== 'all') {
            const signalType = (row.signal_type || '').toLowerCase();
            if (params.agentFilter === 'overreaction' && !signalType.includes('overreaction')) continue;
            if (params.agentFilter === 'contagion' && !signalType.includes('contagion')) continue;
        }

        // Filter by confidence
        if ((row.confidence_score || 0) < params.minConfidence) continue;

        // Determine return based on selected horizon
        const pnlPct = pickReturn(row, params.returnHorizon);
        const positionSize = equity * (params.positionSizePct / 100);
        const pnlUsd = positionSize * (pnlPct / 100);

        equity += pnlUsd;

        // Track drawdown
        if (equity > peakEquity) peakEquity = equity;
        const currentDrawdown = peakEquity - equity;
        const currentDrawdownPct = peakEquity > 0 ? (currentDrawdown / peakEquity) * 100 : 0;
        if (currentDrawdown > maxDrawdown) {
            maxDrawdown = currentDrawdown;
            maxDrawdownPct = currentDrawdownPct;
        }

        dailyReturns.push(pnlPct);

        const isWin = pnlUsd > 0;
        const biasType = row.bias_type || 'unknown';
        const signalType = row.signal_type || 'unknown';

        // Streak tracking
        if (isWin) {
            if (currentStreakType === 'win') { currentStreakLen++; }
            else { currentStreakType = 'win'; currentStreakLen = 1; }
            longestWinStreak = Math.max(longestWinStreak, currentStreakLen);
        } else {
            if (currentStreakType === 'loss') { currentStreakLen++; }
            else { currentStreakType = 'loss'; currentStreakLen = 1; }
            longestLossStreak = Math.max(longestLossStreak, currentStreakLen);
        }

        // Monthly accumulation
        const dateObj = new Date(row.tracked_at || row.created_at);
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { returnPct: 0, tradeCount: 0 };
        monthlyMap[monthKey].returnPct += pnlPct;
        monthlyMap[monthKey].tradeCount++;

        // Signal type breakdown
        if (!signalTypeMap[signalType]) signalTypeMap[signalType] = { wins: 0, losses: 0 };
        if (isWin) signalTypeMap[signalType].wins++;
        else signalTypeMap[signalType].losses++;

        // Bias type breakdown
        if (!biasTypeMap[biasType]) biasTypeMap[biasType] = { wins: 0, losses: 0 };
        if (isWin) biasTypeMap[biasType].wins++;
        else biasTypeMap[biasType].losses++;

        // Confidence calibration
        const conf = row.confidence_score || 0;
        const bucketIdx = Math.min(9, Math.floor(conf / 10));
        const bucketKey = `${bucketIdx * 10}-${(bucketIdx + 1) * 10}`;
        if (calibrationMap[bucketKey]) {
            calibrationMap[bucketKey].total++;
            if (isWin) calibrationMap[bucketKey].wins++;
        }

        const trade: BacktestTrade = {
            ticker: row.ticker,
            signal_type: signalType,
            bias_type: biasType,
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
        };

        trades.push(trade);
        equityCurve.push({
            date: new Date(trade.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            equity,
        });
    }

    // Calculate summary stats
    const winners = trades.filter(t => t.pnl_usd > 0);
    const losers = trades.filter(t => t.pnl_usd <= 0);
    const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;
    const avgWin = winners.length > 0 ? winners.reduce((s, t) => s + t.pnl_pct, 0) / winners.length : 0;
    const avgLoss = losers.length > 0 ? losers.reduce((s, t) => s + t.pnl_pct, 0) / losers.length : 0;
    const totalReturn = equity - params.startingCapital;
    const totalReturnPct = params.startingCapital > 0 ? (totalReturn / params.startingCapital) * 100 : 0;

    // Sharpe Ratio (annualized, assuming ~252 trading days)
    const meanReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length : 0;
    const stdDev = dailyReturns.length > 1
        ? Math.sqrt(dailyReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (dailyReturns.length - 1))
        : 1;
    const sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(Math.min(252, dailyReturns.length)) : 0;

    // Profit factor
    const grossProfit = winners.reduce((s, t) => s + t.pnl_usd, 0);
    const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl_usd, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Expectancy: average P&L per trade as a %
    const expectancy = trades.length > 0
        ? trades.reduce((s, t) => s + t.pnl_pct, 0) / trades.length
        : 0;

    // Best / worst trade
    const sortedByPnl = [...trades].sort((a, b) => b.pnl_pct - a.pnl_pct);
    const bestTrade = sortedByPnl.length > 0 ? { ticker: sortedByPnl[0]!.ticker, pnl_pct: sortedByPnl[0]!.pnl_pct } : null;
    const worstTrade = sortedByPnl.length > 0 ? { ticker: sortedByPnl[sortedByPnl.length - 1]!.ticker, pnl_pct: sortedByPnl[sortedByPnl.length - 1]!.pnl_pct } : null;

    // Build breakdowns
    const bySignalType: WinRateBreakdown[] = Object.entries(signalTypeMap).map(([label, v]) => ({
        label,
        wins: v.wins,
        losses: v.losses,
        total: v.wins + v.losses,
        winRate: v.wins + v.losses > 0 ? (v.wins / (v.wins + v.losses)) * 100 : 0,
    }));

    const byBiasType: WinRateBreakdown[] = Object.entries(biasTypeMap).map(([label, v]) => ({
        label,
        wins: v.wins,
        losses: v.losses,
        total: v.wins + v.losses,
        winRate: v.wins + v.losses > 0 ? (v.wins / (v.wins + v.losses)) * 100 : 0,
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
    };
}
