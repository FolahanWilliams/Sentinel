import type { ProcessedArticle } from '@/types/sentinel';
import type { Position } from '@/hooks/usePortfolio';
import { CATEGORY_COLORS, SENTIMENT_COLORS, IMPACT_STYLES, formatTimeAgo } from '@/utils/sentinel-helpers';
import { ExternalLink, Tag, TrendingUp, TrendingDown, Activity, Radar, Briefcase, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TickerLink } from '@/components/shared/TickerLink';

interface ArticleCardProps {
    article: ProcessedArticle;
    onScanTicker?: (ticker: string) => void;
    portfolioPositions?: Position[];
}

export function ArticleCard({ article, onScanTicker, portfolioPositions }: ArticleCardProps) {
    // Collect unique tickers from signals for the scan action
    const uniqueTickers = article.signals
        ?.filter(s => s.ticker)
        .map(s => s.ticker!.toUpperCase())
        .filter((t, i, arr) => arr.indexOf(t) === i) || [];

    // Portfolio awareness: check if any entity/signal ticker matches an open position
    const matchedPositions = portfolioPositions?.filter(p =>
        article.entities.some(e => e.toUpperCase() === p.ticker.toUpperCase()) ||
        uniqueTickers.includes(p.ticker.toUpperCase())
    ) || [];

    const isPortfolioRelevant = matchedPositions.length > 0;

    // Check for sentiment divergence
    const sentimentConflict = matchedPositions.find(pos => {
        if (article.sentiment === 'neutral') return false;
        return (article.sentiment === 'bearish' && pos.side === 'long') ||
               (article.sentiment === 'bullish' && pos.side === 'short');
    });

    const sentimentAligned = !sentimentConflict && matchedPositions.find(pos => {
        if (article.sentiment === 'neutral') return false;
        return (article.sentiment === 'bullish' && pos.side === 'long') ||
               (article.sentiment === 'bearish' && pos.side === 'short');
    });

    // Determine if an entity looks like a ticker (all caps, 1-5 chars)
    const looksLikeTicker = (entity: string) => /^[A-Z]{1,5}$/.test(entity);

    return (
        <div className={`
            p-5 rounded-xl border bg-sentinel-800/40 backdrop-blur-sm transition-colors hover:bg-sentinel-800/60 glass-refract glass-specular glass-pressable
            ${article.impact === 'high' ? 'border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.05)]' : 'border-sentinel-700/50'}
            ${isPortfolioRelevant ? 'border-l-4 border-l-emerald-500/60' : ''}
        `}>
            {/* Top Metadata Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${CATEGORY_COLORS[article.category] || CATEGORY_COLORS.other}`}>
                        {article.category.replace('_', ' ')}
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${SENTIMENT_COLORS[article.sentiment]}`}>
                        {article.sentiment}
                        {article.sentiment === 'bullish' && ' +'}
                        {article.sentiment === 'bearish' && ' -'}
                        {Math.abs(article.sentiment_score).toFixed(2)}
                    </span>
                    {article.impact === 'high' && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
                            HIGH IMPACT
                        </span>
                    )}
                    {isPortfolioRelevant && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <Briefcase className="w-3 h-3" />
                            In Portfolio
                        </span>
                    )}
                </div>

                <div className="flex items-center text-xs text-sentinel-500 space-x-3 font-mono">
                    <span>{article.source}</span>
                    <span>&bull;</span>
                    <span>{formatTimeAgo(article.pub_date)}</span>
                </div>
            </div>

            {/* Sentiment Conflict/Alignment Warning */}
            {sentimentConflict && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Sentiment conflicts with your <strong>{sentimentConflict.side.toUpperCase()}</strong> position in {sentimentConflict.ticker}</span>
                </div>
            )}
            {sentimentAligned && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>Aligns with your <strong>{sentimentAligned.side.toUpperCase()}</strong> position in {sentimentAligned.ticker}</span>
                </div>
            )}

            {/* Core Content */}
            <div className={`mb-4 pl-3 ${IMPACT_STYLES[article.impact]}`}>
                <h3 className="text-lg font-semibold text-sentinel-100 mb-2 leading-snug">
                    {article.title}
                </h3>
                <p className="text-sm text-sentinel-300 leading-relaxed">
                    {article.summary}
                </p>
            </div>

            {/* Bottom Row: Entities & Signals & Link */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mt-4 pt-4 border-t border-sentinel-700/30">

                <div className="flex-1 space-y-3">
                    {/* Entities — ticker-like entities are clickable TickerLinks */}
                    {article.entities && article.entities.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1.5">
                            <Tag className="h-3 w-3 text-sentinel-500 mr-1" />
                            {article.entities.map((entity, i) => (
                                looksLikeTicker(entity) ? (
                                    <TickerLink key={i} ticker={entity} />
                                ) : (
                                    <span key={i} className="text-xs text-sentinel-400 bg-sentinel-900/50 px-2 py-0.5 rounded border border-sentinel-700/50">
                                        {entity}
                                    </span>
                                )
                            ))}
                        </div>
                    )}

                    {/* Extracted Trading Signals */}
                    {article.signals && article.signals.length > 0 && (
                        <div className="flex flex-col gap-2">
                            {article.signals.map((signal, i) => (
                                <div key={i} className="flex items-start sm:items-center gap-2 p-2 rounded-lg bg-sentinel-900/40 border border-sentinel-700/40">

                                    <div className={`shrink-0 flex items-center justify-center h-6 w-6 rounded-md
                                        ${signal.direction === 'up' ? 'bg-emerald-500/20 text-emerald-400' :
                                            signal.direction === 'down' ? 'bg-red-500/20 text-red-400' :
                                                'bg-amber-500/20 text-amber-400'}`}
                                    >
                                        {signal.direction === 'up' && <TrendingUp className="h-3.5 w-3.5" />}
                                        {signal.direction === 'down' && <TrendingDown className="h-3.5 w-3.5" />}
                                        {signal.direction === 'volatile' && <Activity className="h-3.5 w-3.5" />}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs flex-1">
                                        {signal.ticker && (
                                            <TickerLink ticker={signal.ticker.toUpperCase()} />
                                        )}
                                        <span className="text-sentinel-400 font-medium uppercase tracking-wider text-[10px]">
                                            {signal.type.replace('_', ' ')}
                                        </span>
                                        <span className="text-sentinel-300 hidden sm:inline">&bull;</span>
                                        <span className="text-sentinel-300">{signal.note}</span>
                                        <span className="text-sentinel-500 font-mono ml-auto sm:ml-2 text-[10px]">
                                            {Math.round(signal.confidence * 100)}% conf
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="shrink-0 flex flex-col gap-2">
                    {/* Scan Ticker Buttons */}
                    {onScanTicker && uniqueTickers.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-end">
                            {uniqueTickers.map(t => (
                                <button
                                    key={t}
                                    onClick={() => onScanTicker(t)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/15 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium rounded-lg border border-indigo-500/25 transition-colors cursor-pointer"
                                    title={`Scan ${t}`}
                                >
                                    <Radar className="h-3 w-3" />
                                    Scan ${t}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Read Source */}
                    <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-sentinel-700/30 hover:bg-sentinel-700/60 text-sentinel-200 text-sm font-medium rounded-lg border border-sentinel-700/50 transition-colors"
                    >
                        Read Source
                        <ExternalLink className="h-4 w-4" />
                    </a>
                </div>

            </div>
        </div>
    );
}
