/**
 * TradeReviewCard — Renders a structured journal entry with
 * AI post-mortem, PnL badge, screenshots, and reflection fields.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Tag, ChevronDown, ChevronUp, Brain, Camera,
    TrendingUp, TrendingDown, ExternalLink, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { parseJournalContent } from '@/services/journalService';

const MOOD_LABELS: Record<string, string> = { '😡': 'Frustrated', '😐': 'Neutral', '😊': 'Confident', '🔥': 'On Fire' };

interface TradeReviewCardProps {
    entry: any;
}

export function TradeReviewCard({ entry }: TradeReviewCardProps) {
    const [expanded, setExpanded] = useState(false);
    const parsed = parseJournalContent(entry);
    const s = parsed.structured;

    // Legacy entries: parse PnL from content
    let legacyPnl: number | null = null;
    if (!s) {
        const entryMatch = (entry.content || '').match(/Entry:\s*\$?([\d.]+)/);
        const exitMatch = (entry.content || '').match(/Exit:\s*\$?([\d.]+)/);
        const ep = entryMatch ? parseFloat(entryMatch[1]) : null;
        const xp = exitMatch ? parseFloat(exitMatch[1]) : null;
        if (ep && xp) {
            legacyPnl = ((xp - ep) / ep) * 100;
            if (entry.entry_type === 'short') legacyPnl = -legacyPnl;
        }
    }

    const pnl = s?.pnl_pct ?? legacyPnl;
    const hasPnl = pnl !== null && pnl !== undefined;

    return (
        <div className="p-4 sm:p-5 hover:bg-white/[0.03] transition-colors">
            {/* Header Row */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                    {entry.mood && <span className="text-lg" title={MOOD_LABELS[entry.mood]}>{entry.mood}</span>}
                    <span className="text-lg font-bold text-sentinel-100">
                        {entry.ticker || 'General'}
                    </span>
                    <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                        entry.entry_type === 'long' ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20'
                        : entry.entry_type === 'short' ? 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20'
                        : 'bg-sentinel-700/30 text-sentinel-400 ring-1 ring-sentinel-600/30'
                    }`}>
                        {(entry.entry_type || 'unknown').toUpperCase()}
                    </span>
                    {entry.ticker && (
                        <Link
                            to={`/analysis/${entry.ticker}`}
                            className="text-sentinel-500 hover:text-blue-400 transition-colors"
                            title="View Analysis"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                    )}
                </div>
                <div className="flex gap-4 items-center">
                    {hasPnl ? (
                        <div className="flex items-center gap-2">
                            {pnl >= 0
                                ? <TrendingUp className="w-4 h-4 text-emerald-400" />
                                : <TrendingDown className="w-4 h-4 text-red-400" />
                            }
                            <div className="text-right">
                                <div className="text-[10px] text-sentinel-500 font-mono">Realized PnL</div>
                                <div className={`font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                                    {s?.pnl_usd != null && (
                                        <span className="text-xs ml-1">
                                            ({s.pnl_usd >= 0 ? '+' : ''}${s.pnl_usd.toFixed(0)})
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="text-right">
                            <div className="text-[10px] text-sentinel-500 font-mono">Status</div>
                            <div className="font-bold text-amber-400">OPEN</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Tags */}
            {entry.tags?.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                    {entry.tags.map((t: string) => (
                        <span key={t} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-sentinel-800/50 text-sentinel-500 text-[10px] rounded-full">
                            <Tag className="w-2.5 h-2.5" />{t}
                        </span>
                    ))}
                </div>
            )}

            {/* Date */}
            <div className="text-xs text-sentinel-500 mb-2">
                {new Date(entry.created_at).toLocaleDateString('en-US', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                })}
                {s?.holding_days != null && (
                    <span className="ml-2 text-sentinel-600">({s.holding_days}d hold)</span>
                )}
            </div>

            {/* Structured Entry Content */}
            {s ? (
                <div className="space-y-3">
                    {/* Price Summary */}
                    <div className="flex flex-wrap gap-3 text-xs font-mono">
                        {s.entry_price && (
                            <span className="text-sentinel-300">
                                Entry: <span className="text-sentinel-100">${s.entry_price.toFixed(2)}</span>
                            </span>
                        )}
                        {s.exit_price ? (
                            <span className="text-sentinel-300">
                                Exit: <span className="text-sentinel-100">${s.exit_price.toFixed(2)}</span>
                            </span>
                        ) : null}
                        {s.stop_loss && (
                            <span className="text-red-400/70">
                                Stop: ${s.stop_loss.toFixed(2)}
                            </span>
                        )}
                        {s.target_price && (
                            <span className="text-emerald-400/70">
                                Target: ${s.target_price.toFixed(2)}
                            </span>
                        )}
                        {s.shares && (
                            <span className="text-sentinel-400">
                                {s.shares} shares
                            </span>
                        )}
                    </div>

                    {/* Entry Rationale */}
                    {s.entry_rationale && (
                        <div className="bg-white/5 p-3 rounded-lg border-l-4 border-l-blue-500/50">
                            <div className="text-[10px] uppercase tracking-wider text-blue-400/70 mb-1">Entry Rationale</div>
                            <p className="text-sm text-sentinel-300 leading-relaxed whitespace-pre-wrap">{s.entry_rationale}</p>
                        </div>
                    )}

                    {/* Expandable Section */}
                    <button
                        onClick={() => setExpanded(!expanded)}
                        className="flex items-center gap-1.5 text-xs text-sentinel-500 hover:text-sentinel-300 transition-colors border-none bg-transparent cursor-pointer"
                    >
                        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {expanded ? 'Show less' : 'Show review & post-mortem'}
                    </button>

                    {expanded && (
                        <div className="space-y-3 animate-in fade-in duration-200">
                            {/* Post-Trade Review */}
                            {s.post_trade_review && (
                                <div className="bg-white/5 p-3 rounded-lg border-l-4 border-l-purple-500/50">
                                    <div className="text-[10px] uppercase tracking-wider text-purple-400/70 mb-1">Post-Trade Review</div>
                                    <p className="text-sm text-sentinel-300 leading-relaxed whitespace-pre-wrap">{s.post_trade_review}</p>
                                </div>
                            )}

                            {/* Reflection Fields */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {s.what_went_well && (
                                    <div className="bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/10">
                                        <div className="text-[10px] uppercase tracking-wider text-emerald-400/70 mb-1 flex items-center gap-1">
                                            <ThumbsUp className="w-3 h-3" /> What went well
                                        </div>
                                        <p className="text-xs text-sentinel-300">{s.what_went_well}</p>
                                    </div>
                                )}
                                {s.what_went_wrong && (
                                    <div className="bg-red-500/5 p-3 rounded-lg border border-red-500/10">
                                        <div className="text-[10px] uppercase tracking-wider text-red-400/70 mb-1 flex items-center gap-1">
                                            <ThumbsDown className="w-3 h-3" /> What went wrong
                                        </div>
                                        <p className="text-xs text-sentinel-300">{s.what_went_wrong}</p>
                                    </div>
                                )}
                            </div>

                            {s.lessons_learned && (
                                <div className="bg-amber-500/5 p-3 rounded-lg border border-amber-500/10">
                                    <div className="text-[10px] uppercase tracking-wider text-amber-400/70 mb-1">Lessons Learned</div>
                                    <p className="text-xs text-sentinel-300">{s.lessons_learned}</p>
                                </div>
                            )}

                            {s.would_take_again !== null && (
                                <div className="text-xs text-sentinel-400">
                                    Would take this trade again: <span className={s.would_take_again ? 'text-emerald-400' : 'text-red-400'}>
                                        {s.would_take_again ? 'Yes' : 'No'}
                                    </span>
                                </div>
                            )}

                            {/* AI Post-Mortem */}
                            {s.ai_post_mortem && (
                                <div className="bg-gradient-to-br from-purple-500/5 to-blue-500/5 p-4 rounded-lg border border-purple-500/15">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Brain className="w-4 h-4 text-purple-400" />
                                        <span className="text-xs font-semibold text-purple-300 uppercase tracking-wider">AI Post-Mortem</span>
                                    </div>
                                    <p className="text-sm text-sentinel-300 leading-relaxed">{s.ai_post_mortem}</p>
                                </div>
                            )}

                            {/* Screenshots */}
                            {s.screenshots && s.screenshots.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <Camera className="w-3.5 h-3.5 text-sentinel-400" />
                                        <span className="text-[10px] uppercase tracking-wider text-sentinel-400">Screenshots</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {s.screenshots.map((src, i) => (
                                            <img
                                                key={i}
                                                src={src}
                                                alt={`Trade screenshot ${i + 1}`}
                                                className="rounded-lg border border-sentinel-800/50 w-full h-32 object-cover cursor-pointer hover:opacity-80 transition-opacity"
                                                onClick={() => window.open(src, '_blank')}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                /* Legacy plain-text entry */
                <p className="text-sm text-sentinel-300 leading-relaxed bg-white/5 p-3 rounded-lg border-l-4 border-l-sentinel-600 whitespace-pre-wrap">
                    {entry.content || entry.notes}
                </p>
            )}
        </div>
    );
}
