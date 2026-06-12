/**
 * Hero — outcome-led headline (balanced split) with a live "thesis" card that
 * animates the agents clearing one-by-one. Ambient orbs + dot grid behind.
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Activity, ShieldCheck } from 'lucide-react';
import { useGoogleSignIn } from '@/hooks/useGoogleSignIn';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { PIPELINE_AGENTS } from './landingContent';

export function Hero() {
    const { signIn, loading, error } = useGoogleSignIn();

    return (
        <div className="relative overflow-hidden">
            {/* Ambient background */}
            <div className="absolute inset-0 bg-grid-pattern opacity-40" />
            <div className="absolute -top-24 left-1/4 w-[28rem] h-[28rem] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute top-20 right-1/4 w-[26rem] h-[26rem] bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-32 left-1/3 w-[24rem] h-[24rem] bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />

            <div className="relative max-w-6xl mx-auto px-6 pt-16 pb-20 sm:pt-24 sm:pb-28 grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
                {/* Copy */}
                <div>
                    <motion.span
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-medium ring-1 ring-emerald-500/20 mb-6"
                    >
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                        </span>
                        Live · autonomous market intelligence
                    </motion.span>

                    <motion.h1
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.05 }}
                        className="text-4xl sm:text-5xl lg:text-[3.4rem] font-bold font-display tracking-tight leading-[1.07] mb-6 text-sentinel-50"
                    >
                        Every signal,{' '}
                        <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                            cross-examined
                        </span>{' '}
                        before you ever see it.
                    </motion.h1>

                    <motion.p
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.12 }}
                        className="text-lg text-sentinel-400 mb-8 max-w-xl leading-relaxed"
                    >
                        Sentinel runs each market event through a five-agent reasoning pipeline,
                        red-teams its own thesis, and grades every call against the tape — a live,
                        auditable record of decisions made under uncertainty.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.18 }}
                        className="flex flex-col sm:flex-row gap-3"
                    >
                        <button
                            onClick={signIn}
                            disabled={loading}
                            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-base font-medium transition-colors border-none cursor-pointer disabled:opacity-50"
                        >
                            {loading ? 'Redirecting…' : 'Get started'} <ArrowRight className="w-4 h-4" />
                        </button>
                        <a
                            href="#pipeline"
                            className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-white/5 hover:bg-white/10 text-sentinel-100 rounded-xl text-base font-medium transition-colors ring-1 ring-white/10 no-underline"
                        >
                            See how it works
                        </a>
                    </motion.div>

                    {error && <p className="text-xs mt-3 text-red-400">{error}</p>}

                    <p className="mt-6 text-xs text-sentinel-500">
                        Every thesis timestamped, reasoned in full, and graded out-of-sample — never a backtest.
                    </p>
                </div>

                {/* Live thesis card */}
                <HeroThesisCard />
            </div>
        </div>
    );
}

function HeroThesisCard() {
    const reducedMotion = useReducedMotion();
    const N = PIPELINE_AGENTS.length;
    const [active, setActive] = useState(reducedMotion ? N : 0);

    useEffect(() => {
        if (reducedMotion) return;
        const id = setInterval(() => {
            setActive(prev => (prev >= N + 1 ? 0 : prev + 1));
        }, 700);
        return () => clearInterval(id);
    }, [reducedMotion, N]);

    const cleared = Math.min(active, N);

    return (
        <motion.div
            initial={{ opacity: 0, y: 24, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
            className="relative"
        >
            <div className="glass-panel-heavy rounded-2xl p-5 sm:p-6 shadow-elevation-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                        <span className="text-lg font-bold font-mono text-sentinel-50">NVDA</span>
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30">
                            LONG
                        </span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-sentinel-400 font-mono">
                        <Activity className="w-3.5 h-3.5 text-emerald-400" />
                        live
                    </span>
                </div>

                {/* Agent clearance list */}
                <div className="space-y-2 mb-5">
                    {PIPELINE_AGENTS.map((agent, i) => {
                        const done = i < cleared;
                        const isRedTeam = i === N - 1;
                        return (
                            <div key={agent.name} className="flex items-center gap-3">
                                <motion.span
                                    className="flex items-center justify-center rounded-full"
                                    style={{ width: 18, height: 18 }}
                                    animate={{
                                        background: done ? `${agent.color}22` : 'rgba(255,255,255,0.03)',
                                        boxShadow: done ? `0 0 10px ${agent.color}55` : 'none',
                                    }}
                                >
                                    {done ? (
                                        isRedTeam ? (
                                            <ShieldCheck className="w-3 h-3" style={{ color: agent.color }} />
                                        ) : (
                                            <motion.span
                                                initial={{ scale: 0 }}
                                                animate={{ scale: 1 }}
                                                className="w-2 h-2 rounded-full"
                                                style={{ background: agent.color }}
                                            />
                                        )
                                    ) : (
                                        <span className="w-2 h-2 rounded-full bg-sentinel-700" />
                                    )}
                                </motion.span>
                                <span className="text-xs flex-1" style={{ color: done ? '#cbd5e1' : '#475569' }}>
                                    {agent.name}
                                </span>
                                <span className="text-[10px] font-mono" style={{ color: done ? agent.color : '#334155' }}>
                                    {done ? 'pass' : '…'}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Scores */}
                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                    <ScoreBar label="SQI" value={82} suffix="/100" color="#3b82f6" show={cleared >= N} />
                    <ScoreBar label="Calibrated conf." value={61} suffix="%" color="#22d3ee" show={cleared >= N} sublabel="raw 74%" />
                </div>
            </div>

            {/* Floating accent */}
            <div className="absolute -z-10 -inset-4 bg-gradient-to-tr from-blue-500/10 via-transparent to-emerald-500/10 blur-2xl rounded-3xl" />
        </motion.div>
    );
}

function ScoreBar({ label, value, suffix, color, show, sublabel }: {
    label: string;
    value: number;
    suffix: string;
    color: string;
    show: boolean;
    sublabel?: string;
}) {
    return (
        <div>
            <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wide text-sentinel-500">{label}</span>
                <span className="text-sm font-bold font-mono" style={{ color }}>
                    {value}
                    <span className="text-[10px] text-sentinel-500 ml-0.5">{suffix}</span>
                </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                    className="h-full rounded-full"
                    style={{ background: color }}
                    initial={{ width: 0 }}
                    animate={{ width: show ? `${value}%` : 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                />
            </div>
            {sublabel && <span className="block mt-1 text-[9px] font-mono text-sentinel-600">{sublabel}</span>}
        </div>
    );
}
