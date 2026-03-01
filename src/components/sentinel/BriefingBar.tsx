/**
 * Sentinel — BriefingBar (Spec §7.2)
 *
 * Sticky bar at top showing market mood, top stories, and signal counter.
 */

import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { DailyBriefing } from '@/types/sentinel';

interface BriefingBarProps {
    briefing: DailyBriefing;
}

const MOOD_CONFIG = {
    'risk-on': { label: 'Risk-On', color: '#22C55E', bg: '#22C55E22' },
    'risk-off': { label: 'Risk-Off', color: '#EF4444', bg: '#EF444422' },
    'mixed': { label: 'Mixed', color: '#F59E0B', bg: '#F59E0B22' },
} as const;

export function BriefingBar({ briefing }: BriefingBarProps) {
    const [expanded, setExpanded] = useState(false);
    const mood = MOOD_CONFIG[briefing.marketMood] || MOOD_CONFIG.mixed;

    return (
        <div
            className="card"
            style={{
                padding: 'var(--spacing-md) var(--spacing-lg)',
                position: 'sticky',
                top: 0,
                zIndex: 10,
                backdropFilter: 'blur(12px)',
                backgroundColor: 'var(--color-bg-surface)',
            }}
        >
            <div className="flex items-center gap-4 flex-wrap">
                {/* Market Mood Badge */}
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 12px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: mood.bg,
                        color: mood.color,
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {briefing.marketMood === 'risk-on' && <TrendingUp size={14} />}
                    {briefing.marketMood === 'risk-off' && <TrendingDown size={14} />}
                    {briefing.marketMood === 'mixed' && <Minus size={14} />}
                    {mood.label}
                </span>

                {/* Top Stories (center) */}
                <div className="flex-1 min-w-0">
                    {briefing.topStories.length > 0 && (
                        <p
                            className="text-sm truncate"
                            style={{ color: 'var(--color-text-primary)', margin: 0 }}
                            title={briefing.topStories[0]}
                        >
                            {briefing.topStories[0]}
                        </p>
                    )}
                </div>

                {/* Signal Counter (right) */}
                <div className="flex items-center gap-3 text-xs font-mono" style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ color: '#22C55E' }}>🟢 {briefing.signalCount.bullish}</span>
                    <span style={{ color: '#EF4444' }}>🔴 {briefing.signalCount.bearish}</span>
                    <span style={{ color: '#6B7280' }}>⚪ {briefing.signalCount.neutral}</span>
                </div>

                {/* Expand toggle */}
                <button
                    onClick={() => setExpanded(!expanded)}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)',
                        padding: 4,
                    }}
                >
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
            </div>

            {/* Expanded content */}
            {expanded && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
                    {/* All top stories */}
                    {briefing.topStories.length > 1 && (
                        <div className="mb-3">
                            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Stories</h4>
                            <ul className="space-y-1" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {briefing.topStories.map((story, i) => (
                                    <li key={i} className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                        • {story}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Trending Topics */}
                    {briefing.trendingTopics.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trending</h4>
                            <div className="flex flex-wrap gap-2">
                                {briefing.trendingTopics.map((topic, i) => (
                                    <span
                                        key={i}
                                        className="text-xs"
                                        style={{
                                            padding: '2px 10px',
                                            borderRadius: 'var(--radius-full)',
                                            backgroundColor: 'var(--color-bg-elevated)',
                                            color: 'var(--color-text-secondary)',
                                            border: '1px solid var(--color-border-subtle)',
                                        }}
                                    >
                                        {topic}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
