/**
 * OnboardingOverlay — First-run experience for new users.
 *
 * Shows a step-through overlay highlighting key features:
 * Dashboard, Command Palette, Scanner, and Positions.
 * Uses localStorage to show only once.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Command, Zap, Briefcase, ArrowRight, X, Sparkles } from 'lucide-react';

const STORAGE_KEY = 'sentinel_onboarding_complete';

interface OnboardingStep {
    title: string;
    description: string;
    icon: React.ReactNode;
}

const STEPS: OnboardingStep[] = [
    {
        title: 'Welcome to Sentinel',
        description: 'Your AI-powered trading intelligence platform. Let\'s take a quick tour of the key features.',
        icon: <Sparkles className="w-6 h-6 text-emerald-400" />,
    },
    {
        title: 'Intelligence Dashboard',
        description: 'Get a real-time overview of market conditions, AI-generated signals, and your portfolio exposure — all in one place.',
        icon: <LayoutDashboard className="w-6 h-6 text-blue-400" />,
    },
    {
        title: 'Command Palette (⌘K)',
        description: 'Press ⌘K (or Ctrl+K) anywhere to quickly navigate pages, search tickers, or trigger an AI scan.',
        icon: <Command className="w-6 h-6 text-purple-400" />,
    },
    {
        title: 'AI Scanner',
        description: 'The AI monitors your watchlist for anomalies, generating actionable trade signals with entry, target, and stop-loss levels.',
        icon: <Zap className="w-6 h-6 text-yellow-400" />,
    },
    {
        title: 'Position Tracker',
        description: 'Log your trades, track P&L, and get AI-powered post-mortem analysis when you close positions.',
        icon: <Briefcase className="w-6 h-6 text-emerald-400" />,
    },
];

export function OnboardingOverlay() {
    const [isVisible, setIsVisible] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const completed = localStorage.getItem(STORAGE_KEY);
        if (!completed) {
            // Short delay to let the app render first
            const timer = setTimeout(() => setIsVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleComplete = () => {
        localStorage.setItem(STORAGE_KEY, 'true');
        setIsVisible(false);
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            handleComplete();
        }
    };

    const handleSkip = () => {
        handleComplete();
    };

    if (!isVisible) return null;

    const step = STEPS[currentStep];
    if (!step) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]"
                    />

                    {/* Card */}
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-[301] bg-sentinel-950/98 rounded-2xl border border-sentinel-800/60 shadow-2xl overflow-hidden"
                    >
                        {/* Gradient top */}
                        <div className="h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />

                        <div className="p-8">
                            {/* Close button */}
                            <button
                                onClick={handleSkip}
                                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-sentinel-500 hover:text-sentinel-300 hover:bg-sentinel-800/50 transition-colors cursor-pointer border-none bg-transparent"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            {/* Icon */}
                            <div className="relative w-14 h-14 mx-auto mb-5">
                                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/10 to-emerald-500/20 blur-xl animate-pulse" />
                                <div className="relative w-14 h-14 bg-sentinel-800/40 rounded-full flex items-center justify-center ring-1 ring-white/10">
                                    {step.icon}
                                </div>
                            </div>

                            {/* Content */}
                            <h2 className="text-xl font-bold text-sentinel-100 text-center mb-2">{step.title}</h2>
                            <p className="text-sm text-sentinel-400 text-center leading-relaxed mb-8">{step.description}</p>

                            {/* Progress dots */}
                            <div className="flex items-center justify-center gap-2 mb-6">
                                {STEPS.map((_, i) => (
                                    <div
                                        key={i}
                                        className={`h-1.5 rounded-full transition-all duration-300 ${i === currentStep ? 'w-6 bg-blue-400' : i < currentStep ? 'w-1.5 bg-blue-400/50' : 'w-1.5 bg-sentinel-700'
                                            }`}
                                    />
                                ))}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between gap-4">
                                <button
                                    onClick={handleSkip}
                                    className="px-4 py-2 text-sm text-sentinel-500 hover:text-sentinel-300 transition-colors cursor-pointer border-none bg-transparent"
                                >
                                    Skip tour
                                </button>
                                <button
                                    onClick={handleNext}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer border-none"
                                >
                                    {currentStep < STEPS.length - 1 ? (
                                        <>Next <ArrowRight className="w-3.5 h-3.5" /></>
                                    ) : (
                                        'Get Started'
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
