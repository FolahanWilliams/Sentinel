/**
 * Sentinel — Notifications Service
 *
 * Interfaces with the Supabase `send-alert-email` Edge Function.
 */

import { supabase } from '@/config/supabase';
import { getMatchingAlertRules } from '@/components/settings/AlertRulesPanel';

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

    /**
     * Checks a newly generated signal against the user's active custom rules.
     * If a rule matches, dispatches an email alert.
     */
    static async checkAndDispatchAlerts(signal: any) {
        try {
            const matches = getMatchingAlertRules(signal);
            if (matches.length === 0) return;

            console.log(`[NotificationService] Signal for ${signal.ticker} matched ${matches.length} alert rule(s). Dispatching...`);

            // We only need to send one email per signal, even if multiple rules match.
            await this.sendSignalAlert(
                signal.ticker,
                signal.signal_type,
                signal.confidence_score,
                signal.thesis,
                signal.target_price,
                signal.stop_loss
            );
        } catch (e: any) {
            console.error('[NotificationService] Error checking/dispatching alerts:', e);
        }
    }
}
