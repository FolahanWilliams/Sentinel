import React from 'react';
import { useScannerLogs } from '@/hooks/useScannerLogs';
import { Clock, Activity, AlertTriangle, CheckCircle, Database } from 'lucide-react';

export const ScanLogsTable: React.FC = () => {
    const { logs, loading } = useScannerLogs(20);

    const formatDuration = (ms: number) => {
        if (!ms) return '-';
        return `${(ms / 1000).toFixed(1)}s`;
    };

    if (loading && logs.length === 0) {
        return (
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6 flex items-center justify-center min-h-[300px]">
                <Activity className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="bg-[#111] border border-gray-800 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white flex items-center">
                    <Database className="w-5 h-5 mr-2 text-indigo-400" />
                    Scan History
                </h2>
                <div className="text-sm text-gray-500 flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    Latest 20 scans
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="text-xs uppercase bg-[#1a1a1a] text-gray-400 border-b border-gray-800">
                        <tr>
                            <th className="px-6 py-4 font-medium">Time</th>
                            <th className="px-6 py-4 font-medium">Type</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium">Tickers</th>
                            <th className="px-6 py-4 font-medium">Events</th>
                            <th className="px-6 py-4 font-medium">Signals</th>
                            <th className="px-6 py-4 font-medium">Duration</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logs.map((log) => {
                            const isSuccess = log.status === 'completed';
                            const isRunning = log.status === 'running';
                            const StatusIcon = isSuccess ? CheckCircle : isRunning ? Activity : AlertTriangle;
                            const statusColor = isSuccess ? 'text-green-500' : isRunning ? 'text-blue-500' : 'text-red-500';

                            return (
                                <tr key={log.id} className="border-b border-gray-800/50 hover:bg-[#1a1a1a]/50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {new Date(log.created_at).toLocaleString([], {
                                            month: 'short', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                                        })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap capitalize">
                                        {log.scan_type}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className={`flex items-center ${statusColor}`}>
                                            <StatusIcon className={`w-4 h-4 mr-1.5 ${isRunning ? 'animate-pulse' : ''}`} />
                                            <span className="capitalize">{log.status}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-white font-medium">
                                        {log.tickers_scanned}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-white font-medium">
                                        {log.events_detected}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-white font-medium">
                                        {log.signals_generated}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {formatDuration(log.duration_ms)}
                                    </td>
                                </tr>
                            );
                        })}
                        {logs.length === 0 && (
                            <tr>
                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                    No scan history available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
