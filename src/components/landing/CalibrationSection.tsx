/**
 * CalibrationSection — confidence honesty: calibration remaps raw model
 * confidence to observed win rates, with the self-drawing reliability curve.
 */

import { Section, Eyebrow, SectionTitle, Lead } from './SectionPrimitives';
import { CalibrationCurve } from './CalibrationCurve';

export function CalibrationSection() {
    return (
        <Section id="calibration">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
                <div className="lg:order-2">
                    <Eyebrow label="Calibrated confidence" color="#22d3ee" />
                    <SectionTitle className="mt-4 mb-5">A “70%” that actually wins 70%.</SectionTitle>
                    <Lead className="mb-5">
                        Raw model confidence is almost always overconfident. Sentinel remaps it to the
                        win rate actually observed in each confidence bucket — per signal type and sector —
                        so the number you see is grounded in what happened, not what the model felt.
                    </Lead>
                    <ul className="space-y-3 text-sm text-sentinel-300">
                        <li className="flex items-start gap-3">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                            Each signal is stamped with the calibration version that scored it, so old
                            calls stay interpretable forever.
                        </li>
                        <li className="flex items-start gap-3">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                            Buckets with too few samples are labeled as such — never padded with a
                            fabricated number.
                        </li>
                    </ul>
                </div>

                <div className="lg:order-1 glass-panel rounded-2xl p-6">
                    <CalibrationCurve />
                </div>
            </div>
        </Section>
    );
}
