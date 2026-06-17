/**
 * Learning — Analyst Toolkit
 *
 * A personal, evergreen reference for portfolio-analytics concepts: returns,
 * exposure, the risk suite, and attribution. Every concept pairs the formula
 * with a plain-English "say it in one line" so the goal isn't to memorise it —
 * it's to be able to explain it out loud. Ends with an interactive Risk
 * Playground that computes vol / Sharpe / VaR / drawdown from a return series.
 *
 * Pure client-side; no data dependencies. Not tied to live portfolio state.
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    GraduationCap, Wallet, PieChart, Activity, BarChart3,
    Lightbulb, Sigma, FlaskConical, type LucideIcon,
} from 'lucide-react';

// ─── Content model ───

interface Concept {
    term: string;
    plain: string;
    formula?: string;
    why: string;
    sayIt: string;
}

interface Module {
    id: string;
    title: string;
    icon: LucideIcon;
    accent: string; // tailwind text color
    blurb: string;
    concepts: Concept[];
}

const MODULES: Module[] = [
    {
        id: 'returns',
        title: 'Portfolio Summary & Return',
        icon: Wallet,
        accent: 'text-blue-400',
        blurb: 'The headline numbers a client sees first — what it is worth and how it has done.',
        concepts: [
            {
                term: 'AUM (Assets Under Management)',
                plain: 'The total market value of everything in the book right now.',
                formula: 'AUM = Σ (price_i × shares_i)   — all in one base currency',
                why: 'It is the denominator for almost every weight and return figure on the dashboard.',
                sayIt: '"AUM is just the current value of all holdings, converted to one currency."',
            },
            {
                term: 'Total Return',
                plain: 'How much the portfolio gained or lost over a period, as a percentage.',
                formula: 'return = (end value − start value + income) / start value',
                why: 'The number performance is ultimately judged on.',
                sayIt: '"Return is end-over-start, including any dividends or income."',
            },
            {
                term: 'Time-weighted vs Money-weighted return',
                plain: 'TWR strips out the timing of deposits/withdrawals (judges the strategy); MWR / IRR reflects when cash went in (judges the investor’s actual experience).',
                formula: 'TWR = Π (1 + r_subperiod) − 1',
                why: 'Funds report time-weighted so performance is not flattered or punished by client cash flows.',
                sayIt: '"Time-weighted judges the manager; money-weighted judges the investor’s outcome."',
            },
            {
                term: 'Benchmark / Active Return',
                plain: 'Your return minus the benchmark’s return over the same window.',
                formula: 'active return = r_portfolio − r_benchmark',
                why: 'Beating the benchmark (positive active return / alpha) is the entire point of active management.',
                sayIt: '"Active return is how much I beat the index by — that’s what active management is paid for."',
            },
        ],
    },
    {
        id: 'exposure',
        title: 'Exposure & Allocation',
        icon: PieChart,
        accent: 'text-violet-400',
        blurb: 'Where the money actually sits, and how far that is from the benchmark.',
        concepts: [
            {
                term: 'Position Weight',
                plain: 'How much of the book a single holding represents.',
                formula: 'weight_i = value_i / AUM',
                why: 'Risk concentrates in the big weights — this is the first thing to scan.',
                sayIt: '"A position’s weight is its value over total AUM."',
            },
            {
                term: 'Active Weight (over / underweight)',
                plain: 'How far your weight in a sector or name is from the benchmark’s weight.',
                formula: 'active weight = w_portfolio − w_benchmark',
                why: 'It is the deliberate bet you are making relative to the index.',
                sayIt: '"Overweight means I hold more of it than the benchmark does — a conscious bet."',
            },
            {
                term: 'Concentration (Herfindahl)',
                plain: 'One number for how concentrated vs diversified the book is.',
                formula: 'HHI = Σ w_i²   (higher = more concentrated)',
                why: 'High concentration means more idiosyncratic, single-name risk.',
                sayIt: '"Sum of squared weights — closer to 1 means eggs in very few baskets."',
            },
        ],
    },
    {
        id: 'risk',
        title: 'Risk Metrics',
        icon: Activity,
        accent: 'text-amber-400',
        blurb: 'The standard toolkit. This is the highest-value section to be able to explain cold.',
        concepts: [
            {
                term: 'Volatility',
                plain: 'How much returns bounce around — the standard measure of risk.',
                formula: 'σ_annual = stdev(daily returns) × √252',
                why: 'The base ingredient for Sharpe, VaR and position sizing.',
                sayIt: '"Volatility is the standard deviation of returns, scaled up to a year."',
            },
            {
                term: 'Beta',
                plain: 'How much the portfolio moves when the market moves 1%.',
                formula: 'β = Cov(r_p, r_market) / Var(r_market)',
                why: 'Separates market risk from stock-specific risk. β > 1 = more volatile than the market.',
                sayIt: '"Beta of 1.2 means I move about 1.2% when the market moves 1%."',
            },
            {
                term: 'Sharpe Ratio',
                plain: 'Return earned per unit of risk taken.',
                formula: 'Sharpe = (r_p − r_f) / σ_p   (annualised)',
                why: 'Lets you compare strategies on a risk-adjusted basis — higher is better.',
                sayIt: '"Sharpe is excess return over volatility — reward per unit of risk."',
            },
            {
                term: 'Value at Risk (VaR)',
                plain: 'A loss threshold you expect to breach only X% of the time.',
                formula: '95% 1-day VaR ≈ 5th percentile of the daily return distribution',
                why: 'A single intuitive "how bad is a bad day" number used in most risk reports.',
                sayIt: '"95% VaR of 2% means on the worst 1-in-20 days I’d expect to lose at least 2%."',
            },
            {
                term: 'Correlation',
                plain: 'Whether two holdings move together (+1), opposite (−1), or independently (0).',
                formula: 'ρ(a,b) = Cov(a,b) / (σ_a · σ_b)',
                why: 'Diversification only works when correlations are low; a matrix exposes hidden clustering.',
                sayIt: '"Two names at +0.9 aren’t diversification — they’re one bet held twice."',
            },
            {
                term: 'Max Drawdown',
                plain: 'The worst peak-to-trough drop over the period.',
                formula: 'maxDD = max_t (peak − value_t) / peak',
                why: 'The pain a holder actually feels — it drives whether they stick with the strategy.',
                sayIt: '"Max drawdown is the biggest fall from a high before a new high is made."',
            },
        ],
    },
    {
        id: 'attribution',
        title: 'Performance Attribution',
        icon: BarChart3,
        accent: 'text-emerald-400',
        blurb: 'Not just what the return was — what drove it, and across which time windows.',
        concepts: [
            {
                term: 'Time Windows',
                plain: 'Returns measured over standard calendar / trailing periods.',
                formula: 'MTD: from 1st of month · QTD: from quarter start · YTD: from Jan 1 · 1Y: trailing 365d',
                why: 'Lets you compare like-for-like and separate recent from long-run performance.',
                sayIt: '"YTD is since Jan 1; 1Y is the trailing twelve months."',
            },
            {
                term: 'Return Contribution',
                plain: 'How much each holding or sector added to the total return.',
                formula: 'contribution_i = weight_i × return_i   (sum per sector for sector attribution)',
                why: 'Tells you what actually carried the book, not merely that it went up.',
                sayIt: '"Contribution is weight times return; sum by sector to see what drove it."',
            },
            {
                term: 'Brinson Attribution',
                plain: 'Splits out-performance into two skills: being in the right sectors (allocation) vs picking the right names within them (selection).',
                formula: 'allocation = (w_p − w_b)(r_b,sec − r_b,total) ·  selection = w_b(r_p,sec − r_b,sec)',
                why: 'Shows whether you add value through sector bets or through stock picking.',
                sayIt: '"Allocation = right sectors; selection = right stocks within them."',
            },
        ],
    },
];

// ─── Risk Playground math (pure) ───

const SAMPLE_RETURNS = '0.8, -1.2, 0.4, 1.5, -0.3, 0.9, -2.1, 0.6, 1.1, -0.7, 0.2, 0.5, -1.5, 1.8, -0.4, 0.3, 0.7, -0.9, 1.2, -0.6';

function parseReturns(raw: string): number[] {
    return raw
        .split(/[\s,]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter(Number.isFinite)
        .map(n => n / 100); // entered as %, stored as decimal
}

function mean(xs: number[]): number {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function stdevSample(xs: number[]): number {
    if (xs.length < 2) return 0;
    const m = mean(xs);
    const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
    return Math.sqrt(variance);
}

function percentile(xs: number[], p: number): number {
    if (!xs.length) return 0;
    const sorted = [...xs].sort((a, b) => a - b);
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const loV = sorted[lo] ?? 0; // lo/hi are in-bounds (idx ∈ [0, len-1]); ?? satisfies noUncheckedIndexedAccess
    const hiV = sorted[hi] ?? 0;
    if (lo === hi) return loV;
    return loV + (idx - lo) * (hiV - loV);
}

function maxDrawdown(rets: number[]): number {
    let equity = 1;
    let peak = 1;
    let maxDD = 0;
    for (const r of rets) {
        equity *= 1 + r;
        if (equity > peak) peak = equity;
        const dd = (peak - equity) / peak;
        if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
}

const TRADING_DAYS = 252;

function RiskPlayground() {
    const [raw, setRaw] = useState(SAMPLE_RETURNS);
    const [rfAnnual, setRfAnnual] = useState('4');

    const stats = useMemo(() => {
        const rets = parseReturns(raw);
        if (rets.length < 2) return null;
        const dailyStd = stdevSample(rets);
        const dailyMean = mean(rets);
        const rfDaily = (Number(rfAnnual) || 0) / 100 / TRADING_DAYS;
        const annVol = dailyStd * Math.sqrt(TRADING_DAYS);
        const annRet = dailyMean * TRADING_DAYS; // arithmetic approximation
        const sharpe = dailyStd > 0 ? ((dailyMean - rfDaily) / dailyStd) * Math.sqrt(TRADING_DAYS) : 0;
        const var95 = Math.max(0, -percentile(rets, 0.05));
        const mdd = maxDrawdown(rets);
        return { n: rets.length, annVol, annRet, sharpe, var95, mdd };
    }, [raw, rfAnnual]);

    const pct = (x: number) => `${(x * 100).toFixed(2)}%`;

    return (
        <div className="glass-panel p-5 rounded-xl space-y-4">
            <div className="flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-semibold text-sentinel-100">Risk Playground</h3>
            </div>
            <p className="text-sm text-sentinel-400">
                Paste a series of daily returns (as %, comma or space separated) and watch the metrics
                move. This is the fastest way to build intuition for what each number actually measures.
            </p>

            <div className="space-y-3">
                <div>
                    <label className="text-xs text-sentinel-500 block mb-1">Daily returns (%)</label>
                    <textarea
                        value={raw}
                        onChange={e => setRaw(e.target.value)}
                        rows={3}
                        className="w-full text-sm font-mono text-sentinel-200 bg-sentinel-900/60 border border-sentinel-700/50 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400/50"
                        spellCheck={false}
                    />
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="text-xs text-sentinel-500 block mb-1">Risk-free rate (annual %)</label>
                        <input
                            value={rfAnnual}
                            onChange={e => setRfAnnual(e.target.value)}
                            className="w-28 text-sm font-mono text-sentinel-200 bg-sentinel-900/60 border border-sentinel-700/50 rounded-lg px-3 py-2 focus:outline-none focus:border-amber-400/50"
                        />
                    </div>
                    <button
                        onClick={() => setRaw(SAMPLE_RETURNS)}
                        className="px-3 py-2 text-sm font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
                        Reset sample
                    </button>
                </div>
            </div>

            {stats ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                    {[
                        { label: 'Annualised volatility', value: pct(stats.annVol), hint: 'daily σ × √252' },
                        { label: 'Annualised return', value: pct(stats.annRet), hint: 'arithmetic, approx' },
                        { label: 'Sharpe ratio', value: stats.sharpe.toFixed(2), hint: 'excess return / σ' },
                        { label: '95% 1-day VaR', value: pct(stats.var95), hint: '5th-percentile loss' },
                        { label: 'Max drawdown', value: pct(stats.mdd), hint: 'worst peak→trough' },
                        { label: 'Observations', value: String(stats.n), hint: 'data points' },
                    ].map(m => (
                        <div key={m.label} className="bg-sentinel-900/50 rounded-lg p-3 border border-sentinel-800/60">
                            <div className="text-xs text-sentinel-500">{m.label}</div>
                            <div className="text-lg font-bold text-sentinel-100 font-mono">{m.value}</div>
                            <div className="text-[11px] text-sentinel-600 mt-0.5">{m.hint}</div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-amber-400/80">Enter at least two returns to compute the metrics.</p>
            )}
        </div>
    );
}

// ─── Concept card ───

function ConceptCard({ c, accent }: { c: Concept; accent: string }) {
    return (
        <div className="glass-panel p-4 rounded-xl space-y-2">
            <h4 className={`text-base font-semibold ${accent}`}>{c.term}</h4>
            <p className="text-sm text-sentinel-300">{c.plain}</p>
            {c.formula && (
                <code className="block text-[13px] font-mono text-sentinel-200 bg-sentinel-900/60 px-3 py-2 rounded-lg overflow-x-auto">
                    {c.formula}
                </code>
            )}
            <p className="text-xs text-sentinel-500">
                <span className="text-sentinel-400 font-medium">Why it matters: </span>{c.why}
            </p>
            <div className="flex items-start gap-2 pt-1">
                <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs italic text-sentinel-300">{c.sayIt}</p>
            </div>
        </div>
    );
}

// ─── Page ───

export function Learning() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                    <GraduationCap className="w-8 h-8 text-blue-400" />
                    Learning — Analyst Toolkit
                </h1>
            </div>

            <div className="glass-panel p-4 rounded-xl flex items-start gap-3">
                <Sigma className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                <p className="text-sm text-sentinel-300">
                    The goal isn’t to memorise these — it’s to be able to explain each one out loud.
                    Every card ends with a one-line version you could say in a meeting.
                    <span className="text-sentinel-400"> If you can’t explain it, you don’t really have it yet.</span>
                </p>
            </div>

            {MODULES.map((mod, i) => (
                <motion.section
                    key={mod.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="space-y-3"
                >
                    <div className="flex items-center gap-2">
                        <mod.icon className={`w-5 h-5 ${mod.accent}`} />
                        <h2 className="text-xl font-semibold text-sentinel-100">{mod.title}</h2>
                    </div>
                    <p className="text-sm text-sentinel-400">{mod.blurb}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {mod.concepts.map(c => (
                            <ConceptCard key={c.term} c={c} accent={mod.accent} />
                        ))}
                    </div>
                </motion.section>
            ))}

            <RiskPlayground />
        </div>
    );
}

export default Learning;
