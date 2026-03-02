import React, { useState, useEffect } from 'react';
import { Settings, Save, Loader2, AlertCircle } from 'lucide-react';
import { useAppSettings, ScannerSettings } from '@/hooks/useAppSettings';

export const ScanConfiguration: React.FC = () => {
    const { settings, loading, error, saveSettings } = useAppSettings();
    const [localSettings, setLocalSettings] = useState<ScannerSettings | null>(null);
    const [localSectors, setLocalSectors] = useState<string>('');
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (settings) {
            setLocalSettings(settings);
            setLocalSectors(settings.active_sectors ? settings.active_sectors.join(', ') : '');
        }
    }, [settings]);

    if (loading || !localSettings) {
        return (
            <div className="bg-[#111] border border-gray-800 rounded-xl p-6 h-full flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
            </div>
        );
    }

    const handleSave = async () => {
        setSuccessMsg(null);
        setSaving(true);
        const success = await saveSettings(localSettings);
        setSaving(false);
        if (success) {
            setSuccessMsg('Settings saved successfully.');
            setTimeout(() => setSuccessMsg(null), 3000);
        }
    };

    const handleSectorsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setLocalSectors(e.target.value);
        const sectors = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
        setLocalSettings({ ...localSettings, active_sectors: sectors });
    };

    return (
        <div className="bg-[#111] border border-gray-800 rounded-xl p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-white flex items-center">
                    <Settings className="w-5 h-5 mr-2 text-indigo-400" />
                    Scanner Configuration
                </h2>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors text-sm font-medium"
                >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Changes
                </button>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-900/40 border border-red-800 rounded flex items-start text-red-300 text-sm">
                    <AlertCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {successMsg && (
                <div className="mb-4 p-3 bg-green-900/40 border border-green-800 rounded text-green-300 text-sm">
                    {successMsg}
                </div>
            )}

            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Scan Interval (Minutes)
                        </label>
                        <input
                            type="number"
                            value={localSettings.interval_minutes}
                            onChange={(e) => setLocalSettings({ ...localSettings, interval_minutes: parseInt(e.target.value) || 60 })}
                            className="w-full bg-[#1a1a1a] border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-1">
                            Min Confidence Threshold
                        </label>
                        <input
                            type="number"
                            value={localSettings.min_confidence}
                            onChange={(e) => setLocalSettings({ ...localSettings, min_confidence: parseInt(e.target.value) || 70 })}
                            className="w-full bg-[#1a1a1a] border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">
                        Sectors to Scan (comma-separated)
                    </label>
                    <input
                        type="text"
                        value={localSectors}
                        onChange={handleSectorsChange}
                        placeholder="e.g. Technology, Healthcare"
                        className="w-full bg-[#1a1a1a] border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                    />
                </div>

                <div className="flex items-center justify-between p-4 bg-[#1a1a1a] rounded-lg border border-gray-800">
                    <div>
                        <div className="text-white font-medium">Paper Trading Mode</div>
                        <div className="text-sm text-gray-400">Run scans without executing real trades</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={localSettings.paper_mode}
                            onChange={(e) => setLocalSettings({ ...localSettings, paper_mode: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                </div>
            </div>
        </div>
    );
};
