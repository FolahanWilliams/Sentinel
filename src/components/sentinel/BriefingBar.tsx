import type { DailyBriefing, SentinelResponse } from '@/types/sentinel';
import { Activity, Clock, ShieldAlert, Zap, Compass, CheckCircle2 } from 'lucide-react';
import { SENTIMENT_COLORS } from '@/utils/sentinel-helpers';

interface BriefingBarProps {
    briefing: DailyBriefing;
    meta: SentinelResponse['meta'];
}

export function BriefingBar({ briefing, meta }: BriefingBarProps) {

    const moodConfig = {
        'risk-on': { color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: Zap },
        'risk-off': { color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: ShieldAlert },
        'mixed': { color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', icon: Compass }
    };

    const moodMatch = moodConfig[briefing.market_mood] || moodConfig['mixed'];
    const MoodIcon = moodMatch.icon;

    return (
        <div className="bg-sentinel-800/40 border border-sentinel-700/50 rounded-xl overflow-hidden backdrop-blur-md">
            {/* Top Stats Row */}
            <div className="flex flex-wrap items-center justify-between p-4 border-b border-sentinel-700/30 bg-sentinel-900/20">
                <div className="flex items-center space-x-4">
                    <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border ${moodMatch.color}`}>
                        <MoodIcon className="h-4 w-4" />
                        <span className="text-sm font-bold uppercase tracking-wider">{briefing.market_mood}</span>
                    </div>

                    <div className="hidden sm:flex items-center space-x-3 text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SENTIMENT_COLORS.bullish}`}>
                            {briefing.signal_count.bullish} Bullish
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SENTIMENT_COLORS.bearish}`}>
                            {briefing.signal_count.bearish} Bearish
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SENTIMENT_COLORS.neutral}`}>
                            {briefing.signal_count.neutral} Neutral
                        </span>
                    </div>
                </div>

                <div className="flex items-center space-x-4 text-xs text-sentinel-400 font-mono mt-2 sm:mt-0">
                    <div className="flex items-center">
                        <Activity className="h-3 w-3 mr-1" />
                        <span>{meta.articlesNew} new / {meta.articlesDeduplicated} deduped</span>
                    </div>
                    <div className="flex items-center text-sentinel-500">
                        <Clock className="h-3 w-3 mr-1" />
                        <span>{meta.processingTimeMs}ms CPU</span>
                    </div>
                </div>
            </div>

            {/* Bottom Content Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-sentinel-700/30">
                {/* Top Stories */}
                <div className="p-4 bg-gradient-to-br from-transparent to-sentinel-900/10">
                    <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-widest mb-3 flex items-center">
                        <CheckCircle2 className="h-3 w-3 mr-1.5 text-sentinel-500" />
                        Key Takeaways
                    </h3>
                    <ul className="space-y-2">
                        {briefing.top_stories.map((story, i) => (
                            <li key={i} className="text-sm text-sentinel-100 flex items-start">
                                <span className="text-sentinel-500 mr-2 font-mono text-xs mt-0.5">{i + 1}.</span>
                                <span className="leading-snug">{story}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Trending Topics */}
                <div className="p-4">
                    <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-widest mb-3 flex items-center">
                        <Activity className="h-3 w-3 mr-1.5 text-sentinel-500" />
                        Trending Themes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {briefing.trending_topics.map((topic, i) => (
                            <span key={i} className="px-3 py-1 bg-sentinel-800 border border-sentinel-700/50 rounded-full text-xs text-sentinel-300 font-medium">
                                #{topic}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
