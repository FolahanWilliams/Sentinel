/**
 * AlertRulesPanel — Configure alert rules for high-conviction signals.
 *
 * Rules are stored in localStorage. When a signal matches a rule,
 * it dispatches via NotificationService.sendSignalAlert().
 */

import { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, ToggleLeft, ToggleRight, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface AlertRule {
    id: string;
    sector: string;
    minConfidence: number;
    signalType: 'all' | 'overreaction' | 'contagion';
    enabled: boolean;
    createdAt: string;
}

const STORAGE_KEY = 'sentinel_alert_rules';

function loadRules(): AlertRule[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
}

function saveRules(rules: AlertRule[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

const SECTORS = [
    'All Sectors', 'Technology', 'Healthcare', 'Finance', 'Energy',
    'Consumer', 'Industrial', 'Real Estate', 'Communications', 'Utilities', 'Materials',
];

export function AlertRulesPanel() {
    const [rules, setRules] = useState<AlertRule[]>(loadRules);
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [sector, setSector] = useState('All Sectors');
    const [minConfidence, setMinConfidence] = useState(80);
    const [signalType, setSignalType] = useState<'all' | 'overreaction' | 'contagion'>('all');

    // Persist on change
    useEffect(() => { saveRules(rules); }, [rules]);

    const handleAdd = () => {
        const newRule: AlertRule = {
            id: crypto.randomUUID(),
            sector,
            minConfidence,
            signalType,
            enabled: true,
            createdAt: new Date().toISOString(),
        };
        setRules(prev => [...prev, newRule]);
        setShowForm(false);
        setSector('All Sectors');
        setMinConfidence(80);
        setSignalType('all');
    };

    const toggleRule = (id: string) => {
        setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
    };

    const deleteRule = (id: string) => {
        setRules(prev => prev.filter(r => r.id !== id));
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-sentinel-200 flex items-center gap-2">
                    <Bell className="w-5 h-5 text-amber-400" /> Alert Rules
                </h2>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/15 text-purple-400 rounded-lg text-xs font-medium ring-1 ring-purple-500/30 hover:bg-purple-500/25 transition-colors cursor-pointer border-none"
                >
                    <Plus className="w-3.5 h-3.5" /> New Rule
                </button>
            </div>

            <p className="text-xs text-sentinel-500">
                Get notified when signals matching your criteria are generated.
            </p>

            {/* Create Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-4 space-y-3"
                    >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Sector</label>
                                <select
                                    value={sector}
                                    onChange={e => setSector(e.target.value)}
                                    className="w-full px-2.5 py-2 bg-sentinel-950 border border-sentinel-800 rounded-lg text-xs text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                >
                                    {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">Signal Type</label>
                                <select
                                    value={signalType}
                                    onChange={e => setSignalType(e.target.value as any)}
                                    className="w-full px-2.5 py-2 bg-sentinel-950 border border-sentinel-800 rounded-lg text-xs text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                >
                                    <option value="all">All Types</option>
                                    <option value="overreaction">Overreaction</option>
                                    <option value="contagion">Contagion</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1">
                                    Min Confidence: {minConfidence}%
                                </label>
                                <input
                                    type="range" min={50} max={100} step={5}
                                    value={minConfidence}
                                    onChange={e => setMinConfidence(Number(e.target.value))}
                                    className="w-full accent-purple-500 mt-1"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowForm(false)}
                                className="px-3 py-1.5 text-xs text-sentinel-400 hover:text-sentinel-200 transition-colors cursor-pointer bg-transparent border-none"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAdd}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-xs font-semibold cursor-pointer border-none shadow-lg shadow-purple-500/20"
                            >
                                <Zap className="w-3 h-3" /> Create Rule
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Rules List */}
            {rules.length === 0 ? (
                <div className="text-center py-8">
                    <Bell className="w-8 h-8 text-sentinel-700 mx-auto mb-2" />
                    <p className="text-sm text-sentinel-500">No alert rules configured.</p>
                    <p className="text-xs text-sentinel-600 mt-1">Create a rule to get notified about high-conviction signals.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {rules.map(rule => (
                        <motion.div
                            key={rule.id}
                            layout
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${rule.enabled
                                    ? 'bg-sentinel-900/50 border-sentinel-800/50'
                                    : 'bg-sentinel-950/50 border-sentinel-800/30 opacity-50'
                                }`}
                        >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                <button
                                    onClick={() => toggleRule(rule.id)}
                                    className="text-sentinel-400 hover:text-purple-400 transition-colors cursor-pointer bg-transparent border-none p-0 flex-shrink-0"
                                    title={rule.enabled ? 'Disable' : 'Enable'}
                                >
                                    {rule.enabled ? (
                                        <ToggleRight className="w-5 h-5 text-purple-400" />
                                    ) : (
                                        <ToggleLeft className="w-5 h-5" />
                                    )}
                                </button>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs text-sentinel-300 font-medium">
                                            {rule.sector === 'All Sectors' ? 'Any sector' : rule.sector}
                                        </span>
                                        <span className="text-[10px] text-sentinel-500">•</span>
                                        <span className="text-xs text-sentinel-400 font-mono">
                                            ≥{rule.minConfidence}% conf
                                        </span>
                                        {rule.signalType !== 'all' && (
                                            <>
                                                <span className="text-[10px] text-sentinel-500">•</span>
                                                <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 text-[10px] rounded capitalize">
                                                    {rule.signalType}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => deleteRule(rule.id)}
                                className="text-sentinel-600 hover:text-red-400 transition-colors cursor-pointer bg-transparent border-none p-1 flex-shrink-0"
                                title="Delete rule"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Check a signal against stored alert rules.
 * Returns matching rules (if any).
 */
export function getMatchingAlertRules(signal: {
    sector?: string;
    confidence_score?: number;
    signal_type?: string;
}): AlertRule[] {
    const rules = loadRules().filter(r => r.enabled);
    return rules.filter(rule => {
        // Sector match
        if (rule.sector !== 'All Sectors') {
            const sector = (signal.sector || '').toLowerCase();
            if (!sector.includes(rule.sector.toLowerCase())) return false;
        }
        // Confidence match
        if ((signal.confidence_score || 0) < rule.minConfidence) return false;
        // Type match
        if (rule.signalType !== 'all') {
            const type = (signal.signal_type || '').toLowerCase();
            if (!type.includes(rule.signalType)) return false;
        }
        return true;
    });
}
