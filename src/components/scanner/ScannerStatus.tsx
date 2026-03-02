import React from 'react';
import { Activity, Clock, CheckCircle, AlertTriangle } from 'lucide-react';
import { useScannerLogs } from '@/hooks/useScannerLogs';
import { useAppSettings } from '@/hooks/useAppSettings';

export const ScannerStatus: React.FC = () => {
    const { logs, loading: logsLoading } = useScannerLogs(1);
    const { settings, loading: settingsLoading } = useAppSettings();

    const latestLog = logs[0];
    const isScanning = latestLog?.status === 'running';

    // Status text based on logs and active config
    let statusText = 'Idle';
    let StatusIcon = CheckCircle;
    let statusColor = 'text-green-400';

    if (logsLoading || settingsLoading) {
        statusText = 'Loading...';
        StatusIcon = Activity;
        statusColor = 'text-gray-400';
    } else if (isScanning) {
        statusText = 'Scanning Active';
        StatusIcon = Activity;
        statusColor = 'text-blue-400';
    } else if (latestLog?.status === 'failed') {
        statusText = 'Last Scan Failed';
        StatusIcon = AlertTriangle;
        statusColor = 'text-red-400';
    }

    const lastRunTime = latestLog ? new Date(latestLog.created_at).toLocaleString() : 'Never';
    const activeSectors = settings?.active_sectors?.length || 0;

    return (
        <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                <Activity className="w-5 h-5 mr-2 text-indigo-400" />
                System Status
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                    <div className="text-gray-400 text-sm mb-1 flex items-center">
                        <StatusIcon className={`w-4 h-4 mr-2 ${statusColor}`} />
                        Current State
                    </div>
                    <div className={`text-lg font-semibold ${statusColor}`}>
                        {statusText}
                    </div>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                    <div className="text-gray-400 text-sm mb-1 flex items-center">
                        <Clock className="w-4 h-4 mr-2" />
                        Last Run
                    </div>
                    <div className="text-lg font-semibold text-white">
                        {lastRunTime}
                    </div>
                </div>

                <div className="bg-[#1a1a1a] rounded-lg p-4 border border-gray-800">
                    <div className="text-gray-400 text-sm mb-1 flex items-center">
                        <Activity className="w-4 h-4 mr-2" />
                        Active Sectors
                    </div>
                    <div className="text-lg font-semibold text-white">
                        {activeSectors} Sectors Monitored
                    </div>
                </div>
            </div>
            {isScanning && (
                <div className="mt-4 text-sm text-blue-400 animate-pulse flex items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mr-2"></div>
                    Pipeline running. Standby for new signals...
                </div>
            )}
        </div>
    );
};
