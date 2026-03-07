/**
 * OnboardingOverlay — Guided first-run experience for new users.
 *
 * Steps: Welcome, Add Watchlist, Set Capital, Run Scan, Explore Signals.
 * Includes actionable CTAs (not just information).
 * Uses localStorage to show only once.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Command, Zap,
    ArrowRight, X, Sparkles, List, DollarSign,
    Radar, BookOpen,
} from 'lucide-react';

const STORAGE_KEY = 'sentinel_onboarding_complete';

interface OnboardingStep {
    title: string;
    description: string;
    icon: React.ReactNode;
    action?: { label: string; path: string };
}

const STEPS: OnboardingStep[] = [
    {
        title: 'Welcome to Sentinel',
        description: 'Your AI-powered trading intelligence platform. Sentinel monitors markets for behavioral biases and generates probabilistic trading signals. Let\'s get you set up.',
        icon: <Sparkles className="w-6 h-6 text-emerald-400" />,
    },
    {
        title: '1. Add Your Watchlist',
        description: 'Start by adding tickers you want to monitor. The AI scanner will analyze these for overreaction and contagion patterns.',
        icon: <List className="w-6 h-6 text-blue-400" />,
        action: { label: 'Go to Watchlist', path: '/watchlist' },
    },
    {
        title: '2. Set Your Capital',
        description: 'Configure your total capital and risk parameters. Sentinel uses these to calculate position sizes with Kelly Criterion, risk-based, or fixed-percentage methods.',
        icon: <DollarSign className="w-6 h-6 text-emerald-400" />,
        action: { label: 'Open Settings', path: '/settings' },
    },
    {
        title: '3. Run Your First Scan',
        description: 'The AI scanner uses 5 specialized agents to detect market events, classify biases, red-team hypotheses, and match historical patterns.',
        icon: <Radar className="w-6 h-6 text-yellow-400" />,
        action: { label: 'Open Scanner', path: '/scanner' },
    },
    {
        title: '4. Explore AI Signals',
        description: 'Each signal includes entry/exit zones, stop loss, target, thesis, counter-arguments, and confidence scores. Click any signal to dive deep.',
        icon: <Zap className="w-6 h-6 text-purple-400" />,
    },
    {
        title: '5. Track & Reflect',
        description: 'Log trades in the Journal with structured reviews. The AI auto-generates post-mortem analysis on closed trades. Check Performance to track signal accuracy over time.',
        icon: <BookOpen className="w-6 h-6 text-blue-400" />,
    },
    {
        title: 'Quick Tip: Command Palette',
        description: 'Press Cmd+K (or Ctrl+K) anywhere to quickly navigate, search tickers, or trigger scans. You can also explore the Backtest engine to validate AI accuracy.',
        icon: <Command className="w-6 h-6 text-purple-400" />,
    },
];

export function OnboardingOverlay() {
    const [isVisible, setIsVisible] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        const completed = localStorage.getItem(STORAGE_KEY);
        if (!completed) {
            const timer = setTimeout(() => setIsVisible(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleComplete = useCallback(() => {
        localStorage.setItem(STORAGE_KEY, 'true');
        setIsVisible(false);
    }, []);

    const handleNext = useCallback(() => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        } else {
            handleComplete();
        }
    }, [currentStep, handleComplete]);

    const handleAction = useCallback((path: string) => {
        handleComplete();
        navigate(path);
    }, [handleComplete, navigate]);

    if (!isVisible) return null;

    const step = STEPS[currentStep];
    if (!step) return null;

    return (
        <AnimatePresence>
            {isVisible && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[300]"
                    />

                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-md z-[301] bg-sentinel-950/98 rounded-2xl border border-sentinel-800/60 shadow-2xl overflow-hidden"
                    >
                        <div className="h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-purple-500" />

                        <div className="p-6 sm:p-8">
                            <button
                                onClick={handleComplete}
                                className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center text-sentinel-500 hover:text-sentinel-300 hover:bg-sentinel-800/50 transition-colors cursor-pointer border-none bg-transparent"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            <div className="relative w-14 h-14 mx-auto mb-5">
                                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/10 to-emerald-500/20 blur-xl animate-pulse" />
                                <div className="relative w-14 h-14 bg-sentinel-800/40 rounded-full flex items-center justify-center ring-1 ring-white/10">
                                    {step.icon}
                                </div>
                            </div>

                            <h2 className="text-xl font-bold text-sentinel-100 text-center mb-2">{step.title}</h2>
                            <p className="text-sm text-sentinel-400 text-center leading-relaxed mb-6">{step.description}</p>

                            {/* Actionable CTA */}
                            {step.action && (
                                <div className="flex justify-center mb-6">
                                    <button
                                        onClick={() => handleAction(step.action!.path)}
                                        className="px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-sm font-medium ring-1 ring-blue-500/30 transition-colors cursor-pointer border-none flex items-center gap-2"
                                    >
                                        {step.action.label}
                                        <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            )}

                            {/* Progress dots */}
                            <div className="flex items-center justify-center gap-2 mb-6">
                                {STEPS.map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setCurrentStep(i)}
                                        className={`rounded-full transition-all duration-300 border-none cursor-pointer bg-transparent p-0 ${
                                            i === currentStep ? 'w-6 h-1.5 bg-blue-400' :
                                            i < currentStep ? 'w-1.5 h-1.5 bg-blue-400/50' :
                                            'w-1.5 h-1.5 bg-sentinel-700'
                                        }`}
                                    />
                                ))}
                            </div>

                            <div className="flex items-center justify-between gap-4">
                                <button
                                    onClick={handleComplete}
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
