import { ArrowUpRight } from 'lucide-react';
import { useMarketSnapshot } from '@/hooks/useMarketSnapshot';
import { Sparkline } from '@/components/shared/Sparkline';

export function MarketSnapshot() {
    const { data, loading } = useMarketSnapshot();

    if (loading || !data) {
        return (
            <div className="glass-panel flex flex-col h-full animate-pulse">
                <div className="flex justify-between items-start mb-4">
                    <div className="h-4 bg-sentinel-800 rounded w-32"></div>
                    <div className="h-4 w-4 bg-sentinel-800 rounded"></div>
                </div>
                <div className="mb-4 space-y-2">
                    <div className="h-3 bg-sentinel-800 rounded w-24"></div>
                    <div className="h-7 bg-sentinel-800 rounded w-3/4"></div>
                    <div className="h-4 bg-sentinel-800 rounded w-full"></div>
                    <div className="h-4 bg-sentinel-800 rounded w-5/6"></div>
                </div>
                <div className="mb-6 space-y-2">
                    <div className="h-4 bg-sentinel-800 rounded w-40"></div>
                    <div className="h-1.5 bg-sentinel-800 rounded-full w-full"></div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="space-y-1">
                            <div className="h-3 bg-sentinel-800 rounded w-8"></div>
                            <div className="h-4 bg-sentinel-800 rounded w-16"></div>
                        </div>
                    ))}
                </div>
                <div className="mt-auto space-y-3">
                    <div className="h-4 bg-sentinel-800 rounded w-32"></div>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-4 bg-sentinel-800 rounded w-full"></div>
                    ))}
                </div>
            </div>
        );
    }

    const { headline, description, fearGreedValue, fearGreedLabel, tickers, summaryBullets, lastUpdated } = data;
    const updatedAgo = Math.round((Date.now() - new Date(lastUpdated).getTime()) / 60000);
    const fgColor = fearGreedValue < 25 ? 'text-red-500' : fearGreedValue < 45 ? 'text-amber-500' : fearGreedValue < 55 ? 'text-yellow-400' : fearGreedValue < 75 ? 'text-lime-400' : 'text-emerald-500';

    return (
        <div className="glass-panel-heavy flex flex-col h-full">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-sentinel-100 uppercase tracking-wider">Market Snapshot</h2>
                </div>
                <ArrowUpRight className="w-4 h-4 text-sentinel-400" />
            </div>

            <div className="mb-4">
                <div className="flex items-center gap-2 text-xs mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-sentinel-300">Updated {updatedAgo < 1 ? 'just now' : `${updatedAgo} min ago`}</span>
                </div>
                <h3 className="text-2xl font-display font-bold text-sentinel-50 mt-1 leading-tight">
                    {headline}
                </h3>
                <p className="text-sm text-sentinel-300 mt-2 leading-relaxed">
                    {description}
                </p>
            </div>

            <div className="mb-6">
                <div className="flex justify-between items-end mb-2">
                    <h4 className="text-xs font-bold text-sentinel-200 uppercase tracking-widest">Fear & Greed Index</h4>
                    <div className="text-right">
                        <span className={`text-lg font-bold ${fgColor}`}>{fearGreedValue}</span>
                        <span className={`text-xs font-bold ${fgColor} ml-1 uppercase`}>{fearGreedLabel}</span>
                    </div>
                </div>
                <div className="h-1.5 w-full bg-sentinel-800 rounded-full overflow-hidden relative mb-1">
                    <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500" style={{ width: `${fearGreedValue}%` }}></div>
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-amber-500 rounded-full border-2 border-sentinel-900 shadow-[0_0_10px_rgba(245,158,11,0.5)]" style={{ left: `calc(${fearGreedValue}% - 6px)` }}></div>
                </div>
                <div className="flex justify-between text-[10px] text-sentinel-400">
                    <span>Fear</span>
                    <span>Greed</span>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-6">
                <TickerCell label="VIX" price={tickers.vix.price} change={tickers.vix.changePercent} />
                <TickerCell label="S&P 500" price={tickers.sp500.price} change={tickers.sp500.changePercent} />
                <TickerCell label="BTC" price={tickers.btc.price} change={tickers.btc.changePercent} />
            </div>

            <div className="mt-auto">
                <h4 className="text-xs font-bold text-sentinel-200 uppercase tracking-widest mb-3">Market Summary</h4>
                <div className="space-y-3">
                    {summaryBullets.map((b, i) => (
                        <SummaryItem key={i} color={b.color} text={b.text} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function TickerCell({ label, price, change }: { label: string; price: number; change: number }) {
    const changeColor = change >= 0 ? 'text-emerald-400' : 'text-red-400';
    const formattedPrice = price >= 1000 ? price.toLocaleString(undefined, { maximumFractionDigits: 0 }) : price.toFixed(2);
    const formattedChange = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;

    // Generate a simple sparkline from price + change direction
    const sparkData = generateSparkData(price, change);

    return (
        <div className="bg-sentinel-950/40 p-2 rounded-lg border border-white/5">
            <div className="text-[10px] text-sentinel-500 uppercase tracking-widest font-semibold mb-0.5">{label}</div>
            <div className="flex items-center justify-between gap-1">
                <div>
                    <span className="text-sm font-bold text-sentinel-100 font-mono">{formattedPrice}</span>
                    {price > 0 && <div className={`text-[10px] font-medium font-mono ${changeColor}`}>{formattedChange}</div>}
                </div>
                {price > 0 && <Sparkline data={sparkData} width={48} height={20} color="auto" strokeWidth={1.2} showDot={true} />}
            </div>
        </div>
    );
}

/** Generate a simple synthetic sparkline based on price and change */
function generateSparkData(price: number, change: number): number[] {
    const points = 12;
    const data: number[] = [];
    const startPrice = price / (1 + change / 100);
    for (let i = 0; i < points; i++) {
        const progress = i / (points - 1);
        // Slight sinusoidal wobble + linear trend
        const wobble = Math.sin(progress * Math.PI * 2.5 + change) * price * 0.003;
        data.push(startPrice + (price - startPrice) * progress + wobble);
    }
    return data;
}

function SummaryItem({ color, text }: { color: string; text: string }) {
    return (
        <div className="flex items-start gap-2">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${color.replace('text-', 'bg-')}`}></span>
            <span className="text-sm text-sentinel-300 line-clamp-1">{text}</span>
        </div>
    )
}
