/**
 * TickerAnalysisPanel — Shared analysis grid used by both Analysis and StockAnalysis pages.
 *
 * Renders BiasBreakdown + FundamentalSnapshot on the left,
 * EventTimeline on the right, with optional extra content slots.
 */

import { BiasBreakdown } from '@/components/analysis/BiasBreakdown';
import { EventTimeline } from '@/components/analysis/EventTimeline';
import { FundamentalSnapshot } from '@/components/analysis/FundamentalSnapshot';

interface TickerAnalysisPanelProps {
    /** Ticker symbol being analyzed */
    ticker: string;
    /** Primary bias type (from signal or 'analysis' for free-form) */
    biasType?: string;
    /** Secondary biases from signal */
    secondaryBiases?: string[];
    /** Bias explanation text */
    biasExplanation?: string;
    /** Counter argument text */
    counterArgument?: string;
    /** Confidence score from signal */
    confidenceScore?: number;
    /** Agent outputs from signal */
    agentOutputs?: any;
    /** AI-fetched bias weights */
    biasWeights?: any;
    /** Whether bias weights are loading */
    weightsLoading?: boolean;
    /** Sanity check data from agents */
    sanityCheck?: any;
    /** AI-fetched fundamentals */
    fundamentals?: any;
    /** Whether fundamentals are loading */
    fundamentalsLoading?: boolean;
    /** Callback to refresh analysis */
    onRefresh?: () => void;
    /** Market events from DB */
    events?: any[];
    /** AI-fetched events */
    aiEvents?: any;
    /** Whether AI events are loading */
    aiEventsLoading?: boolean;
    /** Additional content to render in the left column (after BiasBreakdown + FundamentalSnapshot) */
    leftExtra?: React.ReactNode;
    /** Additional content to render in the right column (after EventTimeline) */
    rightExtra?: React.ReactNode;
}

export function TickerAnalysisPanel({
    biasType = 'analysis',
    secondaryBiases,
    biasExplanation,
    counterArgument,
    confidenceScore,
    agentOutputs,
    biasWeights,
    weightsLoading = false,
    sanityCheck,
    fundamentals,
    fundamentalsLoading = false,
    onRefresh,
    events = [],
    aiEvents,
    aiEventsLoading = false,
    leftExtra,
    rightExtra,
}: TickerAnalysisPanelProps) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-6">
                <BiasBreakdown
                    biasType={biasType}
                    secondaryBiases={secondaryBiases}
                    biasExplanation={biasExplanation}
                    counterArgument={counterArgument}
                    confidenceScore={confidenceScore}
                    agentOutputs={agentOutputs}
                    biasWeights={biasWeights}
                    weightsLoading={weightsLoading}
                />

                <FundamentalSnapshot
                    sanityCheck={sanityCheck}
                    fundamentals={fundamentals}
                    fundamentalsLoading={fundamentalsLoading}
                    onRefresh={onRefresh}
                />

                {leftExtra}
            </div>

            {/* Right column */}
            <div className="space-y-6">
                <EventTimeline
                    events={events}
                    aiEvents={aiEvents}
                    aiEventsLoading={aiEventsLoading}
                />

                {rightExtra}
            </div>
        </div>
    );
}
