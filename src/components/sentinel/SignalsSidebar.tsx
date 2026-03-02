/**
 * Sentinel — SignalsSidebar (Spec §7.6)
 *
 * Aggregates trading signals from all articles by ticker.
 * Shows directional arrows and mention counts.
 */

import type { ProcessedArticle, TickerRelationship } from '@/types/sentinel';

interface SignalsSidebarProps {
    articles: ProcessedArticle[];
}

interface AggregatedSignal {
    ticker: string;
    bullish: number;
    bearish: number;
    volatile: number;
    totalMentions: number;
    signals: Array<{ note: string; direction: string; confidence: number }>;
    relationships: Set<TickerRelationship>;
}

const RELATIONSHIP_BADGE: Record<TickerRelationship, { label: string; color: string }> = {
    direct: { label: 'D', color: '#3B82F6' },
    sector_contagion: { label: 'C', color: '#F59E0B' },
    supply_chain: { label: 'SC', color: '#8B5CF6' },
    competitor: { label: 'X', color: '#EC4899' },
};

export function SignalsSidebar({ articles }: SignalsSidebarProps) {
    // Aggregate signals by ticker from both signals[] and affectedTickers[]
    const tickerMap = new Map<string, AggregatedSignal>();

    for (const article of articles) {
        // From explicit trading signals
        for (const signal of article.signals) {
            if (!signal.ticker) continue;
            const existing = tickerMap.get(signal.ticker) || {
                ticker: signal.ticker,
                bullish: 0,
                bearish: 0,
                volatile: 0,
                totalMentions: 0,
                signals: [],
                relationships: new Set<TickerRelationship>(),
            };

            existing.totalMentions++;
            if (signal.direction === 'up') existing.bullish++;
            else if (signal.direction === 'down') existing.bearish++;
            else existing.volatile++;

            existing.signals.push({
                note: signal.note,
                direction: signal.direction || 'volatile',
                confidence: signal.confidence,
            });
            existing.relationships.add('direct');

            tickerMap.set(signal.ticker, existing);
        }

        // From affected tickers (contagion / supply chain / competitor)
        if (article.affectedTickers) {
            for (const at of article.affectedTickers) {
                const existing = tickerMap.get(at.ticker) || {
                    ticker: at.ticker,
                    bullish: 0,
                    bearish: 0,
                    volatile: 0,
                    totalMentions: 0,
                    signals: [],
                    relationships: new Set<TickerRelationship>(),
                };

                existing.totalMentions++;
                if (at.direction === 'up') existing.bullish++;
                else if (at.direction === 'down') existing.bearish++;
                else existing.volatile++;

                existing.relationships.add(at.relationship);

                tickerMap.set(at.ticker, existing);
            }
        }
    }

    // Sort by total mentions descending
    const sorted = Array.from(tickerMap.values()).sort((a, b) => b.totalMentions - a.totalMentions);

    if (sorted.length === 0) {
        return (
            <div
                className="card text-center"
                style={{ padding: 'var(--spacing-lg)', color: 'var(--color-text-muted)' }}
            >
                <p className="text-sm">No trading signals detected</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <h3
                className="text-xs font-semibold mb-3"
                style={{
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                }}
            >
                📊 Signal Aggregation
            </h3>

            {sorted.slice(0, 15).map(agg => {
                const netDirection = agg.bullish > agg.bearish ? 'up' : agg.bearish > agg.bullish ? 'down' : 'mixed';
                const arrowColor = netDirection === 'up' ? '#22C55E' : netDirection === 'down' ? '#EF4444' : '#F59E0B';

                return (
                    <div
                        key={agg.ticker}
                        className="card"
                        style={{
                            padding: '10px 14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            borderLeft: `3px solid ${arrowColor}`,
                        }}
                    >
                        {/* Ticker */}
                        <span className="font-mono font-bold text-sm" style={{ color: 'var(--color-text-primary)', minWidth: 56 }}>
                            {agg.ticker}
                        </span>

                        {/* Direction arrow */}
                        <span style={{ color: arrowColor, fontSize: '1.1rem', lineHeight: 1 }}>
                            {netDirection === 'up' ? '↑' : netDirection === 'down' ? '↓' : '↕'}
                        </span>

                        {/* Mention count */}
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
                            {agg.totalMentions} mention{agg.totalMentions !== 1 ? 's' : ''}
                        </span>

                        {/* Relationship badges */}
                        <div className="flex gap-1">
                            {Array.from(agg.relationships).map(rel => {
                                const badge = RELATIONSHIP_BADGE[rel];
                                return (
                                    <span
                                        key={rel}
                                        className="text-xs font-bold"
                                        title={rel.replace('_', ' ')}
                                        style={{
                                            padding: '0 4px',
                                            borderRadius: '3px',
                                            backgroundColor: `${badge.color}25`,
                                            color: badge.color,
                                            fontSize: '0.6rem',
                                            lineHeight: '1.4',
                                        }}
                                    >
                                        {badge.label}
                                    </span>
                                );
                            })}
                        </div>

                        {/* Bull/Bear breakdown */}
                        <div className="flex gap-1 text-xs font-mono">
                            {agg.bullish > 0 && <span style={{ color: '#22C55E' }}>+{agg.bullish}</span>}
                            {agg.bearish > 0 && <span style={{ color: '#EF4444' }}>-{agg.bearish}</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
