import { useState, useEffect, useCallback } from 'react';
import { X, Radar, Search, Loader2, AlertCircle, CheckCircle, Activity, Clock, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ScannerService } from '@/services/scanner';
import { useScannerLogs } from '@/hooks/useScannerLogs';
import { MagneticButton } from '@/components/shared/MagneticButton';

interface ScannerDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    prefillTicker?: string;
}

export function ScannerDrawer({ isOpen, onClose, prefillTicker }: ScannerDrawerProps) {
    const [ticker, setTicker] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const { logs, loading: logsLoading } = useScannerLogs(5);

    // Prefill ticker when drawer opens with a ticker
    useEffect(() => {
        if (prefillTicker && isOpen) {
            setTicker(prefillTicker.toUpperCase());
            setError(null);
            setSuccess(null);
        }
    }, [prefillTicker, isOpen]);

    const handleScan = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanTicker = ticker.trim().toUpperCase();
        if (!cleanTicker) return;

        setIsScanning(true);
        setError(null);
        setSuccess(null);

        try {
            const result = await ScannerService.runSingleTickerScan(cleanTicker, true);
            if (result.success) {
                setSuccess(result.summary || `Scan complete for ${cleanTicker}`);
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
    }, [ticker]);

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
                    onClick={onClose}
                />
            )}

            {/* Drawer Panel — glass-panel-light for overlay clarity */}
            <div className={`
                fixed top-0 right-0 h-full w-full max-w-md z-50
                glass-panel-light border-l border-sentinel-700/50
                transform transition-all duration-300 ease-in-out
                ${isOpen ? 'translate-x-0' : 'translate-x-full'}
                flex flex-col
            `}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-sentinel-700/50 shrink-0">
                    <div className="flex items-center gap-2">
                        <Radar className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white">Quick Scan</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-sentinel-400 hover:text-white hover:bg-sentinel-800 transition-colors border-none cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                    {/* Scan Form */}
                    <div>
                        <p className="text-sm text-sentinel-400 mb-3">
                            Run the analysis pipeline on a specific ticker directly from Intelligence.
                        </p>
                        <form onSubmit={handleScan} className="flex gap-2">
                            <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-sentinel-500" />
                                </div>
                                <input
                                    type="text"
                                    value={ticker}
                                    onChange={(e) => setTicker(e.target.value)}
                                    className="block w-full pl-9 pr-3 py-2.5 border border-sentinel-700 rounded-lg bg-sentinel-950/60 text-white placeholder-sentinel-500 focus:outline-none uppercase font-mono font-medium text-sm glass-input-recessed glass-focus-ring"
                                    placeholder="AAPL"
                                    maxLength={5}
                                    disabled={isScanning}
                                    autoFocus={isOpen}
                                />
                            </div>
                            <MagneticButton
                                type="submit"
                                disabled={isScanning || !ticker.trim()}
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors border-none cursor-pointer"
                            >
                                {isScanning ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    'Scan'
                                )}
                            </MagneticButton>
                        </form>

                        {error && (
                            <div className="mt-3 p-3 bg-red-900/30 border border-red-800/50 rounded-lg flex items-start text-red-300 text-sm">
                                <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {success && (
                            <div className="mt-3 p-3 bg-emerald-900/30 border border-emerald-800/50 rounded-lg text-emerald-300 text-sm">
                                {success}
                            </div>
                        )}
                    </div>

                    {/* Recent Activity */}
                    <div>
                        <h3 className="text-sm font-semibold text-sentinel-300 mb-3 uppercase tracking-wider">
                            Recent Scans
                        </h3>

                        {logsLoading ? (
                            <div className="flex justify-center py-6">
                                <Activity className="w-5 h-5 text-sentinel-500 animate-spin" />
                            </div>
                        ) : logs.length === 0 ? (
                            <p className="text-sm text-sentinel-500 text-center py-6">No scan activity yet.</p>
                        ) : (
                            <div className="space-y-2">
                                {logs.map((log) => {
                                    const isSuccess = log.status === 'completed';
                                    const isRunning = log.status === 'running';
                                    const Icon = isSuccess ? CheckCircle : isRunning ? Activity : AlertCircle;
                                    const iconColor = isSuccess ? 'text-emerald-500' : isRunning ? 'text-blue-400' : 'text-red-500';

                                    return (
                                        <div key={log.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-sentinel-900/40 border border-sentinel-700/40">
                                            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor} ${isRunning ? 'animate-pulse' : ''}`} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-white font-medium capitalize">
                                                        {log.scan_type} scan
                                                    </span>
                                                    <span className="text-[10px] text-sentinel-500 flex items-center gap-1 font-mono">
                                                        <Clock className="w-3 h-3" />
                                                        {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-sentinel-400 mt-0.5">
                                                    {isRunning ? 'In progress...' :
                                                        isSuccess ? `${log.signals_generated} signals from ${log.tickers_scanned} tickers` :
                                                            `Failed: ${log.error_message || 'Unknown'}`
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer — link to full Scanner */}
                <div className="shrink-0 p-4 border-t border-sentinel-700/50">
                    <Link
                        to="/scanner"
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-sentinel-800/60 hover:bg-sentinel-800 text-sentinel-200 text-sm font-medium rounded-lg border border-sentinel-700/50 transition-colors no-underline"
                    >
                        Open Full Scanner
                        <ChevronRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>
        </>
    );
}
