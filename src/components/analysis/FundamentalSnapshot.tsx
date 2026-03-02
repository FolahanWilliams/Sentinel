/**
 * FundamentalSnapshot — Rich financial metrics grid with health indicators
 * plus the existing sanity checker assessment.
 *
 * Combines live AI-scraped fundamentals (P/E, institutional ownership, etc.)
 * with the stored Red Team analysis.
 */

import { ShieldCheck, ShieldAlert, ShieldX, BarChart3, TrendingUp, Building2, Loader2, RefreshCw } from 'lucide-react';
import type { FundamentalMetrics } from '@/hooks/useTickerAnalysis';

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
    /** AI-fetched fundamental metrics */
    fundamentals?: FundamentalMetrics | null;
    fundamentalsLoading?: boolean;
    onRefresh?: () => void;
}

interface MetricConfig {
    label: string;
    value: string;
    health: 'good' | 'warning' | 'bad' | 'neutral';
}

function evaluateMetric(label: string, val: number | null | undefined): { value: string; health: 'good' | 'warning' | 'bad' | 'neutral' } {
    if (val == null) return { value: '--', health: 'neutral' };

    switch (label) {
        case 'Forward P/E':
            return {
                value: val.toFixed(1),
                health: val < 0 ? 'bad' : val < 20 ? 'good' : val < 35 ? 'warning' : 'bad'
            };
        case 'P/S':
            return {
                value: val.toFixed(1),
                health: val < 5 ? 'good' : val < 15 ? 'warning' : 'bad'
            };
        case 'EV/EBITDA':
            return {
                value: val.toFixed(1),
                health: val < 0 ? 'bad' : val < 15 ? 'good' : val < 25 ? 'warning' : 'bad'
            };
        case 'D/E':
            return {
                value: val.toFixed(2),
                health: val < 0.5 ? 'good' : val < 1.5 ? 'warning' : 'bad'
            };
        case 'Inst. Own':
            return {
                value: `${val.toFixed(0)}%`,
                health: val > 60 ? 'good' : val > 30 ? 'warning' : 'bad'
            };
        case 'Short Int':
            return {
                value: `${val.toFixed(1)}%`,
                health: val < 5 ? 'good' : val < 15 ? 'warning' : 'bad'
            };
        case 'Rev Growth':
            return {
                value: `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`,
                health: val > 10 ? 'good' : val > 0 ? 'warning' : 'bad'
            };
        case 'Margin':
            return {
                value: `${val.toFixed(1)}%`,
                health: val > 15 ? 'good' : val > 5 ? 'warning' : 'bad'
            };
        default:
            return { value: val.toString(), health: 'neutral' };
    }
}

const HEALTH_STYLES = {
    good: { dot: 'bg-emerald-400', text: 'text-emerald-400' },
    warning: { dot: 'bg-amber-400', text: 'text-amber-400' },
    bad: { dot: 'bg-red-400', text: 'text-red-400' },
    neutral: { dot: 'bg-sentinel-600', text: 'text-sentinel-500' },
};

export function FundamentalSnapshot({ sanityCheck, fundamentals, fundamentalsLoading = false, onRefresh }: FundamentalSnapshotProps) {
    const health = sanityCheck?.overall_health || 'unknown';
    const HealthIcon = health === 'healthy' ? ShieldCheck : health === 'concerning' ? ShieldAlert : ShieldX;
    const healthColor = health === 'healthy' ? 'text-emerald-400' : health === 'concerning' ? 'text-amber-400' : 'text-red-400';

    // Build metrics grid
    const metrics: MetricConfig[] = fundamentals ? [
        { label: 'Forward P/E', ...evaluateMetric('Forward P/E', fundamentals.forwardPE) },
        { label: 'P/S', ...evaluateMetric('P/S', fundamentals.priceToSales) },
        { label: 'EV/EBITDA', ...evaluateMetric('EV/EBITDA', fundamentals.evToEbitda) },
        { label: 'D/E', ...evaluateMetric('D/E', fundamentals.debtToEquity) },
        { label: 'Inst. Own', ...evaluateMetric('Inst. Own', fundamentals.institutionalOwnershipPct) },
        { label: 'Short Int', ...evaluateMetric('Short Int', fundamentals.shortInterestPct) },
        { label: 'Rev Growth', ...evaluateMetric('Rev Growth', fundamentals.revenueGrowthYoY) },
        { label: 'Margin', ...evaluateMetric('Margin', fundamentals.profitMargin) },
    ] : [];

    return (
        <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-sentinel-300 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" /> Fundamental Snapshot
                </h3>
                {onRefresh && (
                    <button
                        onClick={onRefresh}
                        className="text-sentinel-600 hover:text-sentinel-300 transition-colors"
                        title="Refresh fundamentals"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* ── Live Financial Metrics Grid ── */}
            {fundamentalsLoading ? (
                <div className="mb-5 p-4 bg-sentinel-950/50 rounded-lg border border-sentinel-800/50">
                    <div className="flex items-center gap-2 text-sm text-sentinel-400">
                        <Loader2 className="w-4 h-4 animate-spin" /> Fetching financial metrics...
                    </div>
                </div>
            ) : fundamentals ? (
                <div className="mb-5">
                    {/* Company header */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            {fundamentals.sector && (
                                <span className="px-2 py-0.5 bg-sentinel-800 text-sentinel-300 text-xs rounded ring-1 ring-sentinel-700 flex items-center gap-1">
                                    <Building2 className="w-3 h-3" />
                                    {fundamentals.sector}
                                </span>
                            )}
                            {fundamentals.industry && (
                                <span className="text-xs text-sentinel-500">{fundamentals.industry}</span>
                            )}
                        </div>
                        {fundamentals.marketCap && (
                            <span className="text-xs font-mono text-sentinel-400 flex items-center gap-1">
                                <BarChart3 className="w-3 h-3" /> {fundamentals.marketCap}
                            </span>
                        )}
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {metrics.map((m) => {
                            const style = HEALTH_STYLES[m.health];
                            return (
                                <div key={m.label} className="bg-sentinel-950/50 rounded-lg p-2.5 border border-sentinel-800/50">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                                        <span className="text-[10px] text-sentinel-500 uppercase tracking-wide">{m.label}</span>
                                    </div>
                                    <p className={`text-sm font-mono font-bold ${style.text}`}>
                                        {m.value}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Insider activity */}
                    {fundamentals.insiderTransactions30d && (
                        <div className="mt-3 p-2.5 bg-sentinel-950/50 rounded-lg border border-sentinel-800/50">
                            <div className="flex items-center gap-1.5 mb-1">
                                <TrendingUp className="w-3 h-3 text-amber-400" />
                                <span className="text-[10px] text-sentinel-500 uppercase">Insider Activity (30d)</span>
                            </div>
                            <p className="text-xs text-sentinel-300">{fundamentals.insiderTransactions30d}</p>
                        </div>
                    )}

                    <p className="text-[10px] text-sentinel-600 mt-2 text-right">Data from live web search</p>
                </div>
            ) : null}

            {/* ── Sanity Checker Assessment ── */}
            {sanityCheck ? (
                <>
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
                </>
            ) : !fundamentals && !fundamentalsLoading ? (
                <p className="text-sm text-sentinel-500 text-center py-4">No fundamental data available.</p>
            ) : null}
        </div>
    );
}
