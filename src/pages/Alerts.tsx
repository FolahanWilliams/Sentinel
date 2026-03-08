/**
 * Alerts — Configurable Price & Signal Alert Rules
 *
 * Users can create alert rules per ticker for price thresholds,
 * volume spikes, and signal events. Integrates with BrowserNotificationService
 * for real-time push notifications.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Bell, Plus, X, Trash2, ToggleLeft, ToggleRight,
    TrendingUp, TrendingDown, Activity, Volume2,
    CheckCircle2, AlertTriangle, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrowserNotificationService, NotificationPreferences } from '@/services/browserNotifications';
import { EmptyState } from '@/components/shared/EmptyState';

// ─── Types ───

type AlertCondition = 'price_above' | 'price_below' | 'change_pct_up' | 'change_pct_down' | 'volume_spike';

interface AlertRule {
    id: string;
    ticker: string;
    condition: AlertCondition;
    value: number;
    enabled: boolean;
    createdAt: number;
    lastTriggered: number | null;
    triggerCount: number;
}

const ALERT_STORAGE_KEY = 'sentinel_alert_rules';

const CONDITION_LABELS: Record<AlertCondition, string> = {
    price_above: 'Price above',
    price_below: 'Price below',
    change_pct_up: 'Daily change above %',
    change_pct_down: 'Daily change below %',
    volume_spike: 'Volume spike above %',
};

const CONDITION_ICONS: Record<AlertCondition, typeof TrendingUp> = {
    price_above: TrendingUp,
    price_below: TrendingDown,
    change_pct_up: Zap,
    change_pct_down: AlertTriangle,
    volume_spike: Volume2,
};

const CONDITION_COLORS: Record<AlertCondition, string> = {
    price_above: 'text-emerald-400',
    price_below: 'text-red-400',
    change_pct_up: 'text-emerald-400',
    change_pct_down: 'text-red-400',
    volume_spike: 'text-amber-400',
};

// ─── Persistence ───

function loadRules(): AlertRule[] {
    try {
        const stored = localStorage.getItem(ALERT_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
}

function saveRules(rules: AlertRule[]) {
    localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(rules));
}

// ─── Component ───

export function Alerts() {
    const [rules, setRules] = useState<AlertRule[]>(loadRules);
    const [showForm, setShowForm] = useState(false);
    const [prefs, setPrefs] = useState<NotificationPreferences>(BrowserNotificationService.getPreferences);
    const [permission, setPermission] = useState<NotificationPermission>('default');
    const [history] = useState(() => BrowserNotificationService.getHistory());

    // Form state
    const [ticker, setTicker] = useState('');
    const [condition, setCondition] = useState<AlertCondition>('price_above');
    const [value, setValue] = useState('');

    useEffect(() => {
        setPermission(BrowserNotificationService.getPermission());
    }, []);

    const requestPermission = async () => {
        const result = await BrowserNotificationService.requestPermission();
        setPermission(result);
    };

    const addRule = useCallback(() => {
        if (!ticker.trim() || !value.trim()) return;
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return;

        const newRule: AlertRule = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            ticker: ticker.toUpperCase().trim(),
            condition,
            value: numValue,
            enabled: true,
            createdAt: Date.now(),
            lastTriggered: null,
            triggerCount: 0,
        };

        const updated = [newRule, ...rules];
        setRules(updated);
        saveRules(updated);
        setTicker('');
        setValue('');
        setShowForm(false);
    }, [ticker, condition, value, rules]);

    const deleteRule = useCallback((id: string) => {
        const updated = rules.filter(r => r.id !== id);
        setRules(updated);
        saveRules(updated);
    }, [rules]);

    const toggleRule = useCallback((id: string) => {
        const updated = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
        setRules(updated);
        saveRules(updated);
    }, [rules]);

    const togglePref = (key: keyof NotificationPreferences) => {
        const updated = { ...prefs, [key]: !prefs[key] };
        setPrefs(updated);
        BrowserNotificationService.savePreferences(updated);
    };

    const activeCount = rules.filter(r => r.enabled).length;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                    <Bell className="w-8 h-8 text-amber-400" />
                    Alerts
                </h1>
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-500/10 text-blue-400 rounded-xl text-sm font-medium hover:bg-blue-500/20 transition-colors cursor-pointer border border-blue-500/20"
                >
                    <Plus className="w-4 h-4" /> New Alert
                </button>
            </div>

            {/* Permission Banner */}
            {permission !== 'granted' && (
                <div className="glass-panel p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                        <span className="text-sentinel-200 text-sm">
                            {permission === 'denied'
                                ? 'Browser notifications are blocked. Enable them in your browser settings.'
                                : 'Enable browser notifications to receive real-time alerts.'}
                        </span>
                    </div>
                    {permission === 'default' && (
                        <button
                            onClick={requestPermission}
                            className="px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-500/30 transition-colors cursor-pointer border-none"
                        >
                            Enable
                        </button>
                    )}
                </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Active Rules', value: activeCount, icon: Activity, color: 'text-blue-400' },
                    { label: 'Total Rules', value: rules.length, icon: Bell, color: 'text-sentinel-300' },
                    { label: 'Triggered Today', value: rules.filter(r => r.lastTriggered && (Date.now() - r.lastTriggered) < 86400000).length, icon: Zap, color: 'text-amber-400' },
                    { label: 'Notifications', value: history.length, icon: CheckCircle2, color: 'text-emerald-400' },
                ].map(({ label, value: val, icon: Icon, color }) => (
                    <div key={label} className="glass-panel p-4 rounded-xl">
                        <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-4 h-4 ${color}`} />
                            <span className="text-xs text-sentinel-400">{label}</span>
                        </div>
                        <span className="text-2xl font-bold text-sentinel-100">{val}</span>
                    </div>
                ))}
            </div>

            {/* Notification Preferences */}
            <div className="glass-panel p-6 rounded-xl">
                <h2 className="text-lg font-semibold text-sentinel-100 mb-4">Notification Preferences</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {([
                        { key: 'enabled' as const, label: 'Master Toggle', desc: 'Enable all browser notifications' },
                        { key: 'signal_new' as const, label: 'New Signals', desc: 'When scanner detects a new signal' },
                        { key: 'price_stop_hit' as const, label: 'Stop Loss Hit', desc: 'Price breaches stop level' },
                        { key: 'price_target_hit' as const, label: 'Target Hit', desc: 'Price reaches target level' },
                        { key: 'convergence_detected' as const, label: 'Convergence', desc: 'Multiple signals converge on a ticker' },
                        { key: 'exposure_breach' as const, label: 'Exposure Breach', desc: 'Portfolio exceeds exposure limit' },
                        { key: 'scanner_high_confidence' as const, label: 'High Confidence', desc: 'Scanner finds high-confidence signal' },
                        { key: 'sound' as const, label: 'Sound', desc: 'Play notification sound' },
                    ]).map(({ key, label, desc }) => (
                        <button
                            key={key}
                            onClick={() => togglePref(key)}
                            className="flex items-center justify-between p-3 rounded-lg bg-sentinel-900/50 hover:bg-sentinel-800/50 transition-colors cursor-pointer border-none text-left w-full"
                        >
                            <div>
                                <span className="text-sm font-medium text-sentinel-200">{label}</span>
                                <p className="text-xs text-sentinel-500 mt-0.5">{desc}</p>
                            </div>
                            {prefs[key] ? (
                                <ToggleRight className="w-6 h-6 text-blue-400 shrink-0" />
                            ) : (
                                <ToggleLeft className="w-6 h-6 text-sentinel-600 shrink-0" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* New Alert Form */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="glass-panel p-6 rounded-xl border border-blue-500/20">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold text-sentinel-100">Create Alert Rule</h2>
                                <button onClick={() => setShowForm(false)} className="text-sentinel-400 hover:text-sentinel-200 cursor-pointer border-none bg-transparent">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1.5">Ticker</label>
                                    <input
                                        type="text"
                                        value={ticker}
                                        onChange={e => setTicker(e.target.value)}
                                        placeholder="AAPL"
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-700 rounded-lg text-sentinel-100 text-sm focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1.5">Condition</label>
                                    <select
                                        value={condition}
                                        onChange={e => setCondition(e.target.value as AlertCondition)}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-700 rounded-lg text-sentinel-100 text-sm focus:outline-none focus:border-blue-500/50"
                                    >
                                        {Object.entries(CONDITION_LABELS).map(([k, label]) => (
                                            <option key={k} value={k}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1.5">
                                        {condition.includes('pct') || condition === 'volume_spike' ? 'Threshold (%)' : 'Price ($)'}
                                    </label>
                                    <input
                                        type="number"
                                        value={value}
                                        onChange={e => setValue(e.target.value)}
                                        placeholder={condition.includes('pct') || condition === 'volume_spike' ? '5' : '150.00'}
                                        step={condition.includes('pct') || condition === 'volume_spike' ? '0.5' : '0.01'}
                                        className="w-full px-3 py-2 bg-sentinel-900 border border-sentinel-700 rounded-lg text-sentinel-100 text-sm focus:outline-none focus:border-blue-500/50"
                                    />
                                </div>
                                <div className="flex items-end">
                                    <button
                                        onClick={addRule}
                                        disabled={!ticker.trim() || !value.trim()}
                                        className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors cursor-pointer border-none disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        Add Rule
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Alert Rules List */}
            {rules.length === 0 ? (
                <EmptyState
                    icon={<Bell className="w-10 h-10" />}
                    title="No alert rules"
                    description="Create your first alert rule to get notified when price targets are hit, volume spikes, or signals fire."
                    action={
                        <button
                            onClick={() => setShowForm(true)}
                            className="px-4 py-2 bg-blue-500/10 text-blue-400 rounded-xl text-sm font-medium hover:bg-blue-500/20 transition-colors cursor-pointer border border-blue-500/20"
                        >
                            Create Alert
                        </button>
                    }
                />
            ) : (
                <div className="space-y-2">
                    {rules.map(rule => {
                        const CondIcon = CONDITION_ICONS[rule.condition];
                        const colorClass = CONDITION_COLORS[rule.condition];

                        return (
                            <motion.div
                                key={rule.id}
                                layout
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className={`glass-panel p-4 rounded-xl flex items-center justify-between gap-4 ${
                                    !rule.enabled ? 'opacity-50' : ''
                                }`}
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className={`p-2 rounded-lg bg-sentinel-800/50 ${colorClass}`}>
                                        <CondIcon className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-bold text-sentinel-100">{rule.ticker}</span>
                                            <span className="text-xs text-sentinel-400">
                                                {CONDITION_LABELS[rule.condition]}{' '}
                                                <span className="text-sentinel-200 font-medium">
                                                    {rule.condition.includes('pct') || rule.condition === 'volume_spike'
                                                        ? `${rule.value}%`
                                                        : `$${rule.value.toFixed(2)}`}
                                                </span>
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-xs text-sentinel-500">
                                                Created {new Date(rule.createdAt).toLocaleDateString()}
                                            </span>
                                            {rule.lastTriggered && (
                                                <span className="text-xs text-amber-400/70">
                                                    Last triggered {new Date(rule.lastTriggered).toLocaleDateString()}
                                                </span>
                                            )}
                                            {rule.triggerCount > 0 && (
                                                <span className="text-xs text-sentinel-500">
                                                    {rule.triggerCount} trigger{rule.triggerCount !== 1 ? 's' : ''}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        onClick={() => toggleRule(rule.id)}
                                        className="p-1.5 rounded-lg hover:bg-sentinel-800/50 transition-colors cursor-pointer border-none bg-transparent"
                                        title={rule.enabled ? 'Disable' : 'Enable'}
                                    >
                                        {rule.enabled ? (
                                            <ToggleRight className="w-5 h-5 text-blue-400" />
                                        ) : (
                                            <ToggleLeft className="w-5 h-5 text-sentinel-600" />
                                        )}
                                    </button>
                                    <button
                                        onClick={() => deleteRule(rule.id)}
                                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-sentinel-500 hover:text-red-400 transition-colors cursor-pointer border-none bg-transparent"
                                        title="Delete rule"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* Recent Notification History */}
            {history.length > 0 && (
                <div className="glass-panel p-6 rounded-xl">
                    <h2 className="text-lg font-semibold text-sentinel-100 mb-4">Recent Notifications</h2>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {history.slice(0, 20).map(n => (
                            <div key={n.id} className="flex items-center gap-3 p-2 rounded-lg bg-sentinel-900/30">
                                <div className={`w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-sentinel-700' : 'bg-blue-400'}`} />
                                <div className="min-w-0 flex-1">
                                    <span className="text-sm text-sentinel-200">{n.title}</span>
                                    <p className="text-xs text-sentinel-500 truncate">{n.body}</p>
                                </div>
                                <span className="text-xs text-sentinel-600 shrink-0">
                                    {new Date(n.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
