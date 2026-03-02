import React from 'react';
import { Activity, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { useScannerLogs } from '@/hooks/useScannerLogs';

export const ScanActivity: React.FC = () => {
    const { logs, loading } = useScannerLogs(5); // Get last 5 logs for activity feed

    if (loading) {
        return (
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6 h-full flex items-center justify-center">
                <Activity className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6 h-full">
                <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
                <div className="text-gray-500 text-center py-8">No scan activity found.</div>
            </div>
        );
    }

    return (
        <div className="bg-[#111] border border-gray-800 rounded-xl p-6 h-full">
            <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>

            <div className="space-y-4">
                {logs.map((log) => {
                    const isSuccess = log.status === 'completed';
                    const isRunning = log.status === 'running';
                    const Icon = isSuccess ? CheckCircle : isRunning ? Activity : AlertTriangle;
                    const iconColor = isSuccess ? 'text-green-500' : isRunning ? 'text-blue-500' : 'text-red-500';

                    return (
                        <div key={log.id} className="flex items-start bg-[#1a1a1a] p-3 rounded-lg border border-gray-800">
                            <div className={`mt-0.5 mr-3 ${iconColor}`}>
                                <Icon className={`w-5 h-5 ${isRunning ? 'animate-pulse' : ''}`} />
                            </div>
                            <div className="flex-1">
                                <div className="flex justify-between items-start">
                                    <span className="text-white font-medium capitalize">
                                        {log.scan_type} Scan
                                    </span>
                                    <span className="text-xs text-gray-500 flex items-center">
                                        <Clock className="w-3 h-3 mr-1" />
                                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                {isRunning ? (
                                    <div className="text-sm text-blue-400 mt-1 flex items-center">
                                        Scan in progress...
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-400 mt-1">
                                        {isSuccess ? (
                                            <>
                                                Generated <span className="text-white font-medium">{log.signals_generated}</span> signals
                                                from <span className="text-white font-medium">{log.tickers_scanned}</span> tickers in {(log.duration_ms / 1000).toFixed(1)}s.
                                            </>
                                        ) : (
                                            <span className="text-red-400">Failed: {log.error_message || 'Unknown error'}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
