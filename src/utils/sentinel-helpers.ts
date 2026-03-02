import { ArticleCategory, FeedCategory } from '@/types/sentinel';

// Map specific to the AI-assigned broader categories
export const CATEGORY_COLORS: Record<ArticleCategory, string> = {
    ai_ml: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    crypto_web3: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    macro_economy: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    tech_earnings: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    startups_vc: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
    cybersecurity: 'bg-red-500/10 text-red-400 border-red-500/20',
    regulation_policy: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    semiconductors: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    markets_trading: 'bg-green-500/10 text-green-400 border-green-500/20',
    geopolitics: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    other: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export const SENTIMENT_COLORS = {
    bullish: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    bearish: 'bg-red-500/10 text-red-400 border-red-500/20',
    neutral: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

export const IMPACT_STYLES = {
    high: 'font-bold text-amber-400 border-l-4 border-amber-400 bg-sentinel-800/50',
    medium: 'text-orange-300 border-l-2 border-orange-500/30',
    low: 'text-zinc-500',
};

export function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
}
