import { ArrowUpRight } from 'lucide-react';
import { useUpcomingEvents } from '@/hooks/useUpcomingEvents';

export function UpcomingEvents() {
    const { data, loading } = useUpcomingEvents();

    return (
        <div className="card-elevated">
            <div className="flex justify-between items-start mb-4">
                <h2 className="text-sm font-bold text-sentinel-100 uppercase tracking-wider">Upcoming Events</h2>
                <ArrowUpRight className="w-4 h-4 text-sentinel-400" />
            </div>

            {loading ? (
                <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-sentinel-800 rounded w-20"></div>
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-5 bg-sentinel-800 rounded w-full"></div>
                    ))}
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        {[1, 2].map(i => (
                            <div key={i} className="space-y-2">
                                <div className="h-4 bg-sentinel-800 rounded w-20"></div>
                                {[1, 2, 3].map(j => (
                                    <div key={j} className="h-4 bg-sentinel-800 rounded w-full"></div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            ) : !data || (data.notable.length === 0 && data.earnings.length === 0 && data.economic.length === 0) ? (
                <div className="text-center py-6 text-sentinel-400 text-sm">
                    No upcoming events found.
                </div>
            ) : (
                <>
                    {/* Notable Events */}
                    {data.notable.length > 0 && (
                        <div className="mb-4">
                            <h3 className="text-xs font-bold text-sentinel-200 uppercase tracking-widest mb-3">Notable</h3>
                            <div className="space-y-2.5">
                                {data.notable.map((event, i) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0"></span>
                                        <div className="text-sm text-sentinel-300">
                                            <span className="text-sentinel-400">{event.date}: </span>
                                            {event.text}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Earnings & Economic */}
                    <div className="grid grid-cols-2 gap-4">
                        {data.earnings.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-sentinel-200 uppercase tracking-widest mb-3">Earnings</h3>
                                <div className="space-y-3">
                                    {data.earnings.map((entry, i) => (
                                        <div key={i}>
                                            <div className="text-xs text-sentinel-400 mb-1.5 flex items-center gap-1.5">
                                                <span className="w-1 h-1 rounded-full bg-sentinel-500"></span>
                                                {entry.date}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {entry.tickers.slice(0, 3).map((ticker, j) => (
                                                    <span key={j} className="px-2 py-0.5 bg-sentinel-800 text-sentinel-200 text-xs font-bold rounded ring-1 ring-sentinel-700">
                                                        {ticker}
                                                    </span>
                                                ))}
                                                {entry.tickers.length > 3 && (
                                                    <span className="px-2 py-0.5 bg-sentinel-800/50 text-sentinel-400 text-xs rounded">
                                                        +{entry.tickers.length - 3}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {data.economic.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-sentinel-200 uppercase tracking-widest mb-3">Economic</h3>
                                <div className="space-y-3">
                                    {data.economic.map((entry, i) => (
                                        <div key={i}>
                                            <div className="text-xs text-sentinel-400 mb-1 flex items-center gap-1.5">
                                                <span className="w-1 h-1 rounded-full bg-sentinel-500"></span>
                                                {entry.date}
                                            </div>
                                            <div className={`text-sm ${entry.importance === 'high' ? 'font-bold text-sentinel-100' : 'text-sentinel-300'}`}>
                                                {entry.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
