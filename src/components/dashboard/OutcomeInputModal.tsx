/**
 * Sentinel — Outcome Input Modal
 *
 * Modal for logging the actual outcome of a signal decision.
 * Captures: result, notes, confirmed biases, and lessons learned.
 */

import { useState } from 'react';
import { supabase } from '@/config/supabase';
import { X, CheckCircle2, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { BIAS_LABELS } from '@/utils/biasHelpers';
import type { Signal, SignalOutcome } from '@/types/signals';

interface OutcomeInputModalProps {
    signal: Signal;
    outcome: SignalOutcome | null;
    onClose: () => void;
    onSaved: () => void;
}

const RESULT_OPTIONS = [
    { value: 'win', label: 'Win', icon: TrendingUp, color: 'emerald' },
    { value: 'loss', label: 'Loss', icon: TrendingDown, color: 'red' },
    { value: 'breakeven', label: 'Breakeven', icon: AlertTriangle, color: 'amber' },
] as const;

export function OutcomeInputModal({ signal, outcome, onClose, onSaved }: OutcomeInputModalProps) {
    const [result, setResult] = useState<string>(outcome?.user_reported_result || '');
    const [notes, setNotes] = useState(outcome?.user_outcome_notes || '');
    const [confirmedBiases, setConfirmedBiases] = useState<string[]>(outcome?.confirmed_biases || []);
    const [lessons, setLessons] = useState(outcome?.lessons_learned || '');
    const [saving, setSaving] = useState(false);

    // Get biases that were detected for this signal
    const detectedBiases: string[] = [];
    if (signal.bias_type) detectedBiases.push(signal.bias_type);
    if (signal.secondary_biases?.length) detectedBiases.push(...signal.secondary_biases);
    const biasFindings = signal.agent_outputs?.bias_detective?.findings || [];

    const toggleBias = (bias: string) => {
        setConfirmedBiases(prev =>
            prev.includes(bias) ? prev.filter(b => b !== bias) : [...prev, bias]
        );
    };

    const handleSave = async () => {
        if (!result) return;
        setSaving(true);
        try {
            // Update signal_outcomes with user input
            if (outcome) {
                await supabase.from('signal_outcomes').update({
                    user_reported_result: result,
                    user_outcome_notes: notes || null,
                    confirmed_biases: confirmedBiases.length > 0 ? confirmedBiases : null,
                    lessons_learned: lessons || null,
                }).eq('id', outcome.id);
            }

            // Mark signal as outcome_logged
            await supabase.from('signals').update({
                outcome_status: 'outcome_logged',
            }).eq('id', signal.id);

            onSaved();
        } catch (err) {
            console.error('[OutcomeInputModal] Save failed:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-sentinel-900 rounded-2xl ring-1 ring-sentinel-700/50 shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-sentinel-800/50">
                    <div>
                        <h3 className="text-lg font-bold text-sentinel-100">Log Outcome</h3>
                        <p className="text-xs text-sentinel-500 mt-0.5">
                            {signal.ticker} — {signal.thesis?.slice(0, 60)}...
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-sentinel-800 rounded-lg transition-colors border-none cursor-pointer text-sentinel-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-5">
                    {/* Result Selection */}
                    <div>
                        <label className="text-xs font-medium text-sentinel-400 uppercase tracking-wider mb-2 block">
                            What was the result?
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {RESULT_OPTIONS.map(opt => {
                                const Icon = opt.icon;
                                const isSelected = result === opt.value;
                                return (
                                    <button
                                        key={opt.value}
                                        onClick={() => setResult(opt.value)}
                                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl ring-1 transition-all border-none cursor-pointer ${
                                            isSelected
                                                ? `bg-${opt.color}-500/15 ring-${opt.color}-500/50 text-${opt.color}-400`
                                                : 'bg-sentinel-800/50 ring-sentinel-700/30 text-sentinel-400 hover:ring-sentinel-600/50'
                                        }`}
                                    >
                                        <Icon className="w-5 h-5" />
                                        <span className="text-sm font-medium">{opt.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-xs font-medium text-sentinel-400 uppercase tracking-wider mb-2 block">
                            What happened? (optional)
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Describe the outcome — what drove the result?"
                            rows={3}
                            className="w-full bg-sentinel-800/50 text-sentinel-200 rounded-xl p-3 text-sm ring-1 ring-sentinel-700/30 focus:ring-sentinel-500/50 focus:outline-none resize-none placeholder:text-sentinel-600"
                        />
                    </div>

                    {/* Confirmed Biases */}
                    {(detectedBiases.length > 0 || biasFindings.length > 0) && (
                        <div>
                            <label className="text-xs font-medium text-sentinel-400 uppercase tracking-wider mb-2 block">
                                Which detected biases actually affected the outcome?
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[...new Set([...detectedBiases, ...biasFindings.map((f: { bias_name: string }) => f.bias_name)])].map(bias => {
                                    const isConfirmed = confirmedBiases.includes(bias);
                                    const label = BIAS_LABELS[bias as keyof typeof BIAS_LABELS] || bias;
                                    return (
                                        <button
                                            key={bias}
                                            onClick={() => toggleBias(bias)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border-none cursor-pointer ${
                                                isConfirmed
                                                    ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/40'
                                                    : 'bg-sentinel-800/50 text-sentinel-400 ring-1 ring-sentinel-700/30 hover:ring-sentinel-600/50'
                                            }`}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Lessons Learned */}
                    <div>
                        <label className="text-xs font-medium text-sentinel-400 uppercase tracking-wider mb-2 block">
                            Key lesson (optional)
                        </label>
                        <textarea
                            value={lessons}
                            onChange={e => setLessons(e.target.value)}
                            placeholder="What would you do differently next time?"
                            rows={2}
                            className="w-full bg-sentinel-800/50 text-sentinel-200 rounded-xl p-3 text-sm ring-1 ring-sentinel-700/30 focus:ring-sentinel-500/50 focus:outline-none resize-none placeholder:text-sentinel-600"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 p-5 border-t border-sentinel-800/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm text-sentinel-400 hover:text-sentinel-200 transition-colors border-none cursor-pointer bg-transparent"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!result || saving}
                        className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors border-none cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                        <CheckCircle2 className="w-4 h-4" />
                        {saving ? 'Saving...' : 'Log Outcome'}
                    </button>
                </div>
            </div>
        </div>
    );
}
