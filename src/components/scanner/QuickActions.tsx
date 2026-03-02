import React, { useState } from 'react';
import { Play, Bell, AlertCircle, Loader2 } from 'lucide-react';
import { ScannerService } from '@/services/scanner';

export const QuickActions: React.FC = () => {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleRunFullScan = async () => {
        setIsScanning(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await ScannerService.runScan('full');
            if (result.success) {
                setSuccess(`Scan completed successfully. Tickers: ${result.tickersScanned}, Events: ${result.eventsDetected}, Signals: ${result.signalsGenerated}.`);
            } else {
                setError(`Scan failed: ${result.error}`);
            }
        } catch (e: any) {
            setError(`Error: ${e.message}`);
        } finally {
            setIsScanning(false);
        }
    };

    const handleTestNotification = async () => {
        alert('Test Notification: This would trigger a system notification if configured.');
    };

    return (
        <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>

            <div className="flex flex-col gap-3">
                <button
                    onClick={handleRunFullScan}
                    disabled={isScanning}
                    className="flex items-center justify-center w-full px-4 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors font-medium"
                >
                    {isScanning ? (
                        <>
                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                            Running Full Scan...
                        </>
                    ) : (
                        <>
                            <Play className="w-5 h-5 mr-2" />
                            Trigger Full Scan
                        </>
                    )}
                </button>

                <button
                    onClick={handleTestNotification}
                    disabled={isScanning}
                    className="flex items-center justify-center w-full px-4 py-3 bg-[#1a1a1a] hover:bg-gray-800 disabled:opacity-50 text-white border border-gray-700 rounded-lg transition-colors font-medium"
                >
                    <Bell className="w-5 h-5 mr-2" />
                    Test Notification Alert
                </button>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-900/40 border border-red-800 rounded flex items-start text-red-300 text-sm">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="mt-4 p-3 bg-green-900/40 border border-green-800 rounded flex items-start text-green-300 text-sm">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{success}</span>
                </div>
            )}
        </div>
    );
};
