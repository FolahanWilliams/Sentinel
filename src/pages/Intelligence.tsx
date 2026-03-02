import { SentinelPanel } from '@/components/sentinel/SentinelPanel';

export function Intelligence() {
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sentinel-100 to-sentinel-400">
                    News Intelligence
                </h1>
                <p className="text-sentinel-400 mt-2 font-mono text-sm max-w-3xl">
                    Aggregating and analyzing 42 curated data streams via Gemini. Deduplicating noise and extracting market signals.
                </p>
            </header>

            <SentinelPanel />
        </div>
    );
}
