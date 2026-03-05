/** Alert rule types and matching logic for signal notifications */

export interface AlertRule {
    id: string;
    enabled: boolean;
    sector: string;
    minConfidence: number;
    signalType: 'all' | 'overreaction' | 'contagion';
    bias: 'all' | 'bullish' | 'bearish';
    createdAt: number;
}

const STORAGE_KEY = 'sentinel_alert_rules';

export function getMatchingAlertRules(signal: any): AlertRule[] {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return [];

        const rules: AlertRule[] = JSON.parse(stored);
        const activeRules = rules.filter(r => r.enabled);

        return activeRules.filter(rule => {
            // Sector check
            if (rule.sector !== 'All Sectors') {
                const sector = (signal.sector || '').toLowerCase();
                if (!sector.includes(rule.sector.toLowerCase())) return false;
            }

            // Confidence check
            if (rule.minConfidence > 0) {
                if ((signal.confidence_score || 0) < rule.minConfidence) return false;
            }

            // Type check
            if (rule.signalType !== 'all') {
                const type = (signal.signal_type || '').toLowerCase();
                if (!type.includes(rule.signalType.toLowerCase())) return false;
            }

            // Bias check
            if (rule.bias !== 'all') {
                const bias = (signal.bias_type || '').toLowerCase();
                if (!bias.includes(rule.bias.toLowerCase())) return false;
            }

            return true;
        });
    } catch (e) {
        console.error('Failed to parse alert rules', e);
        return [];
    }
}
