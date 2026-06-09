/**
 * PipelineFlow — the marquee visualization.
 *
 * A live signal token travels through the 5-agent pipeline, lighting each agent
 * as it passes, then hits Red Team — which alternately KILLS the signal or lets
 * it FIRE. Loops continuously. Under reduced-motion it renders a static, fully
 * lit pipeline with no token animation.
 *
 * `detailed` renders each agent's longer role text (used on the /about cut).
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldX, Zap } from 'lucide-react';
import { PIPELINE_AGENTS } from './landingContent';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const N = PIPELINE_AGENTS.length;
const FRAME_MS = 820;
/** Frames per loop: 5 agent steps (0-4) + verdict hold (5) + reset gap (6). */
const FRAMES = N + 2;

/** Horizontal center of node i as a percentage of the track width. */
function nodeCenterPct(i: number): number {
    return ((i + 0.5) / N) * 100;
}

interface PipelineFlowProps {
    detailed?: boolean;
}

export function PipelineFlow({ detailed = false }: PipelineFlowProps) {
    const reducedMotion = useReducedMotion();
    const [frame, setFrame] = useState(0);
    const [verdict, setVerdict] = useState<'fire' | 'kill'>('fire');
    const cycleRef = useRef(0);

    useEffect(() => {
        if (reducedMotion) return;
        const id = setInterval(() => {
            setFrame(prev => {
                const next = (prev + 1) % FRAMES;
                if (next === N) {
                    // Entering the verdict frame — alternate fire / kill each loop.
                    setVerdict(cycleRef.current % 2 === 0 ? 'fire' : 'kill');
                    cycleRef.current += 1;
                }
                return next;
            });
        }, FRAME_MS);
        return () => clearInterval(id);
    }, [reducedMotion]);

    // Derived state for the current frame.
    const atVerdict = frame === N;
    const inGap = frame === N + 1;
    const tokenIndex = Math.min(frame, N - 1);
    const litUpTo = reducedMotion ? N - 1 : inGap ? -1 : atVerdict ? N - 1 : frame;
    const fillPct = reducedMotion ? 100 : litUpTo < 0 ? 0 : nodeCenterPct(litUpTo);
    const killed = atVerdict && verdict === 'kill';

    return (
        <div className="w-full">
            {/* Track + nodes */}
            <div className="relative" style={{ paddingTop: 8, paddingBottom: 8 }}>
                {/* Base track */}
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-sentinel-700/60" style={{ top: 28 }} />
                {/* Energized fill */}
                <motion.div
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-px"
                    style={{
                        top: 28,
                        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6, #10b981)',
                        boxShadow: '0 0 8px rgba(139,92,246,0.6)',
                    }}
                    animate={{ width: `${fillPct}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />

                {/* Traveling signal token */}
                <AnimatePresence>
                    {!reducedMotion && !inGap && (
                        <motion.div
                            key="token"
                            className="absolute z-20"
                            style={{ top: 28, marginTop: -7 }}
                            initial={{ opacity: 0 }}
                            animate={{
                                left: `${nodeCenterPct(tokenIndex)}%`,
                                opacity: 1,
                            }}
                            exit={{ opacity: 0 }}
                            transition={{ left: { duration: 0.5, ease: 'easeInOut' }, opacity: { duration: 0.2 } }}
                        >
                            <div
                                className="w-3.5 h-3.5 rounded-full -translate-x-1/2"
                                style={{
                                    background: killed ? '#ef4444' : '#fff',
                                    boxShadow: killed
                                        ? '0 0 14px 3px rgba(239,68,68,0.8)'
                                        : '0 0 14px 3px rgba(255,255,255,0.7)',
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Nodes */}
                <div className="relative flex">
                    {PIPELINE_AGENTS.map((agent, i) => {
                        const lit = i <= litUpTo;
                        const isVerdictNode = atVerdict && i === N - 1;
                        return (
                            <div key={agent.name} className="flex-1 flex flex-col items-center text-center px-1">
                                <motion.div
                                    className="relative flex items-center justify-center rounded-full"
                                    style={{
                                        width: 56,
                                        height: 56,
                                        background: lit ? `${agent.color}1f` : 'rgba(255,255,255,0.02)',
                                        border: `1px solid ${lit ? agent.color : 'rgba(255,255,255,0.08)'}`,
                                    }}
                                    animate={{
                                        scale: (frame === i && !reducedMotion) || isVerdictNode ? 1.12 : 1,
                                        boxShadow: lit
                                            ? `0 0 22px ${agent.color}55`
                                            : '0 0 0px rgba(0,0,0,0)',
                                    }}
                                    transition={{ duration: 0.4 }}
                                >
                                    <span
                                        className="font-mono text-[10px] font-bold"
                                        style={{ color: lit ? agent.color : '#475569' }}
                                    >
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                </motion.div>
                                <span
                                    className="mt-3 text-xs font-semibold transition-colors"
                                    style={{ color: lit ? '#e2e8f0' : '#64748b' }}
                                >
                                    {agent.name}
                                </span>
                                <span className="mt-0.5 text-[10px] font-mono tracking-wide" style={{ color: lit ? agent.color : '#475569' }}>
                                    {agent.tag}
                                </span>
                                {detailed && (
                                    <span className="mt-2 text-[11px] leading-snug text-sentinel-500 max-w-[160px]">
                                        {agent.detail}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Verdict banner */}
            <div className="h-9 mt-4 flex items-center justify-center">
                <AnimatePresence mode="wait">
                    {(atVerdict || reducedMotion) && (
                        <motion.div
                            key={reducedMotion ? 'static' : verdict}
                            initial={{ opacity: 0, y: 6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -6, scale: 0.96 }}
                            transition={{ duration: 0.3 }}
                            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold"
                            style={
                                killed
                                    ? { background: 'rgba(239,68,68,0.12)', color: '#ef4444', boxShadow: '0 0 0 1px rgba(239,68,68,0.3)' }
                                    : { background: 'rgba(16,185,129,0.12)', color: '#10b981', boxShadow: '0 0 0 1px rgba(16,185,129,0.3)' }
                            }
                        >
                            {killed ? (
                                <>
                                    <ShieldX className="w-3.5 h-3.5" />
                                    Red Team killed the signal — fatal flaw
                                </>
                            ) : (
                                <>
                                    <Zap className="w-3.5 h-3.5" />
                                    Signal cleared all 5 agents — fired & logged
                                </>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
