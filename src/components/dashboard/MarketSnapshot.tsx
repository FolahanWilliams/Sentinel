/**
 * MarketSnapshot — Comprehensive full-width market overview hero panel.
 *
 * Shows AI-generated headline, Fear & Greed gauge, 8 asset tickers
 * (indices, commodities, crypto, bonds), and key market observations.
 */

import { RefreshCw, TrendingUp, TrendingDown, Minus, BarChart3, Gauge } from 'lucide-react';
import { useMarketSnapshot } from '@/hooks/useMarketSnapshot';
import { Sparkline } from '@/components/shared/Sparkline';

export function MarketSnapshot() {
    const { data, loading, refetch } = useMarketSnapshot();

    if (loading || !data) {
        return <MarketSnapshotSkeleton />;
    }

    const { headline, description, fearGreedValue, fearGreedLabel, tickers, summaryBullets, lastUpdated } = data;
    const updatedAgo = Math.round((Date.now() - new Date(lastUpdated).getTime()) / 60000);

    // Fear & Greed color mapping
    const fgColor = fearGreedValue < 25 ? 'text-red-500' : fearGreedValue < 45 ? 'text-amber-500' : fearGreedValue < 55 ? 'text-yellow-400' : fearGreedValue < 75 ? 'text-lime-400' : 'text-emerald-500';
    const fgBarColor = fearGreedValue < 25 ? 'from-red-600 to-red-400' : fearGreedValue < 45 ? 'from-red-500 via-amber-500 to-amber-400' : fearGreedValue < 55 ? 'from-red-500 via-amber-500 to-yellow-400' : fearGreedValue < 75 ? 'from-red-500 via-amber-500 via-yellow-400 to-lime-400' : 'from-red-500 via-amber-500 via-yellow-400 to-emerald-400';

    // Market session status
    const now = new Date();
    const estHour = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getHours();
    const estDay = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
    const isWeekend = estDay === 0 || estDay === 6;
    const marketStatus = isWeekend ? 'Closed' : estHour < 4 ? 'Closed' : estHour < 9.5 ? 'Pre-Market' : estHour < 16 ? 'Market Open' : estHour < 20 ? 'After Hours' : 'Closed';
    const marketStatusColor = marketStatus === 'Market Open' ? 'text-emerald-400' : marketStatus === 'Pre-Market' || marketStatus === 'After Hours' ? 'text-amber-400' : 'text-sentinel-500';
    const marketStatusDot = marketStatus === 'Market Open' ? 'bg-emerald-500' : marketStatus === 'Pre-Market' || marketStatus === 'After Hours' ? 'bg-amber-500' : 'bg-sentinel-600';

    // Indices
    const indices = [
        { label: 'S&P 500', ticker: tickers.sp500 },
        { label: 'NASDAQ', ticker: tickers.nasdaq },
        { label: 'DOW', ticker: tickers.dji },
        { label: 'VIX', ticker: tickers.vix, invertColor: true },
    ];

    // Alternative assets
    const altAssets = [
        { label: 'Bitcoin', ticker: tickers.btc, prefix: '$' },
        { label: 'Gold', ticker: tickers.gold, prefix: '$' },
        { label: 'Oil (WTI)', ticker: tickers.oil, prefix: '$' },
        { label: '10Y Yield', ticker: tickers.tnx, suffix: '%' },
    ];

    // Broad market direction from indices
    const indicesUp = [tickers.sp500, tickers.nasdaq, tickers.dji].filter(t => t.changePercent > 0).length;
    const broadDirection = indicesUp >= 2 ? 'bullish' : indicesUp === 0 ? 'bearish' : 'mixed';

    return (
        <div className="glass-panel-heavy overflow-hidden relative">
            {/* Subtle gradient background accent */}
            <div className={`absolute inset-0 pointer-events-none opacity-[0.03] ${
                broadDirection === 'bullish' ? 'bg-gradient-to-br from-emerald-500 to-transparent' :
                broadDirection === 'bearish' ? 'bg-gradient-to-br from-red-500 to-transparent' :
                'bg-gradient-to-br from-blue-500 to-transparent'
            }`} />

            <div className="relative z-10">
                {/* Top bar: Title + Status + Refresh */}
                <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-sentinel-800/40">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <BarChart3 className="w-4.5 h-4.5 text-blue-400" />
                            <h2 className="text-sm font-bold text-sentinel-100 uppercase tracking-wider">Market Overview</h2>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sentinel-900/60 border border-sentinel-800/50">
                            <span className={`w-1.5 h-1.5 rounded-full ${marketStatusDot} ${marketStatus === 'Market Open' ? 'animate-pulse' : ''}`} />
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${marketStatusColor}`}>{marketStatus}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] text-sentinel-500 font-mono">
                            {updatedAgo < 1 ? 'just now' : `${updatedAgo}m ago`}
                        </span>
                        <button
                            onClick={() => refetch()}
                            className="p-1.5 rounded-md text-sentinel-500 hover:text-sentinel-300 hover:bg-sentinel-800/50 transition-colors cursor-pointer border-none bg-transparent"
                            title="Refresh market data"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Main content grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">

                    {/* LEFT: Headline + Summary */}
                    <div className="lg:col-span-5 p-5 lg:border-r border-sentinel-800/30">
                        <h3 className="text-xl font-display font-bold text-sentinel-50 leading-tight mb-2">
                            {headline}
                        </h3>
                        <p className="text-sm text-sentinel-300 leading-relaxed mb-4">
                            {description}
                        </p>

                        {/* Fear & Greed Gauge */}
                        <div className="bg-sentinel-950/50 rounded-xl p-3.5 border border-sentinel-800/40 mb-4">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <Gauge className="w-3.5 h-3.5 text-sentinel-400" />
                                    <span className="text-[10px] font-bold text-sentinel-400 uppercase tracking-widest">Fear & Greed</span>
                                </div>
                                <div className="flex items-baseline gap-1">
                                    <span className={`text-xl font-bold font-mono ${fgColor}`}>{fearGreedValue}</span>
                                    <span className={`text-[10px] font-bold uppercase ${fgColor}`}>{fearGreedLabel}</span>
                                </div>
                            </div>
                            <div className="h-2 w-full bg-sentinel-800 rounded-full overflow-hidden relative">
                                <div className={`absolute top-0 left-0 h-full bg-gradient-to-r ${fgBarColor}`} style={{ width: `${fearGreedValue}%` }} />
                                <div
                                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full border-2 border-sentinel-900 shadow-lg"
                                    style={{ left: `calc(${fearGreedValue}% - 7px)` }}
                                />
                            </div>
                            <div className="flex justify-between text-[9px] text-sentinel-500 mt-1 font-mono">
                                <span>EXTREME FEAR</span>
                                <span>NEUTRAL</span>
                                <span>EXTREME GREED</span>
                            </div>
                        </div>

                        {/* Summary bullets */}
                        <div className="space-y-2">
                            {summaryBullets.slice(0, 5).map((b, i) => (
                                <div key={i} className="flex items-start gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${b.color.replace('text-', 'bg-')}`} />
                                    <span className="text-xs text-sentinel-300 leading-relaxed">{b.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* RIGHT: Ticker grid */}
                    <div className="lg:col-span-7 p-5">
                        {/* Indices */}
                        <div className="mb-4">
                            <h4 className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                                <TrendingUp className="w-3 h-3" /> Indices
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {indices.map(({ label, ticker, invertColor }) => (
                                    <TickerCard
                                        key={label}
                                        label={label}
                                        price={ticker.price}
                                        change={ticker.change}
                                        changePercent={ticker.changePercent}
                                        invertColor={invertColor}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Alternative Assets */}
                        <div>
                            <h4 className="text-[10px] font-bold text-sentinel-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                                <BarChart3 className="w-3 h-3" /> Commodities & Crypto
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {altAssets.map(({ label, ticker, prefix, suffix }) => (
                                    <TickerCard
                                        key={label}
                                        label={label}
                                        price={ticker.price}
                                        change={ticker.change}
                                        changePercent={ticker.changePercent}
                                        prefix={prefix}
                                        suffix={suffix}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Broad direction indicator */}
                        <div className="mt-4 flex items-center justify-between bg-sentinel-950/40 rounded-lg px-4 py-2.5 border border-sentinel-800/30">
                            <div className="flex items-center gap-2">
                                {broadDirection === 'bullish' ? (
                                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                                ) : broadDirection === 'bearish' ? (
                                    <TrendingDown className="w-4 h-4 text-red-400" />
                                ) : (
                                    <Minus className="w-4 h-4 text-amber-400" />
                                )}
                                <span className="text-xs font-medium text-sentinel-300">
                                    Broad market:
                                    <span className={`ml-1 font-bold ${
                                        broadDirection === 'bullish' ? 'text-emerald-400' :
                                        broadDirection === 'bearish' ? 'text-red-400' : 'text-amber-400'
                                    }`}>
                                        {broadDirection === 'bullish' ? 'Risk-On' : broadDirection === 'bearish' ? 'Risk-Off' : 'Mixed'}
                                    </span>
                                </span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-mono text-sentinel-500">
                                <span>VIX <span className={tickers.vix.changePercent > 5 ? 'text-red-400 font-bold' : tickers.vix.changePercent < -5 ? 'text-emerald-400' : 'text-sentinel-400'}>{tickers.vix.price.toFixed(1)}</span></span>
                                <span className="text-sentinel-700">|</span>
                                <span>F&G <span className={fgColor}>{fearGreedValue}</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Individual ticker card with sparkline */
function TickerCard({
    label,
    price,
    change,
    changePercent,
    prefix = '',
    suffix = '',
    invertColor = false,
}: {
    label: string;
    price: number;
    change: number;
    changePercent: number;
    prefix?: string;
    suffix?: string;
    invertColor?: boolean;
}) {
    const isPositive = invertColor ? changePercent < 0 : changePercent >= 0;
    const changeColor = isPositive ? 'text-emerald-400' : 'text-red-400';
    const bgAccent = isPositive ? 'border-emerald-500/10' : 'border-red-500/10';

    const formattedPrice = price >= 10000
        ? price.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : price >= 100
        ? price.toLocaleString(undefined, { maximumFractionDigits: 1 })
        : price.toFixed(2);

    const formattedChange = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
    const sparkData = generateSparkData(price, changePercent);

    return (
        <div className={`bg-sentinel-950/50 p-2.5 rounded-lg border ${bgAccent} border-sentinel-800/40 hover:border-sentinel-700/60 transition-colors group`}>
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-sentinel-500 uppercase tracking-widest font-semibold truncate">{label}</span>
                <Sparkline data={sparkData} width={40} height={16} color="auto" strokeWidth={1} showDot={false} />
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-bold text-sentinel-100 font-mono">{prefix}{formattedPrice}{suffix}</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
                {changePercent !== 0 && (
                    changePercent > 0
                        ? <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                        : <TrendingDown className="w-2.5 h-2.5 text-red-500" />
                )}
                <span className={`text-[10px] font-bold font-mono ${changeColor}`}>{formattedChange}</span>
                {change !== 0 && (
                    <span className="text-[9px] text-sentinel-600 font-mono ml-0.5">
                        ({change >= 0 ? '+' : ''}{Math.abs(change) >= 100 ? change.toFixed(0) : change.toFixed(2)})
                    </span>
                )}
            </div>
        </div>
    );
}

/** Generate synthetic sparkline from price and change */
function generateSparkData(price: number, change: number): number[] {
    const points = 12;
    const data: number[] = [];
    const startPrice = price / (1 + change / 100);
    for (let i = 0; i < points; i++) {
        const progress = i / (points - 1);
        const wobble = Math.sin(progress * Math.PI * 2.5 + change) * price * 0.003;
        data.push(startPrice + (price - startPrice) * progress + wobble);
    }
    return data;
}

/** Loading skeleton */
function MarketSnapshotSkeleton() {
    return (
        <div className="glass-panel-heavy animate-pulse">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-sentinel-800/40">
                <div className="flex items-center gap-4">
                    <div className="h-4 bg-sentinel-800 rounded w-32" />
                    <div className="h-5 bg-sentinel-800 rounded-full w-20" />
                </div>
                <div className="h-3 bg-sentinel-800 rounded w-12" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
                <div className="lg:col-span-5 p-5 lg:border-r border-sentinel-800/30 space-y-3">
                    <div className="h-6 bg-sentinel-800 rounded w-3/4" />
                    <div className="h-4 bg-sentinel-800 rounded w-full" />
                    <div className="h-4 bg-sentinel-800 rounded w-5/6" />
                    <div className="h-16 bg-sentinel-800 rounded-xl w-full mt-4" />
                    <div className="space-y-2 mt-4">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-3 bg-sentinel-800 rounded w-full" />)}
                    </div>
                </div>
                <div className="lg:col-span-7 p-5 space-y-4">
                    <div className="h-3 bg-sentinel-800 rounded w-16" />
                    <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-sentinel-800 rounded-lg" />)}
                    </div>
                    <div className="h-3 bg-sentinel-800 rounded w-28 mt-4" />
                    <div className="grid grid-cols-4 gap-2">
                        {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-sentinel-800 rounded-lg" />)}
                    </div>
                </div>
            </div>
        </div>
    );
}
