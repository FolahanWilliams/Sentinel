/**
 * Sentinel — Notifications Service
 *
 * Interfaces with the Supabase `send-alert-email` Edge Function.
 */

import { supabase } from '@/config/supabase';

export class NotificationService {
    /**
     * Dispatches a high-conviction signal alert via email.
     */
    static async sendSignalAlert(
        ticker: string,
        signalType: string,
        confidenceScore?: number,
        thesis?: string,
        targetPrice?: number,
        stopLoss?: number
    ) {
        try {
            console.log(`[NotificationService] Dispatching alert for ${ticker}...`);

            const { data, error } = await supabase.functions.invoke('send-alert-email', {
                body: {
                    ticker,
                    signalType,
                    confidenceScore,
                    thesis: thesis || 'See dashboard for full thesis.',
                    targetPrice,
                    stopLoss
                }
            });

            if (error) throw error;

            console.log('[NotificationService] Alert dispatched successfully.', data);
            return { success: true, data };

        } catch (e: any) {
            console.error('[NotificationService] Failed to send alert', e);
            return { success: false, error: e.message };
        }
    }
}
