/** Signal filter types and utility for filtering signal arrays */

export interface SignalFilters {
    sector: string;
    minConfidence: number;
    signalType: 'all' | 'overreaction' | 'contagion';
    bias: 'all' | 'bullish' | 'bearish';
    confluenceOnly: boolean;
}

/**
 * Utility: Apply filters to a signal array.
 * Expects signals from the `signals` table shape.
 */
export function applySignalFilters(signals: any[], filters: SignalFilters): any[] {
    const filtered = signals.filter(s => {
        if (filters.sector !== 'All Sectors') {
            const sector = (s.sector || '').toLowerCase();
            if (!sector.includes(filters.sector.toLowerCase())) return false;
        }
        if (filters.minConfidence > 0) {
            if ((s.confidence_score || 0) < filters.minConfidence) return false;
        }
        if (filters.signalType !== 'all') {
            const type = (s.signal_type || '').toLowerCase();
            if (!type.includes(filters.signalType)) return false;
        }
        if (filters.bias !== 'all') {
            const bias = (s.bias_type || '').toLowerCase();
            if (!bias.includes(filters.bias)) return false;
        }
        if (filters.confluenceOnly) {
            if (!s.confluence_level || s.confluence_level === 'none' || s.confluence_level === 'weak') return false;
        }
        return true;
    });

    // Sort by projected ROI (desc) when confluence filter is on
    if (filters.confluenceOnly) {
        filtered.sort((a, b) => (b.projected_roi || 0) - (a.projected_roi || 0));
    }

    return filtered;
}
