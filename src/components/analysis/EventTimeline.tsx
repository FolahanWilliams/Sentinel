/**
 * EventTimeline — Unified timeline mapping news, filings, and analyst actions
 * against price movements for a specific stock.
 *
 * Renders both DB-stored events AND AI-fetched live events.
 */

import { Clock, AlertCircle, TrendingDown, TrendingUp, Newspaper, FileText, Users, Radio, Globe, Loader2 } from 'lucide-react';
import type { AIEvent } from '@/hooks/useTickerAnalysis';

interface TimelineEvent {
    id: string;
    ticker: string;
    event_type: string;
    headline: string;
    severity: number;
    source_type?: string;
    created_at: string;
}

interface EventTimelineProps {
    events: TimelineEvent[];
    /** AI-fetched events from useTickerAnalysis */
    aiEvents?: AIEvent[];
    aiEventsLoading?: boolean;
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
    earnings: <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />,
    earnings_miss: <TrendingDown className="w-3.5 h-3.5 text-red-400" />,
    filing: <FileText className="w-3.5 h-3.5 text-blue-400" />,
    analyst: <Users className="w-3.5 h-3.5 text-purple-400" />,
    fda_decision: <AlertCircle className="w-3.5 h-3.5 text-amber-400" />,
    analyst_downgrade: <TrendingDown className="w-3.5 h-3.5 text-red-400" />,
    news: <Newspaper className="w-3.5 h-3.5 text-cyan-400" />,
    insider: <Radio className="w-3.5 h-3.5 text-amber-400" />,
    macro: <Globe className="w-3.5 h-3.5 text-indigo-400" />,
    default: <Newspaper className="w-3.5 h-3.5 text-sentinel-400" />,
};

const IMPACT_STYLES = {
    high: { bg: 'bg-red-500/10', text: 'text-red-400', ring: 'ring-red-500/30', label: 'HIGH' },
    medium: { bg: 'bg-amber-500/10', text: 'text-amber-400', ring: 'ring-amber-500/30', label: 'MED' },
    low: { bg: 'bg-sentinel-500/10', text: 'text-sentinel-400', ring: 'ring-sentinel-600/30', label: 'LOW' },
};

export function EventTimeline({ events, aiEvents = [], aiEventsLoading = false }: EventTimelineProps) {
    // Merge DB events + AI events into a unified list
    const mergedEvents = [
        ...aiEvents.map((e, i) => ({
            id: `ai-${i}`,
            date: e.date,
            type: e.type,
            headline: e.headline,
            impact: e.impact,
            priceMove: e.priceMove,
            source: e.source,
            isAI: true,
        })),
        ...events.map(e => ({
            id: e.id,
            date: e.created_at,
            type: e.event_type,
            headline: e.headline,
            impact: (e.severity >= 7 ? 'high' : e.severity >= 4 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
            priceMove: undefined as string | undefined,
            source: e.source_type,
            isAI: false,
        })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const isEmpty = mergedEvents.length === 0 && !aiEventsLoading;

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" /> Event Timeline
                {mergedEvents.length > 0 && (
                    <span className="text-xs font-normal text-sentinel-600">({mergedEvents.length} events)</span>
                )}
            </h3>

            {aiEventsLoading && mergedEvents.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-sentinel-400 py-4 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Fetching recent events...
                </div>
            ) : isEmpty ? (
                <p className="text-sm text-sentinel-500 text-center py-4">No events detected yet.</p>
            ) : (
                <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[15px] top-3 bottom-3 w-px bg-gradient-to-b from-blue-500/50 via-sentinel-700 to-transparent" />

                    <div className="space-y-3">
                        {mergedEvents.map((event) => {
                            const icon = EVENT_ICONS[event.type] || EVENT_ICONS.default;
                            const impactStyle = IMPACT_STYLES[event.impact] || IMPACT_STYLES.low;

                            return (
                                <div key={event.id} className="relative pl-10 group">
                                    {/* Pulse dot */}
                                    <div className={`absolute left-1.5 top-2.5 w-[22px] h-[22px] rounded-full bg-sentinel-900 ring-2 ${impactStyle.ring} flex items-center justify-center transition-all group-hover:scale-110`}>
                                        {icon}
                                    </div>

                                    <div className="bg-sentinel-950/50 rounded-lg border border-sentinel-800/50 p-3 hover:border-sentinel-700/50 transition-colors">
                                        {/* Header row */}
                                        <div className="flex items-center justify-between mb-1.5 gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-xs font-mono text-sentinel-500 capitalize shrink-0">
                                                    {event.type.replace(/_/g, ' ')}
                                                </span>
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${impactStyle.bg} ${impactStyle.text} ring-1 ${impactStyle.ring} shrink-0`}>
                                                    {impactStyle.label}
                                                </span>
                                            </div>
                                            <span className="text-xs text-sentinel-600 shrink-0">
                                                {formatEventDate(event.date)}
                                            </span>
                                        </div>

                                        {/* Headline */}
                                        <p className="text-sm text-sentinel-200 leading-snug">{event.headline}</p>

                                        {/* Price move + source */}
                                        <div className="flex items-center gap-3 mt-2 text-xs text-sentinel-500">
                                            {event.priceMove && (
                                                <span className={`font-mono font-bold ${event.priceMove.startsWith('+') ? 'text-emerald-400' : event.priceMove.startsWith('-') ? 'text-red-400' : 'text-sentinel-400'}`}>
                                                    {event.priceMove}
                                                </span>
                                            )}
                                            {event.source && <span>via {event.source}</span>}
                                            {event.isAI && (
                                                <span className="text-blue-500/60 text-[10px]">AI sourced</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function formatEventDate(dateStr: string): string {
    try {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffDays = Math.floor(diffMs / 86_400_000);

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}
