import { useSearchParams } from 'react-router-dom';
import { ScannerStatus } from '@/components/scanner/ScannerStatus';
import { QuickActions } from '@/components/scanner/QuickActions';
import { ScanActivity } from '@/components/scanner/ScanActivity';
import { ScanConfiguration } from '@/components/scanner/ScanConfiguration';
import { ScanLogsTable } from '@/components/scanner/ScanLogsTable';
import { ManualScanForm } from '@/components/scanner/ManualScanForm';
import { ScanResults } from '@/components/scanner/ScanResults';
import { Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Scanner() {
    const [searchParams] = useSearchParams();
    const initialTicker = searchParams.get('ticker') || undefined;

    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Scanner Control Panel</h1>
                    <p className="text-gray-400">Monitor and configure the automated market analysis pipeline.</p>
                </div>
                <Link
                    to="/intelligence"
                    className="flex items-center gap-2 px-4 py-2 bg-sentinel-800/60 hover:bg-sentinel-800 text-sentinel-200 text-sm font-medium rounded-lg border border-sentinel-700/50 transition-colors no-underline"
                >
                    <Newspaper className="w-4 h-4" />
                    Intelligence Feed
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Main Content Column */}
                <div className="lg:col-span-2 flex flex-col gap-6">
                    <ScannerStatus />
                    <ScanConfiguration />
                </div>

                {/* Sidebar Column */}
                <div className="flex flex-col gap-6">
                    <QuickActions />
                    <ManualScanForm initialTicker={initialTicker} />
                    <ScanActivity />
                </div>
            </div>

            {/* Generated Signals — the actual results */}
            <div className="w-full mb-6">
                <ScanResults />
            </div>

            {/* Full Width Table */}
            <div className="w-full">
                <ScanLogsTable />
            </div>
        </div>
    );
}

export default Scanner;
