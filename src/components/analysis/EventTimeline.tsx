/**
 * EventTimeline — Chronological view of detected events leading to a signal.
 */

import { Clock, AlertCircle, TrendingDown, Newspaper } from 'lucide-react';

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
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
    earnings_miss: <TrendingDown className="w-4 h-4 text-red-400" />,
    fda_decision: <AlertCircle className="w-4 h-4 text-amber-400" />,
    analyst_downgrade: <TrendingDown className="w-4 h-4 text-red-400" />,
    default: <Newspaper className="w-4 h-4 text-blue-400" />,
};

export function EventTimeline({ events }: EventTimelineProps) {
    if (events.length === 0) {
        return (
            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-blue-400" /> Event Timeline
                </h3>
                <p className="text-sm text-sentinel-500 text-center py-4">No events detected yet.</p>
            </div>
        );
    }

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" /> Event Timeline
            </h3>

            <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-4 top-2 bottom-2 w-px bg-sentinel-700" />

                <div className="space-y-4">
                    {events.map((event, idx) => {
                        const icon = EVENT_ICONS[event.event_type] || EVENT_ICONS.default;
                        const severityColor = event.severity >= 8 ? 'ring-red-500/30' : event.severity >= 5 ? 'ring-amber-500/30' : 'ring-sentinel-700';

                        return (
                            <div key={event.id || idx} className="relative pl-10">
                                {/* Dot */}
                                <div className={`absolute left-2 top-1 w-5 h-5 rounded-full bg-sentinel-900 ring-2 ${severityColor} flex items-center justify-center`}>
                                    {icon}
                                </div>

                                <div className="bg-sentinel-950/50 rounded-lg border border-sentinel-800/50 p-3">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-mono text-sentinel-500 capitalize">
                                            {event.event_type.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-xs text-sentinel-600">
                                            {new Date(event.created_at).toLocaleString()}
                                        </span>
                                    </div>
                                    <p className="text-sm text-sentinel-200">{event.headline}</p>
                                    <div className="flex items-center gap-3 mt-2 text-xs text-sentinel-500">
                                        <span>Severity: <strong className={event.severity >= 7 ? 'text-red-400' : 'text-sentinel-300'}>{event.severity}/10</strong></span>
                                        {event.source_type && <span>Source: {event.source_type}</span>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
