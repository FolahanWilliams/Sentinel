import { History, BarChart3, TrendingUp, AlertCircle } from 'lucide-react';

export function Backtest() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <History className="w-8 h-8 text-purple-400" /> Backtest Engine
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Historical verification of agent accuracy. Coming in v2.
                    </p>
                </div>
            </div>

            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm p-12 text-center relative">

                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-sentinel-950 pointer-events-none"></div>

                <div className="relative z-10 max-w-lg mx-auto space-y-6">
                    <div className="flex justify-center mb-6">
                        <div className="p-4 bg-sentinel-800/50 rounded-full ring-1 ring-sentinel-700">
                            <BarChart3 className="w-12 h-12 text-sentinel-500" />
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-sentinel-200">Historical Scanner Offline</h2>
                    <p className="text-sentinel-400 leading-relaxed">
                        The Backtest Engine requires a massive historical tick-data database (1TB+) which is not currently provisioned for this environment.
                    </p>
                    <p className="text-sm text-sentinel-500">
                        Live forward-testing is active via the Outcome Tracker (1d, 5d, 10d, 30d logs) in the Journal section.
                    </p>

                    <div className="pt-6 border-t border-sentinel-800/50 grid grid-cols-2 gap-4 text-left">
                        <div className="p-4 bg-sentinel-950/50 rounded-lg border border-sentinel-800/50">
                            <TrendingUp className="w-5 h-5 text-emerald-500 mb-2" />
                            <div className="text-sentinel-100 font-bold mb-1">Forward Testing</div>
                            <div className="text-xs text-sentinel-500">Currently logging real-time results to Outcome Tracker for 30-day edge verification.</div>
                        </div>
                        <div className="p-4 bg-sentinel-950/50 rounded-lg border border-sentinel-800/50">
                            <AlertCircle className="w-5 h-5 text-amber-500 mb-2" />
                            <div className="text-sentinel-100 font-bold mb-1">Data Requirements</div>
                            <div className="text-xs text-sentinel-500">Needs Polygon.io enterprise tier for full historical options data to reconstruct past environments.</div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
