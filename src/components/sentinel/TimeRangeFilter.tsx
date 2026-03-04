import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';

export type TimeRange = '1h' | '6h' | '24h' | '7d' | 'all';

interface TimeRangeFilterProps {
    activeRange: TimeRange;
    setActiveRange: (range: TimeRange) => void;
}

const RANGES: { value: TimeRange; label: string }[] = [
    { value: '1h', label: '1H' },
    { value: '6h', label: '6H' },
    { value: '24h', label: '24H' },
    { value: '7d', label: '7D' },
    { value: 'all', label: 'All' },
];

export function TimeRangeFilter({ activeRange, setActiveRange }: TimeRangeFilterProps) {
    return (
        <div className="flex items-center gap-1 bg-sentinel-900/60 rounded-lg border border-sentinel-700/50 p-1">
            <Clock className="h-3.5 w-3.5 text-sentinel-500 ml-1.5 mr-0.5 shrink-0" />
            {RANGES.map(({ value, label }) => {
                const isActive = activeRange === value;
                return (
                    <motion.button
                        key={value}
                        onClick={() => setActiveRange(value)}
                        whileTap={{ scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                        className={`relative px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                            isActive
                                ? 'text-sentinel-100 bg-sentinel-700/60 border border-sentinel-600/50 shadow-sm'
                                : 'text-sentinel-400 hover:text-sentinel-300 hover:bg-sentinel-800/50 border border-transparent'
                        }`}
                    >
                        {label}
                    </motion.button>
                );
            })}
        </div>
    );
}

/** Returns the cutoff Date for a given time range */
export function getTimeRangeCutoff(range: TimeRange): Date | null {
    if (range === 'all') return null;

    const now = new Date();
    const ms: Record<Exclude<TimeRange, 'all'>, number> = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
    };

    return new Date(now.getTime() - ms[range]);
}
