import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useMarketTrends } from '@/hooks/useMarketTrends';
import { usePotentialSignals } from '@/hooks/usePotentialSignals';
import { motion } from 'framer-motion';

export function MarketTrends() {
    const { data, loading } = useMarketTrends();

    const directionIcon = (dir: string) => {
        if (dir === 'up') return <TrendingUp className="w-3.5 h-3.5 text-emerald-400 mr-1.5 flex-shrink-0" />;
        if (dir === 'down') return <TrendingDown className="w-3.5 h-3.5 text-red-400 mr-1.5 flex-shrink-0" />;
        return <Minus className="w-3.5 h-3.5 text-sentinel-400 mr-1.5 flex-shrink-0" />;
    };

    return (
        <div className="glass-panel">
            <div className="flex justify-between items-start mb-4">
                <h2 className="text-sm font-bold text-sentinel-100 uppercase tracking-wider">Market Trends</h2>
                <ArrowUpRight className="w-4 h-4 text-sentinel-400" />
            </div>

            {loading ? (
                <div className="grid grid-cols-2 gap-4 animate-pulse">
                    {[1, 2].map(i => (
                        <div key={i} className="bg-sentinel-800/30 rounded-lg p-4 space-y-3">
                            <div className="h-4 bg-sentinel-800 rounded w-20"></div>
                            {[1, 2, 3].map(j => <div key={j} className="h-4 bg-sentinel-800 rounded w-full"></div>)}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-4">
                    <motion.div
                        className="bg-sentinel-800/30 rounded-lg p-4"
                        whileHover={{ y: -2, backgroundColor: "rgba(31, 34, 51, 0.4)" }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-semibold text-sentinel-100">Mid-Term</h3>
                            <span className="text-xs text-sentinel-400">1-3 mo</span>
                        </div>
                        <div className="space-y-2.5">
                            {(data?.midTerm || []).map((trend, i) => (
                                <div key={i} className="flex items-center text-sm text-sentinel-200">
                                    {directionIcon(trend.direction)}
                                    <span>{trend.text}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    <motion.div
                        className="bg-sentinel-800/30 rounded-lg p-4"
                        whileHover={{ y: -2, backgroundColor: "rgba(31, 34, 51, 0.4)" }}
                        transition={{ duration: 0.2 }}
                    >
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-sm font-semibold text-sentinel-100">Long-Term</h3>
                            <span className="text-xs text-sentinel-400">6-12 mo</span>
                        </div>
                        <div className="space-y-2.5">
                            {(data?.longTerm || []).map((trend, i) => (
                                <div key={i} className="flex items-center text-sm text-sentinel-200">
                                    {directionIcon(trend.direction)}
                                    <span>{trend.text}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}

export function PotentialSignals() {
    const { signals, loading } = usePotentialSignals();

    return (
        <div className="glass-panel">
            <div className="flex justify-between items-start mb-4">
                <h2 className="text-sm font-bold text-sentinel-100 uppercase tracking-wider">Potential Early Signals</h2>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-pulse">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="bg-sentinel-800/30 rounded-lg p-3 space-y-2">
                            <div className="h-3 bg-sentinel-800 rounded w-16"></div>
                            <div className="h-6 bg-sentinel-800 rounded w-12"></div>
                            <div className="h-3 bg-sentinel-800 rounded w-20"></div>
                        </div>
                    ))}
                </div>
            ) : signals.length === 0 ? (
                <div className="text-center py-6 text-sentinel-400 text-sm">
                    No signals detected yet. The scanner is watching.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {signals.map((signal, i) => (
                        <motion.div
                            key={i}
                            className="bg-sentinel-800/30 rounded-lg p-3 hover:bg-sentinel-800/50 transition-colors cursor-pointer relative group"
                            whileHover={{ y: -2, backgroundColor: "rgba(31, 34, 51, 0.4)" }}
                            transition={{ duration: 0.2 }}
                        >
                            <ArrowUpRight className="w-3 h-3 text-sentinel-500 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="text-sm font-semibold text-sentinel-100">{signal.source}</div>
                            <div className="text-xs text-sentinel-400 mb-2">{signal.sourceLabel}</div>
                            <div className="text-lg font-bold text-sentinel-50">{signal.ticker}</div>
                            <div className="flex items-baseline gap-2 mt-1">
                                <span className={`text-xs font-bold ${signal.actionColor}`}>{signal.action}</span>
                                <span className="text-xs text-sentinel-300">{signal.detail}</span>
                            </div>
                            <div className="text-xs text-sentinel-500 mt-1">{signal.meta}</div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}
