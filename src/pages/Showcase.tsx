/**
 * Sentinel — /about showcase ("The build").
 *
 * The deeper, builder-facing cut for sharing as a project (e.g. LinkedIn).
 * Reuses the same shared landing sections as the home page — with the detailed
 * pipeline variant and extra engineering depth (tech stack, builder stats) —
 * so the two surfaces never drift.
 */

import { motion } from 'framer-motion';
import { ArrowRight, ArrowDown } from 'lucide-react';
import { LandingNav, type NavLink } from '@/components/landing/LandingNav';
import { ProblemSection } from '@/components/landing/ProblemSection';
import { PrinciplesSection } from '@/components/landing/PrinciplesSection';
import { PipelineSection } from '@/components/landing/PipelineSection';
import { ReasoningStackSection } from '@/components/landing/ReasoningStackSection';
import { AuditTrailSection } from '@/components/landing/AuditTrailSection';
import { CalibrationSection } from '@/components/landing/CalibrationSection';
import { ProvingGroundSection } from '@/components/landing/ProvingGroundSection';
import { TechStackSection } from '@/components/landing/TechStackSection';
import { StatsBand } from '@/components/landing/StatsBand';
import { ApplicationSection } from '@/components/landing/ApplicationSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { ARCHITECTURE_STATS, BUILDER_STATS } from '@/components/landing/landingContent';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';

const SHOWCASE_LINKS: NavLink[] = [
    { label: 'Principles', href: '#principles' },
    { label: 'Pipeline', href: '#pipeline' },
    { label: 'Reasoning stack', href: '#stack' },
    { label: 'Home', href: '/' },
];

export function Showcase() {
    return (
        <div className="min-h-screen bg-sentinel-950 text-sentinel-100">
            <LandingNav links={SHOWCASE_LINKS} />
            <ShowcaseHero />
            <StatsBand stats={ARCHITECTURE_STATS} />
            <ProblemSection />
            <PrinciplesSection />
            <PipelineSection detailed />
            <ReasoningStackSection />
            <AuditTrailSection />
            <CalibrationSection />
            <ProvingGroundSection />
            <TechStackSection />
            <StatsBand stats={BUILDER_STATS} />
            <ApplicationSection />
            <CTASection
                title="Want the live version?"
                body="Sign in to watch the pipeline run on real market events and write to the audit trail in real time."
                showBuildLink={false}
            />
            <LandingFooter />
        </div>
    );
}

function ShowcaseHero() {
    const { signIn, loading } = useGoogleSignIn();

    return (
        <div className="relative overflow-hidden">
            <div className="absolute inset-0 bg-grid-pattern opacity-40" />
            <div className="absolute -top-24 left-1/3 w-[30rem] h-[30rem] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-10 right-1/4 w-[26rem] h-[26rem] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            <div className="relative max-w-4xl mx-auto px-6 pt-20 pb-16 sm:pt-28 sm:pb-20">
                <motion.span
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 text-purple-300 rounded-full text-xs font-medium ring-1 ring-purple-500/20 mb-6"
                >
                    The build
                </motion.span>
                <motion.h1
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.05 }}
                    className="text-4xl sm:text-5xl font-bold font-display tracking-tight leading-[1.08] mb-6 text-sentinel-50"
                >
                    An auditable reasoning engine,{' '}
                    <span className="bg-gradient-to-r from-purple-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
                        built in the open.
                    </span>
                </motion.h1>
                <motion.p
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.12 }}
                    className="text-lg text-sentinel-400 max-w-2xl leading-relaxed mb-8"
                >
                    Sentinel is a self-critiquing, multi-agent reasoning system with a calibration loop
                    and a complete audit trail on every decision. Markets are the proving ground —
                    fast feedback, unforgiving scoring — but the engine itself is domain-agnostic.
                    Here’s how it fits together.
                </motion.p>
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.18 }}
                    className="flex flex-col sm:flex-row gap-3"
                >
                    <a
                        href="#pipeline"
                        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/5 hover:bg-white/10 text-sentinel-100 rounded-xl text-base font-medium transition-colors ring-1 ring-white/10 no-underline"
                    >
                        Walk the pipeline <ArrowDown className="w-4 h-4" />
                    </a>
                    <button
                        onClick={signIn}
                        disabled={loading}
                        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-base font-medium transition-colors border-none cursor-pointer disabled:opacity-50"
                    >
                        {loading ? 'Redirecting…' : 'See it live'} <ArrowRight className="w-4 h-4" />
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
