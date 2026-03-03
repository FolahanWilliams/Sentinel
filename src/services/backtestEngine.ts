/**
 * backtestEngine — Pure function backtest simulator.
 *
 * Takes filtered signal_outcomes joined with signals data,
 * simulates sequential trading, and returns equity curve + stats.
 */

export interface BacktestParams {
    startingCapital: number;
    minConfidence: number;
    agentFilter: 'all' | 'overreaction' | 'contagion';
    positionSizePct: number; // % of capital per trade
}

export interface BacktestTrade {
    ticker: string;
    signal_type: string;
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
    };
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

    // Sort by date
    const sorted = [...signalData].sort((a, b) =>
        new Date(a.tracked_at || a.created_at).getTime() -
        new Date(b.tracked_at || b.created_at).getTime()
    );

    for (const row of sorted) {
        // Filter by agent type
        if (params.agentFilter !== 'all') {
            const signalType = (row.signal_type || '').toLowerCase();
            if (params.agentFilter === 'overreaction' && !signalType.includes('overreaction')) continue;
            if (params.agentFilter === 'contagion' && !signalType.includes('contagion')) continue;
        }

        // Filter by confidence
        if ((row.confidence_score || 0) < params.minConfidence) continue;

        // Determine the best available return
        const bestReturn = row.return_30d ?? row.return_10d ?? row.return_5d ?? row.return_1d ?? 0;
        const pnlPct = bestReturn;
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

        const trade: BacktestTrade = {
            ticker: row.ticker,
            signal_type: row.signal_type || 'unknown',
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
        },
    };
}
