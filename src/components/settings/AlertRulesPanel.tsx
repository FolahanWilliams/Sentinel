/**
 * AlertRulesPanel — Configure alert rules for high-conviction signals.
 *
 * Rules are stored in localStorage. When a signal matches a rule,
 * it dispatches via NotificationService.sendSignalAlert().
 */

import { useState, useEffect } from 'react';
import { Bell, BellOff, X, Plus, Zap, Clock, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AlertRule } from '@/utils/alertRules';

const STORAGE_KEY = 'sentinel_alert_rules';

const SECTORS = [
    'All Sectors',
    'Technology',
    'Healthcare',
    'Finance',
    'Energy',
    'Consumer',
    'Industrial',
    'Real Estate',
    'Communications',
    'Utilities',
    'Materials',
];

export function AlertRulesPanel() {
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [isAdding, setIsAdding] = useState(false);

    const [newRule, setNewRule] = useState({
        sector: 'All Sectors',
        minConfidence: 80,
        signalType: 'all' as const,
        bias: 'all' as const,
        tickersInput: '',
        timeWindowStart: '' as string,
        timeWindowEnd: '' as string,
        cooldownMinutes: 0,
    });

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setRules(JSON.parse(stored));
            }
        } catch (e) {
            console.error('Failed to parse rules from local storage', e);
        }
    }, []);

    const saveRules = (updatedRules: AlertRule[]) => {
        setRules(updatedRules);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedRules));
    };

    const handleAddRule = (e: React.FormEvent) => {
        e.preventDefault();

        const parsedTickers = newRule.tickersInput
            .split(',')
            .map(t => t.trim().toUpperCase())
            .filter(t => t.length > 0);

        const rule: AlertRule = {
            id: Math.random().toString(36).substring(2, 9),
            enabled: true,
            sector: newRule.sector,
            minConfidence: newRule.minConfidence,
            signalType: newRule.signalType,
            bias: newRule.bias,
            createdAt: Date.now(),
            tickers: parsedTickers,
            timeWindowStart: newRule.timeWindowStart || null,
            timeWindowEnd: newRule.timeWindowEnd || null,
            cooldownMinutes: newRule.cooldownMinutes,
        };

        const updated = [...rules, rule];
        saveRules(updated);
        setIsAdding(false);
        setNewRule({ sector: 'All Sectors', minConfidence: 80, signalType: 'all', bias: 'all', tickersInput: '', timeWindowStart: '', timeWindowEnd: '', cooldownMinutes: 0 });
    };

    const toggleRule = (id: string) => {
        const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
        saveRules(updated);
    };

    const deleteRule = (id: string) => {
        const updated = rules.filter(r => r.id !== id);
        saveRules(updated);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                    <h2 className="text-lg font-semibold text-sentinel-200 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-amber-400" /> Alert Rules
                    </h2>
                    <p className="text-xs text-sentinel-500 mt-1">
                        Get notified via email when high-conviction signals match your criteria.
                    </p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg text-sm font-medium transition-colors border-none cursor-pointer whitespace-nowrap"
                >
                    {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {isAdding ? 'Cancel' : 'New Rule'}
                </button>
            </div>

            <AnimatePresence>
                {isAdding && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <form onSubmit={handleAddRule} className="bg-sentinel-950/50 p-5 rounded-lg border border-purple-500/30 space-y-4 mb-4 backdrop-blur-sm">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                                <div>
                                    <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1.5">Sector</label>
                                    <select
                                        value={newRule.sector}
                                        onChange={e => setNewRule({ ...newRule, sector: e.target.value })}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                    >
                                        {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1.5">Signal Type</label>
                                    <select
                                        value={newRule.signalType}
                                        onChange={e => setNewRule({ ...newRule, signalType: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                    >
                                        <option value="all">Any Type</option>
                                        <option value="overreaction">Overreaction</option>
                                        <option value="contagion">Contagion</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1.5">Bias</label>
                                    <select
                                        value={newRule.bias}
                                        onChange={e => setNewRule({ ...newRule, bias: e.target.value as any })}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                    >
                                        <option value="all">Any Bias</option>
                                        <option value="bullish">Bullish</option>
                                        <option value="bearish">Bearish</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1.5">Min Confidence: {newRule.minConfidence}%</label>
                                    <input
                                        type="range"
                                        min={50}
                                        max={100}
                                        step={5}
                                        value={newRule.minConfidence}
                                        onChange={e => setNewRule({ ...newRule, minConfidence: Number(e.target.value) })}
                                        className="w-full h-8 accent-purple-500"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-1">
                                <div className="sm:col-span-2">
                                    <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1.5">Tickers (comma-separated)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. AAPL, TSLA, NVDA — leave blank for all"
                                        value={newRule.tickersInput}
                                        onChange={e => setNewRule({ ...newRule, tickersInput: e.target.value })}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors placeholder:text-sentinel-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Active From (EST)</label>
                                    <input
                                        type="time"
                                        value={newRule.timeWindowStart}
                                        onChange={e => setNewRule({ ...newRule, timeWindowStart: e.target.value })}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Clock className="w-3 h-3" /> Active Until (EST)</label>
                                    <input
                                        type="time"
                                        value={newRule.timeWindowEnd}
                                        onChange={e => setNewRule({ ...newRule, timeWindowEnd: e.target.value })}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-1">
                                <div>
                                    <label className="block text-[10px] text-sentinel-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Timer className="w-3 h-3" /> Cooldown</label>
                                    <select
                                        value={newRule.cooldownMinutes}
                                        onChange={e => setNewRule({ ...newRule, cooldownMinutes: Number(e.target.value) })}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-800 rounded-lg text-sm text-sentinel-100 outline-none focus:border-purple-500/50 transition-colors"
                                    >
                                        <option value={0}>No cooldown</option>
                                        <option value={15}>15 minutes</option>
                                        <option value={30}>30 minutes</option>
                                        <option value={60}>1 hour</option>
                                        <option value={120}>2 hours</option>
                                        <option value={240}>4 hours</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end pt-3 border-t border-sentinel-800/50 mt-4">
                                <button type="submit" className="flex items-center gap-1.5 px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors border-none cursor-pointer shadow-lg shadow-purple-500/20">
                                    <Zap className="w-3.5 h-3.5" /> Save Rule
                                </button>
                            </div>
                        </form>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-3">
                {rules.length === 0 && !isAdding ? (
                    <div className="text-center py-10 bg-sentinel-950/20 border border-sentinel-800/30 rounded-xl rounded-lg border-dashed">
                        <Bell className="w-8 h-8 text-sentinel-700 mx-auto mb-3" />
                        <p className="text-sm text-sentinel-400">No alert rules configured.</p>
                        <p className="text-xs text-sentinel-500 mt-1">Create a rule to receive email notifications when critical signals match.</p>
                        <button
                            onClick={() => setIsAdding(true)}
                            className="mt-4 px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-200 rounded-lg text-xs font-medium transition-colors border-none cursor-pointer mx-auto block"
                        >
                            Create First Rule
                        </button>
                    </div>
                ) : (
                    rules.map(rule => (
                        <motion.div
                            key={rule.id}
                            layout
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-colors ${rule.enabled ? 'bg-sentinel-900/40 border-sentinel-800/60 shadow-sm' : 'bg-sentinel-950/30 border-sentinel-900/50 opacity-60'}`}
                        >
                            <div className="flex items-start gap-4 flex-1">
                                <button
                                    onClick={() => toggleRule(rule.id)}
                                    className={`mt-1 p-2 rounded-full transition-colors cursor-pointer border-none flex-shrink-0 ${rule.enabled ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' : 'bg-sentinel-800 text-sentinel-500 hover:text-sentinel-300'}`}
                                    title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                                >
                                    {rule.enabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
                                </button>

                                <div>
                                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                        {rule.sector !== 'All Sectors' && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-sentinel-800/80 text-sentinel-300 ring-1 ring-sentinel-700/50">Sector: {rule.sector}</span>
                                        )}
                                        {rule.signalType !== 'all' && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-sentinel-800/80 text-sentinel-300 ring-1 ring-sentinel-700/50 capitalize">Type: {rule.signalType}</span>
                                        )}
                                        {rule.bias !== 'all' && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-sentinel-800/80 text-sentinel-300 ring-1 ring-sentinel-700/50 capitalize">Bias: {rule.bias}</span>
                                        )}
                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20">Min Conf: {rule.minConfidence}%</span>

                                        {rule.sector === 'All Sectors' && rule.signalType === 'all' && rule.bias === 'all' && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-sentinel-800/80 text-sentinel-300 ring-1 ring-sentinel-700/50">Global Market Filter</span>
                                        )}
                                        {(rule.tickers ?? []).length > 0 && (rule.tickers ?? []).map(t => (
                                            <span key={t} className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">{t}</span>
                                        ))}
                                        {rule.timeWindowStart && rule.timeWindowEnd && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20 flex items-center gap-1">
                                                <Clock className="w-2.5 h-2.5" /> {rule.timeWindowStart} – {rule.timeWindowEnd} EST
                                            </span>
                                        )}
                                        {(rule.cooldownMinutes ?? 0) > 0 && (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20 flex items-center gap-1">
                                                <Timer className="w-2.5 h-2.5" /> {rule.cooldownMinutes >= 60 ? `${rule.cooldownMinutes / 60}h` : `${rule.cooldownMinutes}m`} cooldown
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-sentinel-400 leading-relaxed">
                                        Alert when <strong className="text-sentinel-300">{rule.bias !== 'all' ? rule.bias : 'any'}</strong> {rule.signalType !== 'all' ? rule.signalType : 'signal'}
                                        {rule.sector !== 'All Sectors' ? ` in ${rule.sector}` : ''} exceeds {rule.minConfidence}% confidence{(rule.tickers ?? []).length > 0 ? ` for ${(rule.tickers ?? []).join(', ')}` : ''}.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={() => deleteRule(rule.id)}
                                className="mt-4 sm:mt-0 p-2 text-sentinel-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer bg-transparent border-none self-end sm:self-auto"
                                title="Delete rule"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </motion.div>
                    ))
                )}
            </div>
        </div>
    );
}
