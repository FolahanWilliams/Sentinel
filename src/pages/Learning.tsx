/**
 * Learning — Analyst Toolkit
 *
 * A personal, evergreen curriculum for portfolio analytics: returns, risk, the
 * risk-adjusted ratios, market/CAPM, portfolio construction, tail risk, and
 * attribution. Seven modules, each pairing plain-English concept cards (with a
 * "say it in one line" so the goal is to explain, not memorise) with interactive
 * SVG visualizations you drive with sliders.
 *
 * Pure client-side; no live-portfolio or data dependencies. Lazy-loaded route.
 */

import { useState } from 'react';
import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import {
    GraduationCap, Sigma, Wallet, Activity, Gauge, Network, PieChart, Siren, BarChart3,
    type LucideIcon,
} from 'lucide-react';
import { ModuleReturns } from '@/components/learning/ModuleReturns';
import { ModuleRisk } from '@/components/learning/ModuleRisk';
import { ModuleRiskAdjusted } from '@/components/learning/ModuleRiskAdjusted';
import { ModuleMarket } from '@/components/learning/ModuleMarket';
import { ModulePortfolio } from '@/components/learning/ModulePortfolio';
import { ModuleTail } from '@/components/learning/ModuleTail';
import { ModuleAttribution } from '@/components/learning/ModuleAttribution';

interface Tab {
    id: string;
    label: string;
    icon: LucideIcon;
    accent: string;
    activeBg: string;
    Component: ComponentType;
}

const TABS: Tab[] = [
    { id: 'returns', label: 'Returns', icon: Wallet, accent: 'text-blue-400', activeBg: 'bg-blue-500/10 border-blue-500/30 text-blue-300', Component: ModuleReturns },
    { id: 'risk', label: 'Risk', icon: Activity, accent: 'text-amber-400', activeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300', Component: ModuleRisk },
    { id: 'risk-adjusted', label: 'Risk-Adjusted', icon: Gauge, accent: 'text-violet-400', activeBg: 'bg-violet-500/10 border-violet-500/30 text-violet-300', Component: ModuleRiskAdjusted },
    { id: 'market', label: 'Market & CAPM', icon: Network, accent: 'text-cyan-400', activeBg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300', Component: ModuleMarket },
    { id: 'portfolio', label: 'Portfolio (MPT)', icon: PieChart, accent: 'text-fuchsia-400', activeBg: 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-300', Component: ModulePortfolio },
    { id: 'tail', label: 'Tail Risk', icon: Siren, accent: 'text-rose-400', activeBg: 'bg-rose-500/10 border-rose-500/30 text-rose-300', Component: ModuleTail },
    { id: 'attribution', label: 'Attribution', icon: BarChart3, accent: 'text-emerald-400', activeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300', Component: ModuleAttribution },
];

export function Learning() {
    const [active, setActive] = useState('returns');
    const current = TABS.find(t => t.id === active) ?? TABS[0]!;
    const Body = current.Component;

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
                <p className="text-sm text-sentinel-300 leading-relaxed">
                    Seven modules covering what a portfolio analyst actually needs. The goal isn’t to memorise the
                    formulas — it’s to <span className="text-sentinel-100 font-medium">explain each one out loud</span>.
                    Every card ends with a one-line version you could say in a meeting, and every chart is yours to
                    drag. <span className="text-sentinel-400">If you can’t explain it, you don’t have it yet.</span>
                </p>
            </div>

            {/* Module tabs */}
            <div className="flex flex-wrap gap-2">
                {TABS.map(t => {
                    const isActive = t.id === active;
                    return (
                        <button
                            key={t.id}
                            onClick={() => setActive(t.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${isActive ? t.activeBg : 'border-transparent text-sentinel-400 hover:text-sentinel-200 hover:bg-sentinel-800/40'}`}
                        >
                            <t.icon className={`w-4 h-4 ${isActive ? '' : t.accent}`} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                <Body />
            </motion.div>
        </div>
    );
}

export default Learning;
