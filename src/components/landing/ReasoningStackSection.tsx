/**
 * ReasoningStackSection — pairs the full reasoning stack (breadth) with the
 * confidence ledger (how it composes into a single calibrated number).
 */

import { Section, Eyebrow, SectionTitle, Lead } from './SectionPrimitives';
import { ReasoningStack } from './ReasoningStack';
import { ConfidenceWaterfall } from './ConfidenceWaterfall';

export function ReasoningStackSection() {
    return (
        <Section id="stack">
            <div className="max-w-3xl">
                <Eyebrow label="The full stack" color="#3b82f6" />
                <SectionTitle className="mt-4 mb-5">Far more than five agents.</SectionTitle>
                <Lead>
                    The five headline agents are the spine. Around them, a dozen mechanisms each test
                    the thesis and earn or burn confidence — then calibration grounds the number, and
                    the audit trail records every step.
                </Lead>
            </div>

            <div className="mt-14 grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
                <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-sentinel-500 mb-5">
                        Every layer a signal passes through
                    </div>
                    <ReasoningStack />
                </div>
                <div>
                    <div className="text-xs font-mono uppercase tracking-wider text-sentinel-500 mb-5">
                        Every principle, as a number
                    </div>
                    <ConfidenceWaterfall />
                </div>
            </div>
        </Section>
    );
}
