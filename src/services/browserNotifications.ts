/**
 * BrowserNotificationService — Push notifications via the Web Notifications API.
 *
 * Key triggers:
 * - Price hitting stop/target levels
 * - New convergence signal detected
 * - Portfolio exposure breaching limits
 * - High-confidence scanner signal for watchlist ticker
 */

export type NotificationTrigger =
    | 'signal_new'
    | 'price_stop_hit'
    | 'price_target_hit'
    | 'convergence_detected'
    | 'exposure_breach'
    | 'scanner_high_confidence';

interface BrowserNotificationOptions {
    title: string;
    body: string;
    trigger: NotificationTrigger;
    ticker?: string;
    url?: string;
    tag?: string;
}

const NOTIFICATION_SETTINGS_KEY = 'sentinel_browser_notifications';

export interface NotificationPreferences {
    enabled: boolean;
    signal_new: boolean;
    price_stop_hit: boolean;
    price_target_hit: boolean;
    convergence_detected: boolean;
    exposure_breach: boolean;
    scanner_high_confidence: boolean;
    sound: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
    enabled: true,
    signal_new: true,
    price_stop_hit: true,
    price_target_hit: true,
    convergence_detected: true,
    exposure_breach: true,
    scanner_high_confidence: true,
    sound: true,
};

export class BrowserNotificationService {
    private static notificationHistory: Array<{
        id: string;
        title: string;
        body: string;
        trigger: NotificationTrigger;
        ticker?: string;
        timestamp: number;
        read: boolean;
    }> = [];

    /**
     * Request browser notification permission.
     */
    static async requestPermission(): Promise<NotificationPermission> {
        if (!('Notification' in window)) {
            console.warn('[BrowserNotifications] Not supported in this browser');
            return 'denied';
        }

        if (Notification.permission === 'granted') return 'granted';
        if (Notification.permission === 'denied') return 'denied';

        const result = await Notification.requestPermission();
        return result;
    }

    /**
     * Check if notifications are supported and permitted.
     */
    static isSupported(): boolean {
        return 'Notification' in window;
    }

    static getPermission(): NotificationPermission {
        if (!this.isSupported()) return 'denied';
        return Notification.permission;
    }

    /**
     * Get user preferences from localStorage.
     */
    static getPreferences(): NotificationPreferences {
        try {
            const stored = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
            if (stored) return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
        } catch { /* ignore */ }
        return { ...DEFAULT_PREFERENCES };
    }

    /**
     * Save user preferences.
     */
    static savePreferences(prefs: NotificationPreferences): void {
        localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(prefs));
    }

    /**
     * Send a browser notification if enabled and permitted.
     */
    static async send(options: BrowserNotificationOptions): Promise<boolean> {
        const prefs = this.getPreferences();

        // Check master toggle
        if (!prefs.enabled) return false;

        // Check trigger-specific toggle
        if (!prefs[options.trigger]) return false;

        // Check browser permission
        if (!this.isSupported() || Notification.permission !== 'granted') return false;

        try {
            const notification = new Notification(options.title, {
                body: options.body,
                icon: '/sentinel-icon.png',
                badge: '/sentinel-badge.png',
                tag: options.tag || `sentinel-${options.trigger}-${Date.now()}`,
                requireInteraction: options.trigger === 'price_stop_hit' || options.trigger === 'exposure_breach',
                silent: !prefs.sound,
            });

            notification.onclick = () => {
                window.focus();
                if (options.url) {
                    window.location.href = options.url;
                }
                notification.close();
            };

            // Auto-close after 15 seconds (except critical alerts)
            if (options.trigger !== 'price_stop_hit' && options.trigger !== 'exposure_breach') {
                setTimeout(() => notification.close(), 15000);
            }

            // Track in history
            this.notificationHistory.unshift({
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                title: options.title,
                body: options.body,
                trigger: options.trigger,
                ticker: options.ticker,
                timestamp: Date.now(),
                read: false,
            });

            // Limit history to 50 items
            if (this.notificationHistory.length > 50) {
                this.notificationHistory = this.notificationHistory.slice(0, 50);
            }

            return true;
        } catch (err) {
            console.error('[BrowserNotifications] Failed to send:', err);
            return false;
        }
    }

    /**
     * Get notification history.
     */
    static getHistory() {
        return this.notificationHistory;
    }

    /**
     * Mark all notifications as read.
     */
    static markAllRead() {
        this.notificationHistory.forEach(n => n.read = true);
    }

    /**
     * Get unread count.
     */
    static getUnreadCount(): number {
        return this.notificationHistory.filter(n => !n.read).length;
    }

    // ─── Convenience Methods for Specific Triggers ───

    static async notifyNewSignal(ticker: string, signalType: string, confidence: number) {
        return this.send({
            title: `New Signal: ${ticker}`,
            body: `${signalType.replace(/_/g, ' ')} detected with ${confidence}% confidence`,
            trigger: 'signal_new',
            ticker,
            url: `/analysis/${ticker}`,
            tag: `signal-${ticker}`,
        });
    }

    static async notifyStopHit(ticker: string, price: number, stopPrice: number) {
        return this.send({
            title: `STOP HIT: ${ticker}`,
            body: `Price $${price.toFixed(2)} breached stop loss at $${stopPrice.toFixed(2)}`,
            trigger: 'price_stop_hit',
            ticker,
            url: '/positions',
            tag: `stop-${ticker}`,
        });
    }

    static async notifyTargetHit(ticker: string, price: number, targetPrice: number) {
        return this.send({
            title: `TARGET HIT: ${ticker}`,
            body: `Price $${price.toFixed(2)} reached target at $${targetPrice.toFixed(2)}`,
            trigger: 'price_target_hit',
            ticker,
            url: '/positions',
            tag: `target-${ticker}`,
        });
    }

    static async notifyConvergence(ticker: string, level: string, signalCount: number) {
        return this.send({
            title: `Convergence: ${ticker}`,
            body: `${level} convergence detected — ${signalCount} signals aligned`,
            trigger: 'convergence_detected',
            ticker,
            url: `/analysis/${ticker}`,
            tag: `convergence-${ticker}`,
        });
    }

    static async notifyExposureBreach(currentPct: number, limitPct: number) {
        return this.send({
            title: 'Exposure Limit Breached',
            body: `Portfolio exposure ${currentPct.toFixed(1)}% exceeds ${limitPct}% limit`,
            trigger: 'exposure_breach',
            url: '/positions',
            tag: 'exposure-breach',
        });
    }

    static async notifyHighConfidenceSignal(ticker: string, confidence: number, thesis: string) {
        return this.send({
            title: `High-Confidence: ${ticker} (${confidence}%)`,
            body: thesis.slice(0, 120),
            trigger: 'scanner_high_confidence',
            ticker,
            url: `/analysis/${ticker}`,
            tag: `high-conf-${ticker}`,
        });
    }
}
