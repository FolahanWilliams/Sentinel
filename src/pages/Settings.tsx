import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { Settings as SettingsIcon, Save, Bot, Shield, Bell } from 'lucide-react';

export function Settings() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [settings, setSettings] = useState<any>({
        max_daily_loss: 0,
        max_position_size_pct: 0,
        base_capital: 0,
        kelly_fraction: 0
    });

    useEffect(() => {
        async function fetchConfig() {
            const { data } = await supabase.from('portfolio_config').select('*').single();
            if (data) setSettings(data);
            setLoading(false);
        }
        fetchConfig();
    }, []);

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);
        await supabase.from('portfolio_config').update({
            max_daily_loss: settings.max_daily_loss,
            max_position_size_pct: settings.max_position_size_pct,
            base_capital: settings.base_capital,
            kelly_fraction: settings.kelly_fraction,
        }).eq('id', settings.id);

        // Quick save simulation for UX
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
                    <form onSubmit={handleSave} className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-6 backdrop-blur-sm space-y-6">

                        <div>
                            <h2 className="text-lg font-semibold text-sentinel-200 flex items-center gap-2 border-b border-sentinel-800 pb-2 mb-4">
                                <Shield className="w-5 h-5 text-blue-400" /> Risk Limits (Position Sizer)
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Max Position Size (%)</label>
                                    <input type="number" step="0.1" value={settings.max_position_size_pct} onChange={e => setSettings({ ...settings, max_position_size_pct: parseFloat(e.target.value) })} className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100" />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Kelly Fraction Adjuster</label>
                                    <input type="number" step="0.1" value={settings.kelly_fraction} onChange={e => setSettings({ ...settings, kelly_fraction: parseFloat(e.target.value) })} className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100" />
                                    <p className="text-[10px] text-sentinel-500 mt-1">1.0 = Full Kelly, 0.5 = Half Kelly (Recommended)</p>
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Max Daily Loss Limit ($)</label>
                                    <input type="number" value={settings.max_daily_loss} onChange={e => setSettings({ ...settings, max_daily_loss: parseFloat(e.target.value) })} className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100" />
                                </div>
                                <div>
                                    <label className="block text-xs text-sentinel-400 mb-1">Simulated Base Capital ($)</label>
                                    <input type="number" value={settings.base_capital} onChange={e => setSettings({ ...settings, base_capital: parseFloat(e.target.value) })} className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100" />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-sentinel-800/50">
                            <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <Save className="w-4 h-4" />}
                                Save Configuration
                            </button>
                        </div>

                    </form>
                </div>

                <div className="space-y-6">
                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-6 backdrop-blur-sm">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Bot className="w-4 h-4" /> Agent Status
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-sentinel-400">Gemini Model</span>
                                <span className="text-sentinel-100">gemini-3-flash</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-sentinel-400">Grounded Search</span>
                                <span className="text-emerald-400">Enabled</span>
                            </div>
                            <div className="flex justify-between text-sm pt-2 border-t border-sentinel-800/50">
                                <span className="text-sentinel-400">Red Team Bias Check</span>
                                <span className="text-emerald-400">Strict</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-6 backdrop-blur-sm">
                        <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Bell className="w-4 h-4" /> Integrations
                        </h3>
                        <div className="space-y-3">
                            <div className="flex justify-between text-sm">
                                <span className="text-sentinel-400">Market Data</span>
                                <span className="text-sentinel-100">Alpha Vantage / Polygon</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-sentinel-400">Email Alerts</span>
                                <span className="text-emerald-400">Resend API (Active)</span>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
