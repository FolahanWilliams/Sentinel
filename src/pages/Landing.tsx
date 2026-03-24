/**
 * Sentinel — Public Landing Page
 *
 * Investment-focused positioning: "The only system that tracks, scores,
 * and improves executive decision performance over time — with measurable ROI."
 */

import { useState } from 'react';
import { supabase } from '@/config/supabase';
import {
    Shield, Target, TrendingUp, BarChart3, Brain,
    ArrowRight, Zap, CheckCircle2, DollarSign, Layers,
} from 'lucide-react';

export function Landing() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);
        const { error: authError } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        });
        if (authError) {
            setError(authError.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-sentinel-950 text-sentinel-100">
            {/* Hero */}
            <div className="relative overflow-hidden">
                {/* Background gradient orbs */}
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />

                <div className="relative max-w-5xl mx-auto px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
                    {/* Nav */}
                    <div className="flex items-center justify-between mb-16">
                        <div className="flex items-center gap-2">
                            <Shield className="w-7 h-7 text-blue-400" />
                            <span className="text-xl font-bold font-display tracking-tight">Sentinel</span>
                        </div>
                        <button
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors border-none cursor-pointer disabled:opacity-50"
                        >
                            {loading ? 'Redirecting...' : 'Sign In'}
                        </button>
                    </div>

                    {/* Headline */}
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium ring-1 ring-emerald-500/20 mb-6">
                            <Zap className="w-3.5 h-3.5" />
                            AI-Powered Decision Intelligence
                        </div>

                        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold font-display tracking-tight leading-[1.1] mb-6">
                            Track, score, and{' '}
                            <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                                improve
                            </span>{' '}
                            investment decision performance
                        </h1>

                        <p className="text-lg sm:text-xl text-sentinel-400 mb-8 max-w-2xl leading-relaxed">
                            The only system that detects cognitive biases in real-time, forces
                            outcome accountability, and proves measurable ROI on every decision
                            you make.
                        </p>

                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={handleGoogleSignIn}
                                disabled={loading}
                                className="flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-base font-medium transition-colors border-none cursor-pointer disabled:opacity-50"
                            >
                                Get Started <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>

                        {error && <p className="text-xs mt-3 text-red-400">{error}</p>}
                    </div>
                </div>
            </div>

            {/* Value Props */}
            <div className="max-w-5xl mx-auto px-6 py-20">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <ValueCard
                        icon={Brain}
                        title="Bias Detection"
                        description="15-bias cognitive audit on every analysis. Catches anchoring, confirmation bias, sunk cost fallacy, and 12 more — before they cost you money."
                        color="purple"
                    />
                    <ValueCard
                        icon={Target}
                        title="Mandatory Outcomes"
                        description="Every decision gets an outcome deadline. Track accuracy over time with calibration curves that show exactly where your confidence is miscalibrated."
                        color="blue"
                    />
                    <ValueCard
                        icon={DollarSign}
                        title="Measurable ROI"
                        description="'This bias cost you £47K.' See the monetary impact of every cognitive bias, calculated from your actual decision outcomes."
                        color="emerald"
                    />
                </div>
            </div>

            {/* How It Works */}
            <div className="max-w-5xl mx-auto px-6 py-20 border-t border-sentinel-800/50">
                <h2 className="text-2xl sm:text-3xl font-bold font-display text-center mb-12">
                    The Decision Intelligence Loop
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    <StepCard
                        step={1}
                        icon={Layers}
                        title="Capture"
                        description="Investment memo, board paper, or capital allocation decision enters the system."
                    />
                    <StepCard
                        step={2}
                        icon={Brain}
                        title="Audit"
                        description="AI bias detective + 3-persona decision twin + red team stress-test every thesis."
                    />
                    <StepCard
                        step={3}
                        icon={BarChart3}
                        title="Track"
                        description="Mandatory outcome logging. Confidence calibration. Rolling accuracy scores."
                    />
                    <StepCard
                        step={4}
                        icon={TrendingUp}
                        title="Improve"
                        description="Bias Genome shows which biases cost you most. Accuracy trends prove decision quality is improving."
                    />
                </div>
            </div>

            {/* Social Proof / Stats */}
            <div className="max-w-5xl mx-auto px-6 py-20 border-t border-sentinel-800/50">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                    <StatCard label="Cognitive Biases Tracked" value="15" />
                    <StatCard label="Decision Twin Personas" value="3" />
                    <StatCard label="Outcome Checkpoints" value="4" />
                    <StatCard label="Agent Pipeline Stages" value="12+" />
                </div>
            </div>

            {/* CTA */}
            <div className="max-w-5xl mx-auto px-6 py-20 text-center">
                <h2 className="text-2xl sm:text-3xl font-bold font-display mb-4">
                    Stop guessing. Start measuring.
                </h2>
                <p className="text-sentinel-400 mb-8 max-w-lg mx-auto">
                    Every week without outcome tracking is a week you can't prove your decision quality is improving.
                </p>
                <button
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-base font-medium transition-colors border-none cursor-pointer mx-auto disabled:opacity-50"
                >
                    <CheckCircle2 className="w-4 h-4" />
                    {loading ? 'Redirecting...' : 'Start Tracking Decisions'}
                </button>
            </div>

            {/* Footer */}
            <div className="border-t border-sentinel-800/50 py-8 text-center text-xs text-sentinel-600">
                Sentinel — AI-Powered Decision Intelligence
            </div>
        </div>
    );
}

function ValueCard({ icon: Icon, title, description, color }: {
    icon: typeof Brain;
    title: string;
    description: string;
    color: 'purple' | 'blue' | 'emerald';
}) {
    const colorMap = {
        purple: 'bg-purple-500/10 text-purple-400 ring-purple-500/20',
        blue: 'bg-blue-500/10 text-blue-400 ring-blue-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    };

    return (
        <div className="glass-panel rounded-2xl p-6">
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ring-1 mb-4 ${colorMap[color]}`}>
                <Icon className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-sentinel-100 mb-2">{title}</h3>
            <p className="text-sm text-sentinel-400 leading-relaxed">{description}</p>
        </div>
    );
}

function StepCard({ step, icon: Icon, title, description }: {
    step: number;
    icon: typeof Brain;
    title: string;
    description: string;
}) {
    return (
        <div className="text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-sentinel-800/50 ring-1 ring-sentinel-700/30 mb-3 relative">
                <Icon className="w-5 h-5 text-sentinel-300" />
                <span className="absolute -top-2 -right-2 w-5 h-5 bg-blue-600 rounded-full text-[10px] font-bold flex items-center justify-center text-white">
                    {step}
                </span>
            </div>
            <h4 className="text-sm font-bold text-sentinel-100 mb-1">{title}</h4>
            <p className="text-xs text-sentinel-500 leading-relaxed">{description}</p>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <span className="text-3xl font-bold font-mono bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                {value}
            </span>
            <p className="text-xs text-sentinel-500 mt-1">{label}</p>
        </div>
    );
}
