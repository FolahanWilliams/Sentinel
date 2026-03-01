/**
 * FundamentalSnapshot — Quick view of a ticker's fundamentals from the sanity check.
 */

import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';

interface FundamentalSnapshotProps {
    sanityCheck?: {
        pass_filter?: boolean;
        overall_health?: string;
        green_flags?: string[];
        red_flags?: string[];
        fundamental_score?: number;
        reasoning?: string;
        insider_activity?: string | null;
        institutional_changes?: string | null;
        structural_risks?: string[];
    };
}

export function FundamentalSnapshot({ sanityCheck }: FundamentalSnapshotProps) {
    if (!sanityCheck) {
        return (
            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> Fundamental Snapshot
                </h3>
                <p className="text-sm text-sentinel-500 text-center py-4">No sanity check data available.</p>
            </div>
        );
    }

    const health = sanityCheck.overall_health || 'unknown';
    const HealthIcon = health === 'healthy' ? ShieldCheck : health === 'concerning' ? ShieldAlert : ShieldX;
    const healthColor = health === 'healthy' ? 'text-emerald-400' : health === 'concerning' ? 'text-amber-400' : 'text-red-400';

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Fundamental Snapshot
            </h3>

            {/* Health Badge */}
            <div className="flex items-center gap-3 mb-4">
                <HealthIcon className={`w-6 h-6 ${healthColor}`} />
                <div>
                    <p className={`text-sm font-bold capitalize ${healthColor}`}>{health}</p>
                    {sanityCheck.fundamental_score != null && (
                        <p className="text-xs text-sentinel-500">Score: {sanityCheck.fundamental_score}/100</p>
                    )}
                </div>
                <div className="ml-auto">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${sanityCheck.pass_filter ? 'bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20' : 'bg-red-500/10 text-red-400 ring-1 ring-red-500/20'}`}>
                        {sanityCheck.pass_filter ? 'PASSED' : 'FAILED'}
                    </span>
                </div>
            </div>

            {/* Green / Red Flags */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {sanityCheck.green_flags && sanityCheck.green_flags.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-emerald-400 mb-2">Green Flags</p>
                        <ul className="space-y-1">
                            {sanityCheck.green_flags.map((f, i) => (
                                <li key={i} className="text-xs text-sentinel-300 flex items-start gap-1.5">
                                    <span className="text-emerald-400 mt-0.5">+</span> {f}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {sanityCheck.red_flags && sanityCheck.red_flags.length > 0 && (
                    <div>
                        <p className="text-xs font-semibold text-red-400 mb-2">Red Flags</p>
                        <ul className="space-y-1">
                            {sanityCheck.red_flags.map((f, i) => (
                                <li key={i} className="text-xs text-sentinel-300 flex items-start gap-1.5">
                                    <span className="text-red-400 mt-0.5">-</span> {f}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Additional info */}
            {(sanityCheck.insider_activity || sanityCheck.institutional_changes) && (
                <div className="space-y-2 mb-4 p-3 bg-sentinel-950/50 rounded-lg border border-sentinel-800/50">
                    {sanityCheck.insider_activity && (
                        <div className="text-xs">
                            <span className="text-sentinel-500">Insider Activity:</span>{' '}
                            <span className="text-sentinel-300">{sanityCheck.insider_activity}</span>
                        </div>
                    )}
                    {sanityCheck.institutional_changes && (
                        <div className="text-xs">
                            <span className="text-sentinel-500">Institutional:</span>{' '}
                            <span className="text-sentinel-300">{sanityCheck.institutional_changes}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Structural Risks */}
            {sanityCheck.structural_risks && sanityCheck.structural_risks.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-amber-400 mb-2">Structural Risks</p>
                    <ul className="space-y-1">
                        {sanityCheck.structural_risks.map((r, i) => (
                            <li key={i} className="text-xs text-sentinel-400">• {r}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Reasoning */}
            {sanityCheck.reasoning && (
                <div className="mt-4">
                    <p className="text-xs font-semibold text-sentinel-500 mb-1">Red Team Reasoning</p>
                    <p className="text-sm text-sentinel-300 leading-relaxed">{sanityCheck.reasoning}</p>
                </div>
            )}
        </div>
    );
}
