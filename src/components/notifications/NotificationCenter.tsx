/**
 * NotificationCenter — Browser notification preferences + history panel.
 * Shown as a dropdown from the header bell icon.
 */

import { useState, useEffect } from 'react';
import {
    Bell, BellOff, Settings, X, Volume2, VolumeX,
    AlertTriangle, TrendingUp, TrendingDown, Radar, Shield, Target, Zap, PieChart, Clock,
} from 'lucide-react';
import { BrowserNotificationService, type NotificationPreferences } from '@/services/browserNotifications';

const TRIGGER_CONFIG: { key: keyof NotificationPreferences; label: string; icon: typeof Bell; description: string }[] = [
    { key: 'signal_new', label: 'New Signals', icon: Zap, description: 'When AI detects a new trading signal' },
    { key: 'price_stop_hit', label: 'Stop Loss Hit', icon: AlertTriangle, description: 'When price breaches your stop loss' },
    { key: 'price_target_hit', label: 'Target Hit', icon: Target, description: 'When price reaches target level' },
    { key: 'convergence_detected', label: 'Convergence', icon: Radar, description: 'When multiple signals align on a ticker' },
    { key: 'exposure_breach', label: 'Exposure Limit', icon: Shield, description: 'When portfolio exposure exceeds limits' },
    { key: 'scanner_high_confidence', label: 'High Confidence', icon: TrendingUp, description: 'When scanner finds 80%+ confidence signal' },
    { key: 'drawdown_alert', label: 'Drawdown Alert', icon: TrendingDown, description: 'When portfolio drawdown exceeds threshold' },
    { key: 'sector_drift', label: 'Sector Drift', icon: PieChart, description: 'When sector exposure drifts beyond limits' },
    { key: 'outcome_reminder', label: 'Outcome Reminders', icon: Clock, description: 'When decisions are due for outcome review' },
];

interface NotificationCenterProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
    const [prefs, setPrefs] = useState<NotificationPreferences>(BrowserNotificationService.getPreferences());
    const [permission, setPermission] = useState<NotificationPermission>(BrowserNotificationService.getPermission());
    const [showSettings, setShowSettings] = useState(false);
    const [history, setHistory] = useState(() => BrowserNotificationService.getHistory());

    useEffect(() => {
        if (isOpen) {
            setPermission(BrowserNotificationService.getPermission());
            setHistory(BrowserNotificationService.getHistory());
            BrowserNotificationService.markAllRead();
        }
    }, [isOpen]);

    async function handleRequestPermission() {
        const result = await BrowserNotificationService.requestPermission();
        setPermission(result);
    }

    function togglePref(key: keyof NotificationPreferences) {
        const updated = { ...prefs, [key]: !prefs[key] };
        setPrefs(updated);
        BrowserNotificationService.savePreferences(updated);
    }

    if (!isOpen) return null;

    return (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-sentinel-900/98 border border-sentinel-800/60 rounded-xl shadow-2xl z-[200] backdrop-blur-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <h3 className="text-sm font-semibold text-sentinel-200 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-400" />
                    Notifications
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="p-1.5 rounded-lg text-sentinel-400 hover:text-sentinel-200 hover:bg-white/5 transition-colors"
                        title="Notification Settings"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-sentinel-400 hover:text-sentinel-200 hover:bg-white/5 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Permission Banner */}
            {permission !== 'granted' && (
                <div className="px-4 py-3 bg-blue-500/5 border-b border-blue-500/10">
                    <div className="flex items-center gap-2 mb-2">
                        <BellOff className="w-4 h-4 text-blue-400" />
                        <span className="text-xs text-blue-300 font-medium">Browser notifications are disabled</span>
                    </div>
                    {permission === 'default' ? (
                        <button
                            onClick={handleRequestPermission}
                            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                        >
                            Enable Notifications
                        </button>
                    ) : (
                        <p className="text-[11px] text-sentinel-500">
                            Notifications were blocked. Please enable them in your browser settings.
                        </p>
                    )}
                </div>
            )}

            {/* Settings Panel */}
            {showSettings ? (
                <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                    {/* Master Toggle */}
                    <div className="flex items-center justify-between py-2 border-b border-white/5">
                        <span className="text-sm text-sentinel-200 font-medium">All Notifications</span>
                        <button
                            onClick={() => togglePref('enabled')}
                            role="switch"
                            aria-checked={prefs.enabled}
                            aria-label="Toggle all notifications"
                            className={`w-10 h-5 rounded-full transition-colors relative ${prefs.enabled ? 'bg-blue-600' : 'bg-sentinel-700'}`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${prefs.enabled ? 'left-5.5 translate-x-0' : 'left-0.5'}`} style={{ left: prefs.enabled ? '22px' : '2px' }} />
                        </button>
                    </div>

                    {/* Sound Toggle */}
                    <div className="flex items-center justify-between py-1.5">
                        <div className="flex items-center gap-2">
                            {prefs.sound ? <Volume2 className="w-3.5 h-3.5 text-sentinel-400" /> : <VolumeX className="w-3.5 h-3.5 text-sentinel-400" />}
                            <span className="text-xs text-sentinel-300">Notification Sound</span>
                        </div>
                        <button
                            onClick={() => togglePref('sound')}
                            className={`w-8 h-4 rounded-full transition-colors relative ${prefs.sound ? 'bg-blue-600' : 'bg-sentinel-700'}`}
                        >
                            <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: prefs.sound ? '17px' : '2px' }} />
                        </button>
                    </div>

                    {/* Per-Trigger Toggles */}
                    <div className="space-y-1">
                        <h4 className="text-[10px] uppercase tracking-wider text-sentinel-500 mb-2">Alert Types</h4>
                        {TRIGGER_CONFIG.map(({ key, label, icon: Icon, description }) => (
                            <div key={key} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/[0.02]">
                                <div className="flex items-center gap-2.5">
                                    <Icon className="w-3.5 h-3.5 text-sentinel-400" />
                                    <div>
                                        <div className="text-xs text-sentinel-200">{label}</div>
                                        <div className="text-[10px] text-sentinel-500">{description}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => togglePref(key)}
                                    className={`w-8 h-4 rounded-full transition-colors relative ${prefs[key] ? 'bg-emerald-600' : 'bg-sentinel-700'}`}
                                >
                                    <div className="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform" style={{ left: prefs[key] ? '17px' : '2px' }} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* Notification History */
                <div className="max-h-[400px] overflow-y-auto">
                    {history.length === 0 ? (
                        <div className="py-12 text-center">
                            <Bell className="w-8 h-8 text-sentinel-700 mx-auto mb-2" />
                            <p className="text-sm text-sentinel-500">No notifications yet</p>
                            <p className="text-xs text-sentinel-600 mt-1">Alerts will appear here when triggered</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/5">
                            {history.map(item => (
                                <div key={item.id} className={`px-4 py-3 hover:bg-white/[0.02] transition-colors ${!item.read ? 'border-l-2 border-l-blue-500' : ''}`}>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs font-medium text-sentinel-200 truncate">{item.title}</div>
                                            <p className="text-[11px] text-sentinel-400 mt-0.5 line-clamp-2">{item.body}</p>
                                        </div>
                                        <span className="text-[10px] text-sentinel-600 whitespace-nowrap">
                                            {formatTimeAgo(item.timestamp)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function formatTimeAgo(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
