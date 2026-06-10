/**
 * MarketTab — the daily market-understanding hub.
 *
 * Assembles previously-orphaned, self-contained market widgets (built but
 * routed nowhere) into one first-class view, so the dashboard answers "what's
 * happening and why" — not just "here are opportunities". Each widget is
 * isolated in its own ErrorBoundary so one failing fetch can't blank the tab.
 */

import { type ReactNode } from 'react';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { MarketTrends, PotentialSignals } from '@/components/dashboard/MarketTrends';
import { UpcomingEvents } from '@/components/dashboard/UpcomingEvents';
import { FearGreedPanel } from '@/components/dashboard/FearGreedPanel';
import { SectorHeatMap } from '@/components/dashboard/SectorHeatMap';
import { WeeklyDigest } from '@/components/dashboard/WeeklyDigest';

function Cell({ children }: { children: ReactNode }) {
    return <ErrorBoundary>{children}</ErrorBoundary>;
}

export function MarketTab() {
    return (
        <div className="space-y-6">
            <div className="grid lg:grid-cols-2 gap-6">
                <Cell><MarketTrends /></Cell>
                <Cell><UpcomingEvents /></Cell>
            </div>
            <div className="grid lg:grid-cols-2 gap-6">
                <Cell><FearGreedPanel /></Cell>
                <Cell><SectorHeatMap /></Cell>
            </div>
            <Cell><PotentialSignals /></Cell>
            <Cell><WeeklyDigest /></Cell>
        </div>
    );
}
