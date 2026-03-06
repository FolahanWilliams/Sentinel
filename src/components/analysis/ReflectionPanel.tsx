/**
 * ReflectionPanel — Self-Learning Control Panel
 *
 * Displays the AI's learned lessons from past signal outcomes.
 * Allows manual triggering of the Reflection Agent.
 * Shows: last run timestamp, outcomes analyzed, generated rules with severity.
 */

import { useState, useEffect } from 'react';
import {
    Brain, RefreshCw, AlertTriangle, Info, AlertCircle,
    CheckCircle2, Clock, BarChart3, Loader2
} from 'lucide-react';
import { ReflectionAgent } from '@/services/reflectionAgent';
import { ConfidenceCalibrator } from '@/services/confidenceCalibrator';
import type { ReflectionResult, LessonRule } from '@/services/reflectionAgent';
import { motion } from 'framer-motion';

export function ReflectionPanel() {
    const [reflection, setReflection] = useState<ReflectionResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadReflection();
    }, []);

    async function loadReflection() {
        setLoading(true);
        try {
            const stored = await ReflectionAgent.getStoredReflection();
            setReflection(stored);
        } catch {
            // No stored reflection yet
        }
        setLoading(false);
    }

    async function handleRunReflection() {
        setRunning(true);
        setError(null);
        try {
            // Run reflection and calibration in parallel
            const [result] = await Promise.all([
                ReflectionAgent.runReflection(),
                ConfidenceCalibrator.buildCalibrationCurve().catch(err => {
                    console.warn('[ReflectionPanel] Calibration update failed (non-fatal):', err);
                    return null;
                }),
            ]);
            setReflection(result);
        } catch (err: any) {
            setError(err.message || 'Failed to run reflection');
        }
        setRunning(false);
    }

    const severityIcon = (severity: LessonRule['severity']) => {
        switch (severity) {
            case 'critical': return <AlertCircle className="w-4 h-4 text-red-400" />;
            case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
            default: return <Info className="w-4 h-4 text-blue-400" />;
        }
    };

    const severityBg = (severity: LessonRule['severity']) => {
        switch (severity) {
            case 'critical': return 'bg-red-500/10 border-red-500/20';
            case 'warning': return 'bg-amber-500/10 border-amber-500/20';
            default: return 'bg-blue-500/10 border-blue-500/20';
        }
    };

    return (
        <div className="glass-panel overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-sentinel-800/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Brain className="w-5 h-5 text-purple-400" />
                    <div>
                        <h2 className="text-sm font-semibold text-sentinel-200 uppercase tracking-wider">Self-Learning Engine</h2>
                        <p className="text-xs text-sentinel-500 mt-0.5">AI-generated rules from past signal performance</p>
                    </div>
                </div>
                <button
                    onClick={handleRunReflection}
                    disabled={running}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded-lg text-xs font-medium transition-colors cursor-pointer border border-purple-500/20 hover:border-purple-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {running ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {running ? 'Analyzing...' : 'Run Reflection'}
                </button>
            </div>

            {/* Content */}
            <div className="p-5">
                {loading ? (
                    <div className="flex items-center justify-center py-8 text-sentinel-500">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Loading reflection data...
                    </div>
                ) : error ? (
                    <div className="flex items-center gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                    </div>
                ) : !reflection || reflection.lessons.length === 0 ? (
                    <div className="text-center py-8">
                        <Brain className="w-10 h-10 text-sentinel-700 mx-auto mb-3" />
                        <p className="text-sm text-sentinel-400">No lessons generated yet.</p>
                        <p className="text-xs text-sentinel-600 mt-1">
                            At least 5 signal outcomes are needed. Click "Run Reflection" to analyze.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Stats Row */}
                        <div className="flex items-center gap-6 text-xs text-sentinel-400">
                            <span className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                Last run: {new Date(reflection.generated_at).toLocaleDateString()} at{' '}
                                {new Date(reflection.generated_at).toLocaleTimeString()}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <BarChart3 className="w-3.5 h-3.5" />
                                {reflection.outcomes_analyzed} outcomes analyzed
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                                {reflection.lessons.length} rules generated
                            </span>
                        </div>

                        {/* Lessons */}
                        <div className="space-y-2">
                            {reflection.lessons.map((lesson, idx) => (
                                <motion.div
                                    key={lesson.id || idx}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={`p-3 rounded-lg border ${severityBg(lesson.severity)}`}
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5">{severityIcon(lesson.severity)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-sentinel-200 leading-relaxed">{lesson.rule}</p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-sentinel-500">
                                                <span className="font-mono">{lesson.bias_type}</span>
                                                <span>•</span>
                                                <span>{lesson.sector}</span>
                                                <span>•</span>
                                                <span className={Number(lesson.win_rate) < 30 ? 'text-red-400' : Number(lesson.win_rate) < 50 ? 'text-amber-400' : 'text-emerald-400'}>
                                                    {Number(lesson.win_rate).toFixed(0)}% win rate
                                                </span>
                                                <span>•</span>
                                                <span>n={lesson.sample_size}</span>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
