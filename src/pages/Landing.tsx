/**
 * Sentinel — Public Landing / cover page.
 *
 * Balanced split: an outcome-led hero, then a mechanism-deep body. Every
 * section is a shared component (src/components/landing) so the home page and
 * the /about showcase render from the same source and cannot drift.
 *
 * Positioning is the canonical market-intelligence framing; the "applied
 * elsewhere" angle (ApplicationSection) is kept generic by design.
 */

import { LandingNav } from '@/components/landing/LandingNav';
import { Hero } from '@/components/landing/Hero';
import { ProblemSection } from '@/components/landing/ProblemSection';
import { PipelineSection } from '@/components/landing/PipelineSection';
import { AuditTrailSection } from '@/components/landing/AuditTrailSection';
import { CalibrationSection } from '@/components/landing/CalibrationSection';
import { StatsBand } from '@/components/landing/StatsBand';
import { ProvingGroundSection } from '@/components/landing/ProvingGroundSection';
import { ApplicationSection } from '@/components/landing/ApplicationSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';

export function Landing() {
    return (
        <div className="min-h-screen bg-sentinel-950 text-sentinel-100">
            <LandingNav />
            <Hero />
            <ProblemSection />
            <PipelineSection />
            <AuditTrailSection />
            <CalibrationSection />
            <StatsBand />
            <ProvingGroundSection />
            <ApplicationSection />
            <CTASection />
            <LandingFooter />
        </div>
    );
}
