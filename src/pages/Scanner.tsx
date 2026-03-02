import { ScannerStatus } from '@/components/scanner/ScannerStatus';
import { QuickActions } from '@/components/scanner/QuickActions';
import { ScanActivity } from '@/components/scanner/ScanActivity';
import { ScanConfiguration } from '@/components/scanner/ScanConfiguration';
import { ScanLogsTable } from '@/components/scanner/ScanLogsTable';
import { ManualScanForm } from '@/components/scanner/ManualScanForm';

export function Scanner() {
    return (
        <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-white mb-2">Scanner Control Panel</h1>
                <p className="text-gray-400">Monitor and configure the automated market analysis pipeline.</p>
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
                    <ManualScanForm />
                    <ScanActivity />
                </div>
            </div>

            {/* Full Width Table */}
            <div className="w-full">
                <ScanLogsTable />
            </div>
        </div>
    );
}

export default Scanner;
