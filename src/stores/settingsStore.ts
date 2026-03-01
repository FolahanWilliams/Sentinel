import { create } from 'zustand';

interface SettingsStore {
    scanInterval: number;
    minConfidence: number;
    minPriceDrop: number;
    minVolumeMultiplier: number;
    isPaperMode: boolean;
    notificationsEnabled: boolean;
    notificationConfidenceThreshold: number;
    updateSetting: <K extends keyof SettingsStore>(key: K, value: SettingsStore[K]) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
    scanInterval: 5,
    minConfidence: 60,
    minPriceDrop: -5.0,
    minVolumeMultiplier: 2.0,
    isPaperMode: true,
    notificationsEnabled: true,
    notificationConfidenceThreshold: 70,
    updateSetting: (key, value) => set((state) => ({ ...state, [key]: value })),
}));
