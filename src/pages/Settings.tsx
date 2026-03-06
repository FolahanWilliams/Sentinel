import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { Settings as SettingsIcon, Save, Bot, Shield, Bell, Mail } from 'lucide-react';
import { ReflectionPanel } from '@/components/analysis/ReflectionPanel';
import { AlertRulesPanel } from '@/components/settings/AlertRulesPanel';

export function Settings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(false);
    const [settings, setSettings] = useState<any>({
        total_capital: 10000,
        max_position_pct: 10,
        max_total_exposure_pct: 50,
        max_sector_exposure_pct: 25,
        max_concurrent_positions: 5,
        risk_per_trade_pct: 2,
        kelly_fraction: 0.25,
    });

    useEffect(() => {
        async function fetchConfig() {
            const [{ data: configData }, { data: alertSetting }] = await Promise.all([
                supabase.from('portfolio_config').select('*').limit(1).single(),
                supabase.from('app_settings').select('value').eq('key', 'email_alerts_enabled').maybeSingle(),
            ]);
            if (configData) setSettings(configData);
            if (alertSetting?.value) setEmailAlertsEnabled(true);
            setLoading(false);
        }
        fetchConfig();
    }, []);

    async function handleToggleEmailAlerts() {
        const newValue = !emailAlertsEnabled;
        setEmailAlertsEnabled(newValue);
        await supabase.from('app_settings').upsert({
            key: 'email_alerts_enabled',
            value: newValue,
            updated_at: new Date().toISOString(),
        } as any, { onConflict: 'key' });
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);

        if (settings.id) {
            // Update existing
            await supabase.from('portfolio_config').update({
                total_capital: settings.total_capital,
                max_position_pct: settings.max_position_pct,
                max_total_exposure_pct: settings.max_total_exposure_pct,
                max_sector_exposure_pct: settings.max_sector_exposure_pct,
                max_concurrent_positions: settings.max_concurrent_positions,
                risk_per_trade_pct: settings.risk_per_trade_pct,
                kelly_fraction: settings.kelly_fraction,
            }).eq('id', settings.id);
        } else {
            // Insert first config row
            await supabase.from('portfolio_config').insert({
                total_capital: settings.total_capital,
                max_position_pct: settings.max_position_pct,
                max_total_exposure_pct: settings.max_total_exposure_pct,
                max_sector_exposure_pct: settings.max_sector_exposure_pct,
                max_concurrent_positions: settings.max_concurrent_positions,
                risk_per_trade_pct: settings.risk_per_trade_pct,
                kelly_fraction: settings.kelly_fraction,
            });
        }

        setTimeout(() => setSaving(false), 500);
    }

    if (loading) return <div className="p-12 flex justify-center"><div className="w-6 h-6 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div></div>;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-3">
                <SettingsIcon className="w-8 h-8 text-sentinel-400" />
                <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100">
                    System Configuration
                </h1>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                <div className="lg:col-span-2 space-y-6">
                    <form onSubmit={handleSave} className="glass-panel p-6 rounded-xl space-y-6">

                        <div>
                            <h2 className="text-lg font-semibold text-sentinel-200 flex items-center gap-2 border-b border-white/5 pb-2 mb-4">
                                <Shield className="w-5 h-5 text-blue-400" /> Risk Limits (Position Sizer)
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Total Capital ($)</label>
                                    <input type="number" step="100" value={settings.total_capital} onChange={e => setSettings({ ...settings, total_capital: parseFloat(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Max Position Size (%)</label>
                                    <input type="number" step="0.5" value={settings.max_position_pct} onChange={e => setSettings({ ...settings, max_position_pct: parseFloat(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Max Total Exposure (%)</label>
                                    <input type="number" step="1" value={settings.max_total_exposure_pct} onChange={e => setSettings({ ...settings, max_total_exposure_pct: parseFloat(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Max Sector Exposure (%)</label>
                                    <input type="number" step="1" value={settings.max_sector_exposure_pct} onChange={e => setSettings({ ...settings, max_sector_exposure_pct: parseFloat(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Max Concurrent Positions</label>
                                    <input type="number" step="1" value={settings.max_concurrent_positions} onChange={e => setSettings({ ...settings, max_concurrent_positions: parseInt(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Risk Per Trade (%)</label>
                                    <input type="number" step="0.1" value={settings.risk_per_trade_pct} onChange={e => setSettings({ ...settings, risk_per_trade_pct: parseFloat(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                                    <p className="text-[10px] text-sentinel-500 mt-1">% of capital risked per trade</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Kelly Fraction</label>
                                    <input type="number" step="0.05" value={settings.kelly_fraction} onChange={e => setSettings({ ...settings, kelly_fraction: parseFloat(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                                    <p className="text-[10px] text-sentinel-500 mt-1">1.0 = Full Kelly, 0.25 = Quarter Kelly (Recommended)</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-white/5">
                            <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                                Save Configuration
                            </button>
                        </div>

                    </form>
                </div>

                <div className="space-y-6">
                    <div className="glass-panel p-6 rounded-xl">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Bot className="w-4 h-4" /> Agent Status
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-sentinel-400">Gemini Model</span>
                                <span className="text-sentinel-100">gemini-2.0-flash</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-sentinel-400">Grounded Search</span>
                                <span className="text-emerald-400">Enabled</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-white/5">
                                <span className="text-sentinel-400">Red Team Bias Check</span>
                                <span className="text-emerald-400">Strict</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel p-6 rounded-xl">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Bell className="w-4 h-4" /> Integrations
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-sentinel-400">Market Data</span>
                                <span className="text-sentinel-100">Yahoo Finance</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-sentinel-400">News Intelligence</span>
                                <span className="text-sentinel-100">Gemini Grounded Search</span>
                            </div>
                            <div className="flex justify-between items-center text-sm pt-2 border-t border-white/5">
                                <div className="flex items-center gap-2">
                                    <Mail className="w-3.5 h-3.5 text-sentinel-400" />
                                    <span className="text-sentinel-400">Email Alerts</span>
                                </div>
                                <button
                                    onClick={handleToggleEmailAlerts}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer border-none ${
                                        emailAlertsEnabled ? 'bg-emerald-500' : 'bg-sentinel-700'
                                    }`}
                                >
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                        emailAlertsEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                                    }`} />
                                </button>
                            </div>
                            {emailAlertsEnabled && (
                                <p className="text-[10px] text-emerald-500/70 pl-5">
                                    Smart alerts: only high-conviction + TA-confirmed signals
                                </p>
                            )}
                        </div>
                    </div>
                </div>

            </div>

            {/* Alert Rules */}
            <div className="glass-panel p-6 rounded-xl">
                <AlertRulesPanel />
            </div>

            {/* Self-Learning Engine */}
            <ReflectionPanel />
        </div>
    );
}
