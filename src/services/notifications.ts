/**
 * Sentinel — Notifications Service
 *
 * Interfaces with the Supabase `send-alert-email` Edge Function.
 * Phase 6: Smart alerts — only send for high-conviction, TA-aligned signals.
 */

import { supabase } from '@/config/supabase';
import { getMatchingAlertRules } from '@/components/settings/AlertRulesPanel';

/** Minimum requirements for a smart alert to fire */
const SMART_ALERT_THRESHOLDS = {
    minConfidence: 80,
    taAlignmentRequired: ['confirmed', 'partial'] as string[],
    confluenceRequired: ['strong', 'moderate'] as string[],
};

export class NotificationService {
    /**
     * Dispatches a high-conviction signal alert via email.
     * Phase 6: Now includes TA summary in the alert body.
     */
    static async sendSignalAlert(
        ticker: string,
        signalType: string,
        confidenceScore?: number,
        thesis?: string,
        targetPrice?: number,
        stopLoss?: number,
        taAlignment?: string,
        taSummary?: string
    ) {
        try {
            // Check if email alerts are enabled (opt-in via settings)
            const { data: settings } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'email_alerts_enabled')
                .maybeSingle();

            if (!settings?.value) {
                console.log('[NotificationService] Email alerts disabled (opt-in). Skipping.');
                return { success: true, data: { skipped: true, reason: 'alerts_disabled' } };
            }

            console.log(`[NotificationService] Dispatching smart alert for ${ticker}...`);

            const { data, error } = await supabase.functions.invoke('send-alert-email', {
                body: {
                    ticker,
                    signalType,
                    confidenceScore,
                    thesis: thesis || 'See dashboard for full thesis.',
                    targetPrice,
                    stopLoss,
                    taAlignment: taAlignment || 'unavailable',
                    taSummary: taSummary || '',
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
     * Smart alert gating: only dispatch if signal meets quality thresholds.
     * Phase 6: Requires high confidence + TA alignment.
     */
    static async checkAndDispatchAlerts(signal: any) {
        try {
            // Smart alert gate — only alert on truly high-quality signals
            const conf = signal.confidence_score ?? signal.calibrated_confidence ?? 0;
            const taAlign = signal.ta_alignment || 'unavailable';

            if (conf < SMART_ALERT_THRESHOLDS.minConfidence) {
                console.log(`[NotificationService] Skipping alert for ${signal.ticker} — confidence ${conf} below ${SMART_ALERT_THRESHOLDS.minConfidence}`);
                return;
            }

            if (!SMART_ALERT_THRESHOLDS.taAlignmentRequired.includes(taAlign)) {
                console.log(`[NotificationService] Skipping alert for ${signal.ticker} — TA alignment '${taAlign}' not in required set`);
                return;
            }

            // Confluence gate — only alert for confirmed confluence signals
            const confluenceLevel = signal.confluence_level || 'none';
            if (!SMART_ALERT_THRESHOLDS.confluenceRequired.includes(confluenceLevel)) {
                console.log(`[NotificationService] Skipping alert for ${signal.ticker} — confluence '${confluenceLevel}' below threshold`);
                return;
            }

            // Check custom rules
            const matches = getMatchingAlertRules(signal);
            if (matches.length === 0) return;

            console.log(`[NotificationService] Smart alert: ${signal.ticker} (conf=${conf}, TA=${taAlign}) matched ${matches.length} rule(s).`);

            // Build TA summary for email
            let taSummary = '';
            if (signal.ta_snapshot) {
                const snap = signal.ta_snapshot;
                const parts: string[] = [];
                if (snap.rsi14 != null) parts.push(`RSI: ${snap.rsi14.toFixed(0)}`);
                if (snap.trendDirection) parts.push(`Trend: ${snap.trendDirection}`);
                if (snap.taScore != null) parts.push(`TA Score: ${snap.taScore > 0 ? '+' : ''}${snap.taScore}`);
                taSummary = parts.join(' | ');
            }

            await this.sendSignalAlert(
                signal.ticker,
                signal.signal_type,
                signal.confidence_score,
                signal.thesis,
                signal.target_price,
                signal.stop_loss,
                taAlign,
                taSummary
            );
        } catch (e: any) {
            console.error('[NotificationService] Error checking/dispatching alerts:', e);
        }
    }
}
