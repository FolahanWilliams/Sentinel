import { LayoutDashboard } from 'lucide-react';

export function SentinelSkeleton() {
    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] animate-pulse">

            {/* Briefing Bar Skeleton */}
            <div className="mb-6 shrink-0 bg-sentinel-800/20 border border-sentinel-700/30 rounded-xl h-40 flex items-center justify-center">
                <div className="flex flex-col items-center text-sentinel-600">
                    <LayoutDashboard className="h-8 w-8 mb-4 opacity-50" />
                    <span className="font-mono text-sm tracking-widest uppercase">Initializing Intelligence Feed...</span>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 gap-6">

                {/* Left Column Skeleton */}
                <div className="flex-1 flex flex-col min-w-0">
                    {/* Filter Bar */}
                    <div className="mb-4 shrink-0 h-24 bg-sentinel-800/20 border border-sentinel-700/30 rounded-xl" />

                    {/* Article Cards */}
                    <div className="flex-1 overflow-hidden space-y-4 pr-2">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-48 bg-sentinel-800/10 border border-sentinel-700/20 rounded-xl p-5">
                                <div className="h-4 w-1/4 bg-sentinel-700/20 rounded mb-4" />
                                <div className="h-6 w-3/4 bg-sentinel-700/30 rounded mb-3" />
                                <div className="h-4 w-full bg-sentinel-700/10 rounded mb-2" />
                                <div className="h-4 w-2/3 bg-sentinel-700/10 rounded" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right Column Skeleton */}
                <div className="w-80 shrink-0 hidden lg:block h-full bg-sentinel-800/10 border border-sentinel-700/20 rounded-xl p-4">
                    <div className="h-6 w-1/2 bg-sentinel-700/30 rounded mb-6" />
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-24 bg-sentinel-700/10 rounded-lg mb-4" />
                    ))}
                </div>
            </div>
        </div>
    );
}
