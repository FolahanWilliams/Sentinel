/**
 * Sentinel — ArticleCard (Spec §7.3)
 *
 * Individual article card with sentiment/category/impact badges,
 * AI summary, trading signals, entities, and external link.
 */

import { ExternalLink } from 'lucide-react';
import type { ProcessedArticle, TickerRelationship } from '@/types/sentinel';
import { ARTICLE_CATEGORY_COLORS, ARTICLE_CATEGORY_LABELS, SENTIMENT_COLORS, timeAgo } from '@/utils/sentinelHelpers';
import type { ArticleCategory } from '@/types/sentinel';

const RELATIONSHIP_LABELS: Record<TickerRelationship, string> = {
    direct: 'Direct',
    sector_contagion: 'Contagion',
    supply_chain: 'Supply Chain',
    competitor: 'Competitor',
};

const RELATIONSHIP_COLORS: Record<TickerRelationship, string> = {
    direct: '#3B82F6',
    sector_contagion: '#F59E0B',
    supply_chain: '#8B5CF6',
    competitor: '#EC4899',
};

interface ArticleCardProps {
    article: ProcessedArticle;
}

const IMPACT_STYLES = {
    high: { color: '#F59E0B', fontWeight: 700, borderColor: '#F59E0B' },
    medium: { color: '#F97316', fontWeight: 500, borderColor: 'transparent' },
    low: { color: 'var(--color-text-muted)', fontWeight: 400, borderColor: 'transparent' },
} as const;

const DIRECTION_ARROWS: Record<string, string> = { up: '↑', down: '↓', volatile: '↕' };

export function ArticleCard({ article }: ArticleCardProps) {
    const impactStyle = IMPACT_STYLES[article.impact];
    const sentimentColor = SENTIMENT_COLORS[article.sentiment];
    const categoryColor = ARTICLE_CATEGORY_COLORS[article.category as ArticleCategory] || '#6B7280';
    const categoryLabel = ARTICLE_CATEGORY_LABELS[article.category as ArticleCategory] || article.category;

    return (
        <div
            className="card animate-fade-in"
            style={{
                padding: 'var(--spacing-lg)',
                borderLeft: article.impact === 'high' ? '3px solid #F59E0B' : undefined,
                transition: 'border-color 0.2s, transform 0.15s',
            }}
        >
            {/* Badges row */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Sentiment badge */}
                <span
                    className="text-xs font-semibold"
                    style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: `${sentimentColor}22`,
                        color: sentimentColor,
                    }}
                >
                    {article.sentiment === 'bullish' ? '🟢' : article.sentiment === 'bearish' ? '🔴' : '⚪'} {article.sentiment.toUpperCase()}
                </span>

                {/* Category badge */}
                <span
                    className="text-xs font-medium"
                    style={{
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: `${categoryColor}22`,
                        color: categoryColor,
                    }}
                >
                    {categoryLabel}
                </span>

                {/* Impact indicator */}
                <span className="text-xs" style={{ color: impactStyle.color, fontWeight: impactStyle.fontWeight }}>
                    {article.impact === 'high' ? '★ HIGH' : article.impact === 'medium' ? '★ MED' : '★ LOW'}
                </span>
            </div>

            {/* Title */}
            <h3
                className="text-sm font-semibold mb-1"
                style={{ color: 'var(--color-text-primary)', margin: 0, lineHeight: 1.4 }}
            >
                {article.title}
            </h3>

            {/* Source + time ago */}
            <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)', margin: '4px 0 8px' }}>
                {article.source} · {timeAgo(article.pubDate)}
            </p>

            {/* Summary */}
            <p className="text-sm mb-3" style={{ color: 'var(--color-text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
                {article.summary}
            </p>

            {/* Trading Signals */}
            {article.signals.length > 0 && (
                <div className="mb-3" style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-subtle)',
                }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
                        📊 Signals
                    </p>
                    {article.signals.map((sig, i) => (
                        <div key={i} className="text-xs flex items-center gap-2 mb-1"
                            style={{ color: sig.direction === 'up' ? '#22C55E' : sig.direction === 'down' ? '#EF4444' : '#F59E0B' }}
                        >
                            <span className="font-mono font-semibold">{sig.ticker || '—'}</span>
                            <span>{DIRECTION_ARROWS[sig.direction || 'volatile']}</span>
                            <span style={{ color: 'var(--color-text-secondary)' }}>{sig.note}</span>
                            <span className="font-mono" style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                                ({(sig.confidence * 100).toFixed(0)}%)
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Affected Tickers */}
            {article.affectedTickers && article.affectedTickers.length > 0 && (
                <div className="mb-3" style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border-subtle)',
                }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)', margin: '0 0 6px' }}>
                        Affected Stocks
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {article.affectedTickers.map((at, i) => {
                            const relColor = RELATIONSHIP_COLORS[at.relationship] || '#6B7280';
                            const dirColor = at.direction === 'up' ? '#22C55E' : at.direction === 'down' ? '#EF4444' : '#F59E0B';
                            return (
                                <div
                                    key={i}
                                    className="flex items-center gap-1 text-xs"
                                    style={{
                                        padding: '2px 8px',
                                        borderRadius: 'var(--radius-sm)',
                                        backgroundColor: `${relColor}15`,
                                        border: `1px solid ${relColor}40`,
                                    }}
                                >
                                    <span className="font-mono font-bold" style={{ color: dirColor }}>
                                        {DIRECTION_ARROWS[at.direction] || '↕'} {at.ticker}
                                    </span>
                                    <span style={{ color: relColor, fontSize: '0.65rem', fontWeight: 600 }}>
                                        {RELATIONSHIP_LABELS[at.relationship]}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Entities + Open link */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                {article.entities.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                        {article.entities.slice(0, 6).map((entity, i) => (
                            <span
                                key={i}
                                className="text-xs font-mono"
                                style={{
                                    padding: '1px 6px',
                                    borderRadius: 'var(--radius-sm)',
                                    backgroundColor: 'var(--color-bg-hover)',
                                    color: 'var(--color-text-secondary)',
                                }}
                            >
                                {entity}
                            </span>
                        ))}
                    </div>
                )}

                <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium flex items-center gap-1"
                    style={{
                        color: 'var(--color-info)',
                        textDecoration: 'none',
                        marginLeft: 'auto',
                    }}
                >
                    Open <ExternalLink size={12} />
                </a>
            </div>
        </div>
    );
}
