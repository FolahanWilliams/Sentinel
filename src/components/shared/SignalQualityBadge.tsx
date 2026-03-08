/**
 * SignalQualityBadge — Shows a composite quality tier badge based on
 * how many independent data sources confirm a signal.
 *
 * Reads from signal.agent_outputs.cross_source (populated by CrossSourceValidator).
 */

import { Shield, ShieldCheck, ShieldAlert, Crown, Gem } from 'lucide-react';
import type { AgentOutputsJson } from '@/types/signals';

interface SignalQualityBadgeProps {
    agentOutputs: AgentOutputsJson | null;
    compact?: boolean;
}

const tierConfig: Record<string, {
    color: string;
    bg: string;
    border: string;
    label: string;
    shortLabel: string;
    Icon: typeof Shield;
}> = {
    platinum: {
        color: 'text-cyan-300',
        bg: 'bg-cyan-500/10',
        border: 'border-cyan-500/25',
        label: 'Platinum Quality',
        shortLabel: 'PT',
        Icon: Crown,
    },
    gold: {
        color: 'text-amber-300',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/25',
        label: 'Gold Quality',
        shortLabel: 'Au',
        Icon: Gem,
    },
    silver: {
        color: 'text-slate-300',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/25',
        label: 'Silver Quality',
        shortLabel: 'Ag',
        Icon: ShieldCheck,
    },
    bronze: {
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/25',
        label: 'Bronze Quality',
        shortLabel: 'Br',
        Icon: Shield,
    },
    unconfirmed: {
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        label: 'Unconfirmed',
        shortLabel: '!',
        Icon: ShieldAlert,
    },
};

export function SignalQualityBadge({ agentOutputs, compact = false }: SignalQualityBadgeProps) {
    const crossSource = agentOutputs?.cross_source;
    if (!crossSource) return null;

    const tier = crossSource.quality_tier || 'unconfirmed';
    const config = tierConfig[tier] ?? tierConfig['unconfirmed']!;
    const { color, bg, border, label, shortLabel, Icon } = config;

    const sources = crossSource.sources || [];
    const confirmed = sources.filter(s => s.confirmed);
    const tooltipLines = [
        `${label} — ${crossSource.confirmed_sources}/${crossSource.total_sources} sources confirm`,
        `Quality Score: ${crossSource.quality_score}/100`,
        '',
        ...sources.map(s => `${s.confirmed ? '✓' : '✗'} ${s.source}: ${s.detail.slice(0, 80)}`),
    ];

    if (compact) {
        return (
            <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${bg} ${border} ${color} cursor-help`}
                title={tooltipLines.join('\n')}
            >
                <Icon className="h-2.5 w-2.5 mr-0.5" />
                {shortLabel}
            </span>
        );
    }

    return (
        <div
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border ${bg} ${border} ${color} cursor-help`}
            title={tooltipLines.join('\n')}
        >
            <Icon className="h-3 w-3" />
            <span>{label}</span>
            <span className="text-[10px] opacity-70">
                ({confirmed.length}/{sources.length})
            </span>
        </div>
    );
}
