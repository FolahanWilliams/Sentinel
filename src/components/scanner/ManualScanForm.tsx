import React, { useState, useEffect } from 'react';
import { Search, Loader2, AlertCircle, Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScannerService } from '@/services/scanner';

interface ManualScanFormProps {
    initialTicker?: string;
}

export const ManualScanForm: React.FC<ManualScanFormProps> = ({ initialTicker }) => {
    const [ticker, setTicker] = useState(initialTicker || '');
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [lastScannedTicker, setLastScannedTicker] = useState<string | null>(null);

    useEffect(() => {
        if (initialTicker) {
            setTicker(initialTicker.toUpperCase());
        }
    }, [initialTicker]);

    const handleManualScan = async (e: React.FormEvent) => {
        e.preventDefault();

        const cleanTicker = ticker.trim().toUpperCase();
        if (!cleanTicker) return;

        setIsScanning(true);
        setError(null);
        setSuccess(null);

        try {
            // Note: ScannerService takes `isPaper` boolean. For Manual Scan, default to true.
            const result = await ScannerService.runSingleTickerScan(cleanTicker, true);
            if (result.success) {
                setSuccess(result.summary || `Scan complete for ${cleanTicker}`);
                setLastScannedTicker(cleanTicker);
                setTicker('');
            } else {
                setError(`Scan failed: ${result.error}`);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            setError(`Error: ${message}`);
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="glass-panel rounded-xl p-6 h-full flex flex-col justify-center">
            <h2 className="text-xl font-bold text-sentinel-100 mb-2">Manual Ticker Scan</h2>
            <p className="text-sm text-sentinel-400 mb-6">
                Directly run the analysis pipeline on a specific ticker, bypassing watchlist filters.
            </p>

            <form onSubmit={handleManualScan} className="flex space-x-3">
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        className="block w-full pl-10 pr-3 py-3 border border-sentinel-700 rounded-lg bg-sentinel-900 text-sentinel-100 placeholder-sentinel-500 focus:outline-none focus:ring-1 focus:ring-sentinel-500 uppercase font-medium"
                        placeholder="e.g. AAPL"
                        maxLength={10}
                        disabled={isScanning}
                    />
                </div>
                <button
                    type="submit"
                    disabled={isScanning || !ticker.trim()}
                    className="flex items-center justify-center px-6 py-3 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                    {isScanning ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                        'Scan Now'
                    )}
                </button>
            </form>

            {error && (
                <div className="mt-4 p-3 bg-red-900/40 border border-red-800 rounded flex items-start text-red-300 text-sm">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {success && (
                <div className="mt-4 p-3 bg-green-900/40 border border-green-800 rounded text-green-300 text-sm">
                    <div>{success}</div>
                    {lastScannedTicker && (
                        <Link
                            to={`/intelligence?scan=${lastScannedTicker}`}
                            className="inline-flex items-center gap-1.5 mt-2 text-xs text-indigo-300 hover:text-indigo-200 transition-colors"
                        >
                            <Newspaper className="w-3 h-3" />
                            View {lastScannedTicker} in Intelligence
                        </Link>
                    )}
                </div>
            )}
        </div>
    );
};
