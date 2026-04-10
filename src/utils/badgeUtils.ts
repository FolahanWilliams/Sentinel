import type { ConfluenceLevel } from '@/types/signals';

export function getConfidenceColor(score: number): string {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-blue-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-400';
}

export function getConfidenceBg(score: number): string {
    if (score >= 80) return 'bg-emerald-500/10 ring-emerald-500/20';
    if (score >= 60) return 'bg-blue-500/10 ring-blue-500/20';
    if (score >= 40) return 'bg-amber-500/10 ring-amber-500/20';
    return 'bg-red-500/10 ring-red-500/20';
}

export function getConfluenceColor(level: ConfluenceLevel | string | null): string {
    switch (level) {
        case 'strong': return 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30';
        case 'moderate': return 'bg-blue-500/15 text-blue-400 ring-blue-500/30';
        case 'weak': return 'bg-amber-500/15 text-amber-400 ring-amber-500/30';
        default: return 'bg-sentinel-800/50 text-sentinel-500 ring-sentinel-700/30';
    }
}

export function getConvictionColor(score: number): string {
    if (score >= 85) return 'bg-amber-500/15 text-amber-400 ring-amber-500/30';
    if (score >= 70) return 'bg-blue-500/10 text-blue-400 ring-blue-500/20';
    return 'bg-sentinel-800/50 text-sentinel-500 ring-sentinel-700/30';
}

export function formatSignalType(type: string): string {
    switch (type) {
        case 'long_overreaction': return 'Long \u2014 Overreaction';
        case 'short_overreaction': return 'Short \u2014 Overreaction';
        case 'sector_contagion': return 'Long \u2014 Contagion';
        case 'earnings_overreaction': return 'Long \u2014 Earnings';
        case 'bullish_catalyst': return 'Long \u2014 Catalyst';
        default: return type.replace(/_/g, ' ');
    }
}

export function isLongSignal(type: string): boolean {
    return type !== 'short_overreaction';
}
