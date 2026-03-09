/**
 * ExposureSettings — Configuration panel for exposure monitoring.
 *
 * Allows users to configure check intervals, drawdown thresholds,
 * and price alert preferences.
 */

import { useState } from 'react';
import { Shield, Clock, TrendingDown, Bell } from 'lucide-react';
import { ExposureMonitor, type ExposureSettings as Settings } from '@/services/exposureMonitor';
import { BrowserNotificationService } from '@/services/browserNotifications';

const INTERVAL_OPTIONS = [
    { label: '1 min', value: 60_000 },
    { label: '5 min', value: 300_000 },
    { label: '15 min', value: 900_000 },
    { label: '30 min', value: 1_800_000 },
];

export function ExposureSettingsPanel() {
    const [settings, setSettings] = useState<Settings>(ExposureMonitor.getSettings());
    const [testSent, setTestSent] = useState(false);

    function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
        const updated = { ...settings, [key]: value };
        setSettings(updated);
        ExposureMonitor.saveSettings(updated);
    }

    async function handleTestNotification() {
        await BrowserNotificationService.requestPermission();
        await BrowserNotificationService.send({
            title: 'Test: Exposure Monitor',
            body: 'This is a test notification from the Exposure Monitor.',
            trigger: 'exposure_breach',
        });
        setTestSent(true);
        setTimeout(() => setTestSent(false), 3000);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2 mb-4">
                <Shield className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-semibold text-sentinel-100">Exposure Monitoring</h3>
            </div>

            {/* Check Interval */}
            <div>
                <label className="flex items-center gap-2 text-sm text-sentinel-300 mb-2">
                    <Clock className="w-4 h-4 text-sentinel-500" />
                    Check Interval
                </label>
                <div className="flex gap-2">
                    {INTERVAL_OPTIONS.map(opt => (
                        <button
                            key={opt.value}
                            onClick={() => updateSetting('checkIntervalMs', opt.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                                settings.checkIntervalMs === opt.value
                                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                                    : 'bg-sentinel-800/50 text-sentinel-400 border-sentinel-700/50 hover:bg-sentinel-800'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
                <p className="text-[11px] text-sentinel-600 mt-1">
                    How often to check portfolio exposure against limits. Pauses when tab is hidden.
                </p>
            </div>

            {/* Drawdown Thresholds */}
            <div>
                <label className="flex items-center gap-2 text-sm text-sentinel-300 mb-2">
                    <TrendingDown className="w-4 h-4 text-sentinel-500" />
                    Drawdown Alert Thresholds
                </label>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-sentinel-500 mb-1 block">Warning (%)</label>
                        <input
                            type="number"
                            value={settings.drawdownWarningPct}
                            onChange={e => updateSetting('drawdownWarningPct', parseFloat(e.target.value) || 5)}
                            min={1}
                            max={50}
                            className="w-full px-3 py-2 bg-sentinel-800 text-sentinel-200 rounded-lg text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-sentinel-500 mb-1 block">Critical (%)</label>
                        <input
                            type="number"
                            value={settings.drawdownCriticalPct}
                            onChange={e => updateSetting('drawdownCriticalPct', parseFloat(e.target.value) || 10)}
                            min={1}
                            max={80}
                            className="w-full px-3 py-2 bg-sentinel-800 text-sentinel-200 rounded-lg text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                        />
                    </div>
                </div>
            </div>

            {/* Price Alerts Toggle */}
            <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-sentinel-500" />
                    <div>
                        <div className="text-sm text-sentinel-300">Price Alerts</div>
                        <div className="text-[10px] text-sentinel-500">Alert when stop loss or target price is hit</div>
                    </div>
                </div>
                <button
                    onClick={() => updateSetting('priceAlertsEnabled', !settings.priceAlertsEnabled)}
                    role="switch"
                    aria-checked={settings.priceAlertsEnabled}
                    className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer border-none ${
                        settings.priceAlertsEnabled ? 'bg-emerald-600' : 'bg-sentinel-700'
                    }`}
                >
                    <div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                        style={{ left: settings.priceAlertsEnabled ? '22px' : '2px' }}
                    />
                </button>
            </div>

            {/* Test Notification */}
            <button
                onClick={handleTestNotification}
                className="px-4 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-300 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700/50 cursor-pointer border-none"
            >
                {testSent ? 'Notification Sent!' : 'Send Test Notification'}
            </button>
        </div>
    );
}
