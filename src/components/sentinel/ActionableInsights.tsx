/**
 * ActionableInsights — Surfaces high-value, actionable intelligence
 * from the news feed: ticker momentum, sector rotation signals,
 * and portfolio-relevant alerts.
 */

import { useMemo } from 'react';
import type { ProcessedArticle } from '@/types/sentinel';
import type { Position } from '@/hooks/usePortfolio';
import { TickerLink } from '@/components/shared/TickerLink';
import {
    TrendingUp, TrendingDown, BarChart3, AlertTriangle,
    Flame, Target, Shield
} from 'lucide-react';

interface ActionableInsightsProps {
    articles: ProcessedArticle[];
    portfolioPositions?: Position[];
    onScanTicker?: (ticker: string) => void;
}

interface TickerMomentum {
    ticker: string;
    mentions: number;
    bullish: number;
    bearish: number;
    neutral: number;
    avgSentiment: number;
    highImpact: number;
    signals: string[];
}

interface SectorHeat {
    sector: string;
    count: number;
    avgSentiment: number;
    bullishPct: number;
}

export function ActionableInsights({ articles, portfolioPositions = [], onScanTicker }: ActionableInsightsProps) {
    // Compute ticker momentum — which tickers have the most activity and strongest directional bias
    const tickerMomentum = useMemo(() => {
        const map = new Map<string, TickerMomentum>();

        for (const article of articles) {
            const tickers = new Set<string>();

            // From entities (ticker-like)
            for (const e of article.entities) {
                if (/^[A-Z]{1,5}$/.test(e)) tickers.add(e);
            }
            // From signals
            for (const s of article.signals || []) {
                if (s.ticker) tickers.add(s.ticker.toUpperCase());
            }

            for (const ticker of tickers) {
                const existing = map.get(ticker) || {
                    ticker, mentions: 0, bullish: 0, bearish: 0, neutral: 0,
                    avgSentiment: 0, highImpact: 0, signals: [],
                };
                existing.mentions++;
                existing[article.sentiment]++;
                if (article.impact === 'high') existing.highImpact++;

                // Collect signal types
                for (const s of article.signals || []) {
                    if (s.ticker?.toUpperCase() === ticker && !existing.signals.includes(s.type)) {
                        existing.signals.push(s.type);
                    }
                }
                map.set(ticker, existing);
            }
        }

        // Compute avg sentiment and filter meaningful tickers
        const result: TickerMomentum[] = [];
        for (const [, m] of map) {
            if (m.mentions < 2) continue;
            m.avgSentiment = m.mentions > 0 ? (m.bullish - m.bearish) / m.mentions : 0;
            result.push(m);
        }

        return result.sort((a, b) => b.mentions - a.mentions).slice(0, 8);
    }, [articles]);

    // Sector heat — aggregate sentiment by category
    const sectorHeat = useMemo(() => {
        const map = new Map<string, { count: number; bullish: number; total: number; sentSum: number }>();

        for (const article of articles) {
            const cat = article.category.replace('_', ' ');
            const existing = map.get(cat) || { count: 0, bullish: 0, total: 0, sentSum: 0 };
            existing.count++;
            existing.total++;
            if (article.sentiment === 'bullish') existing.bullish++;
            existing.sentSum += article.sentiment_score;
            map.set(cat, existing);
        }

        const result: SectorHeat[] = [];
        for (const [sector, data] of map) {
            if (data.count < 2) continue;
            result.push({
                sector,
                count: data.count,
                avgSentiment: data.sentSum / data.count,
                bullishPct: Math.round((data.bullish / data.total) * 100),
            });
        }

        return result.sort((a, b) => b.count - a.count).slice(0, 6);
    }, [articles]);

    // Portfolio risk alerts — detect when multiple bearish articles target a held position
    const portfolioAlerts = useMemo(() => {
        if (portfolioPositions.length === 0) return [];

        const alerts: { ticker: string; side: string; bearishCount: number; bullishCount: number; message: string }[] = [];

        for (const pos of portfolioPositions) {
            const t = pos.ticker.toUpperCase();
            let bearish = 0;
            let bullish = 0;

            for (const article of articles) {
                const mentioned = article.entities.some(e => e.toUpperCase() === t) ||
                    article.signals?.some(s => s.ticker?.toUpperCase() === t);
                if (!mentioned) continue;
                if (article.sentiment === 'bearish') bearish++;
                if (article.sentiment === 'bullish') bullish++;
            }

            // Alert if 2+ bearish articles on a long position, or 2+ bullish on a short
            if (pos.side === 'long' && bearish >= 2) {
                alerts.push({
                    ticker: t, side: pos.side, bearishCount: bearish, bullishCount: bullish,
                    message: `${bearish} bearish articles — review your long position`,
                });
            } else if (pos.side === 'short' && bullish >= 2) {
                alerts.push({
                    ticker: t, side: pos.side, bearishCount: bearish, bullishCount: bullish,
                    message: `${bullish} bullish articles — review your short position`,
                });
            }
        }

        return alerts;
    }, [articles, portfolioPositions]);

    if (articles.length === 0) return null;

    return (
        <div className="space-y-4 mb-4">
            {/* Portfolio Risk Alerts */}
            {portfolioAlerts.length > 0 && (
                <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                    <h3 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5" />
                        Portfolio Alerts
                    </h3>
                    <div className="space-y-2">
                        {portfolioAlerts.map(alert => (
                            <div key={alert.ticker} className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/15">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <TickerLink ticker={alert.ticker} className="text-xs" />
                                <span className="text-xs text-sentinel-300 flex-1">{alert.message}</span>
                                {onScanTicker && (
                                    <button
                                        onClick={() => onScanTicker(alert.ticker)}
                                        className="text-[10px] text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 cursor-pointer transition-colors"
                                    >
                                        Scan
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Ticker Momentum */}
            {tickerMomentum.length > 0 && (
                <div className="p-4 rounded-xl bg-sentinel-800/40 border border-sentinel-700/50 backdrop-blur-sm">
                    <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Flame className="w-3.5 h-3.5 text-orange-400" />
                        Trending Tickers
                    </h3>
                    <div className="space-y-1.5">
                        {tickerMomentum.map(m => {
                            const isBullish = m.avgSentiment > 0.2;
                            const isBearish = m.avgSentiment < -0.2;
                            return (
                                <div key={m.ticker} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-sentinel-800/60 transition-colors group">
                                    <TickerLink ticker={m.ticker} className="text-xs font-bold" />

                                    {/* Sentiment bar */}
                                    <div className="flex-1 h-1.5 bg-sentinel-800 rounded-full overflow-hidden flex">
                                        {m.bullish > 0 && (
                                            <div
                                                className="h-full bg-emerald-500/70"
                                                style={{ width: `${(m.bullish / m.mentions) * 100}%` }}
                                            />
                                        )}
                                        {m.neutral > 0 && (
                                            <div
                                                className="h-full bg-sentinel-600/70"
                                                style={{ width: `${(m.neutral / m.mentions) * 100}%` }}
                                            />
                                        )}
                                        {m.bearish > 0 && (
                                            <div
                                                className="h-full bg-red-500/70"
                                                style={{ width: `${(m.bearish / m.mentions) * 100}%` }}
                                            />
                                        )}
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {m.highImpact > 0 && (
                                            <span className="text-amber-400 text-[9px]" title={`${m.highImpact} high-impact`}>
                                                {m.highImpact}HI
                                            </span>
                                        )}
                                        <span className="text-[10px] text-sentinel-500 font-mono w-4 text-right">
                                            {m.mentions}
                                        </span>
                                        {isBullish && <TrendingUp className="w-3 h-3 text-emerald-400" />}
                                        {isBearish && <TrendingDown className="w-3 h-3 text-red-400" />}
                                        {!isBullish && !isBearish && <BarChart3 className="w-3 h-3 text-sentinel-500" />}
                                    </div>

                                    {onScanTicker && (
                                        <button
                                            onClick={() => onScanTicker(m.ticker)}
                                            className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 cursor-pointer transition-all"
                                        >
                                            <Target className="w-2.5 h-2.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Sector Heat */}
            {sectorHeat.length > 0 && (
                <div className="p-4 rounded-xl bg-sentinel-800/40 border border-sentinel-700/50 backdrop-blur-sm">
                    <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-blue-400" />
                        Sector Activity
                    </h3>
                    <div className="space-y-2">
                        {sectorHeat.map(s => (
                            <div key={s.sector} className="flex items-center gap-2">
                                <span className="text-[10px] text-sentinel-300 capitalize w-20 truncate" title={s.sector}>
                                    {s.sector}
                                </span>
                                <div className="flex-1 h-1.5 bg-sentinel-800 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${s.bullishPct >= 60 ? 'bg-emerald-500/70' : s.bullishPct <= 40 ? 'bg-red-500/70' : 'bg-sentinel-500/70'}`}
                                        style={{ width: `${Math.min(100, (s.count / Math.max(...sectorHeat.map(x => x.count))) * 100)}%` }}
                                    />
                                </div>
                                <span className="text-[10px] font-mono text-sentinel-500 w-6 text-right">{s.count}</span>
                                <span className={`text-[10px] font-mono w-8 text-right ${s.bullishPct >= 60 ? 'text-emerald-400' : s.bullishPct <= 40 ? 'text-red-400' : 'text-sentinel-500'}`}>
                                    {s.bullishPct}%
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
