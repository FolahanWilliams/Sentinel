/**
 * Sentinel — Intelligence Page
 *
 * Page wrapper for the Sentinel news intelligence feed.
 */

import { SentinelPanel } from '@/components/sentinel/SentinelPanel';

export function Intelligence() {
    return (
        <div style={{ padding: 'var(--spacing-lg)' }}>
            <SentinelPanel />
        </div>
    );
}
