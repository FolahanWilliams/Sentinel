/**
 * EmptyState — Placeholder for when a list/section has no data.
 */

import { Inbox } from 'lucide-react';

interface EmptyStateProps {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
}

export function EmptyState({
    title = 'No data yet',
    description,
    icon,
    action,
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="p-4 bg-sentinel-800/50 rounded-full ring-1 ring-sentinel-700">
                {icon || <Inbox className="w-8 h-8 text-sentinel-500" />}
            </div>
            <div>
                <h3 className="text-lg font-semibold text-sentinel-300">{title}</h3>
                {description && (
                    <p className="text-sm text-sentinel-500 mt-1 max-w-sm">{description}</p>
                )}
            </div>
            {action}
        </div>
    );
}
