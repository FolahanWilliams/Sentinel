import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/config/supabase';
import type { Database } from '@/types/database';

type AppSetting = Database['public']['Tables']['app_settings']['Row'];

export interface ScannerSettings {
    interval_minutes: number;
    min_confidence: number;
    min_price_drop_pct: number;
    min_volume_mult: number;
    active_sectors: string[];
    paper_mode: boolean;
}

const DEFAULT_SETTINGS: ScannerSettings = {
    interval_minutes: 5,
    min_confidence: 60,
    min_price_drop_pct: -5.0,
    min_volume_mult: 2.0,
    active_sectors: ['Tech', 'Bio', 'Semi', 'AI'],
    paper_mode: true
};

export function useAppSettings() {
    const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchSettings = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('app_settings')
                .select('*')
                .eq('key', 'scanner_config')
                .maybeSingle();

            if (fetchError) throw fetchError;

            if (data && data.value) {
                // Merge with defaults in case of missing keys
                setSettings({ ...DEFAULT_SETTINGS, ...(data.value as Partial<ScannerSettings>) });
            } else {
                // If it doesn't exist, create it with defaults
                await saveSettings(DEFAULT_SETTINGS);
            }
            setError(null);
        } catch (err) {
            console.error('[useAppSettings] Fetch error:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch settings');
        } finally {
            setLoading(false);
        }
    }, []);

    const saveSettings = async (newSettings: ScannerSettings) => {
        try {
            setError(null);
            const { error: upsertError } = await supabase
                .from('app_settings')
                .upsert({
                    key: 'scanner_config',
                    value: newSettings as any
                });

            if (upsertError) throw upsertError;
            setSettings(newSettings);
            return true;
        } catch (err) {
            console.error('[useAppSettings] Save error:', err);
            setError(err instanceof Error ? err.message : 'Failed to save settings');
            return false;
        }
    };

    const updateSetting = async <K extends keyof ScannerSettings>(key: K, value: ScannerSettings[K]) => {
        const updated = { ...settings, [key]: value };
        return await saveSettings(updated);
    };

    useEffect(() => {
        fetchSettings();

        // Optional: subscribe to remote setting changes
        const subscription = supabase
            .channel('app_settings_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'app_settings',
                    filter: 'key=eq.scanner_config'
                },
                (payload) => {
                    if (payload.new && (payload.new as AppSetting).value) {
                        setSettings({ ...DEFAULT_SETTINGS, ...((payload.new as AppSetting).value as Partial<ScannerSettings>) });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchSettings]);

    return { settings, loading, error, saveSettings, updateSetting, refresh: fetchSettings };
}
