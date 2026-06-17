/**
 * Learning — shared UI primitives.
 *
 * Small building blocks the module + visualization components compose: a figure
 * frame, a labelled slider, stat pills, formula blocks, concept cards, and the
 * "say it in one line" takeaway. Styling matches the Sentinel palette
 * (sentinel-*, glass-panel).
 */

import type { ComponentType, ReactNode } from 'react';
import { Lightbulb, AlertTriangle } from 'lucide-react';

export interface Concept {
    term: string;
    plain: string;
    formula?: string;
    why: string;
    sayIt: string;
}

export function SectionHeader({ icon: Icon, title, blurb, accent }: { icon: ComponentType<{ className?: string }>; title: string; blurb: string; accent: string }) {
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-2">
                <Icon className={`w-5 h-5 ${accent}`} />
                <h2 className="text-xl font-semibold text-sentinel-100">{title}</h2>
            </div>
            <p className="text-sm text-sentinel-400 leading-relaxed">{blurb}</p>
        </div>
    );
}

export function ConceptCard({ c, accent }: { c: Concept; accent: string }) {
    return (
        <div className="glass-panel p-4 rounded-xl space-y-2">
            <h4 className={`text-base font-semibold ${accent}`}>{c.term}</h4>
            <p className="text-sm text-sentinel-300 leading-relaxed">{c.plain}</p>
            {c.formula && <FormulaBlock>{c.formula}</FormulaBlock>}
            <p className="text-xs text-sentinel-500 leading-relaxed">
                <span className="text-sentinel-400 font-medium">Why it matters: </span>
                {c.why}
            </p>
            <Takeaway>{c.sayIt}</Takeaway>
        </div>
    );
}

export function FormulaBlock({ children }: { children: ReactNode }) {
    return (
        <code className="block text-[13px] font-mono text-sentinel-200 bg-sentinel-900/60 px-3 py-2 rounded-lg overflow-x-auto whitespace-pre-wrap">
            {children}
        </code>
    );
}

export function Takeaway({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-start gap-2 pt-0.5">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs italic text-sentinel-300 leading-relaxed">{children}</p>
        </div>
    );
}

export function Caveat({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-start gap-2 rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-sentinel-300 leading-relaxed">{children}</p>
        </div>
    );
}

export function Figure({ title, caption, children, accent = 'text-blue-400' }: { title: string; caption?: ReactNode; children: ReactNode; accent?: string }) {
    return (
        <div className="glass-panel p-4 rounded-xl space-y-3">
            <h4 className={`text-sm font-semibold ${accent}`}>{title}</h4>
            <div>{children}</div>
            {caption && <p className="text-xs text-sentinel-400 leading-relaxed">{caption}</p>}
        </div>
    );
}

export function Slider({ label, min, max, step = 0.01, value, onChange, format, accent = 'accent-blue-400' }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; format?: (v: number) => string; accent?: string }) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-sentinel-400">{label}</span>
                <span className="text-sentinel-200 font-mono">{format ? format(value) : value}</span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className={`w-full ${accent} cursor-pointer`}
            />
        </div>
    );
}

export function StatPill({ label, value, accent = 'text-sentinel-100', hint }: { label: string; value: string; accent?: string; hint?: string }) {
    return (
        <div className="bg-sentinel-900/50 rounded-lg px-3 py-2 border border-sentinel-800/60">
            <div className="text-[11px] text-sentinel-500">{label}</div>
            <div className={`text-base font-bold font-mono ${accent}`}>{value}</div>
            {hint && <div className="text-[10px] text-sentinel-600 mt-0.5">{hint}</div>}
        </div>
    );
}

/** Concept grid + figure layout helpers. */
export function ConceptGrid({ concepts, accent }: { concepts: Concept[]; accent: string }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {concepts.map(c => (
                <ConceptCard key={c.term} c={c} accent={accent} />
            ))}
        </div>
    );
}
