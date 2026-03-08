/**
 * SourceCitations — Displays grounding source URLs from Gemini's Google Search.
 * Compact, inline citation links that build trust in AI-generated analysis.
 */

import { ExternalLink } from 'lucide-react';
import type { GroundingSource } from '@/types/agents';

interface SourceCitationsProps {
    sources: GroundingSource[];
    maxVisible?: number;
}

/** Extract a short display name from a URL (e.g. "reuters.com") */
function displayHost(url: string): string {
    try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        return host;
    } catch {
        return url.slice(0, 30);
    }
}

export function SourceCitations({ sources, maxVisible = 4 }: SourceCitationsProps) {
    if (!sources || sources.length === 0) return null;

    // Deduplicate by hostname
    const seen = new Set<string>();
    const unique = sources.filter(s => {
        const host = displayHost(s.url);
        if (seen.has(host)) return false;
        seen.add(host);
        return true;
    });

    const visible = unique.slice(0, maxVisible);
    const remaining = unique.length - visible.length;

    return (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[10px] uppercase tracking-wider text-sentinel-500 font-medium">Sources:</span>
            {visible.map((source, i) => (
                <a
                    key={i}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded bg-sentinel-800/60 text-sentinel-300 hover:text-sentinel-100 hover:bg-sentinel-700/60 transition-colors"
                    title={source.title || source.url}
                >
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    {source.title ? source.title.slice(0, 40) : displayHost(source.url)}
                </a>
            ))}
            {remaining > 0 && (
                <span className="text-[10px] text-sentinel-500">+{remaining} more</span>
            )}
        </div>
    );
}
