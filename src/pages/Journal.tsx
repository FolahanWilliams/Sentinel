/**
 * Journal — Enhanced trade journal with structured entries, AI post-mortems,
 * position linking, screenshot support, calendar heatmap, and reflection fields.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import {
    BookOpen, Plus, Search, Download, X, Tag, Camera,
    ThumbsUp, ThumbsDown, Brain, Loader2, Image,
} from 'lucide-react';
import { CalendarHeatmap } from '@/components/journal/CalendarHeatmap';
import { TradeReviewCard } from '@/components/journal/TradeReviewCard';
import { JournalService } from '@/services/journalService';
import { EmptyState } from '@/components/shared/EmptyState';
import { exportJournalToCSV, downloadCSV } from '@/utils/exportData';

const MOODS = ['😡', '😐', '😊', '🔥'] as const;
const MOOD_LABELS: Record<string, string> = { '😡': 'Frustrated', '😐': 'Neutral', '😊': 'Confident', '🔥': 'On Fire' };
const ENTRY_TYPES = ['long', 'short', 'thesis', 'learning', 'mistake', 'general'] as const;

const STORAGE_KEYS = {
    SEARCH: 'sentinel_journal_search',
    TYPE: 'sentinel_journal_type',
    MOOD: 'sentinel_journal_mood',
    TAG: 'sentinel_journal_tag',
    DATE: 'sentinel_journal_date',
} as const;

export function Journal() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [entries, setEntries] = useState<any[]>([]);
    const [macroEvents, setMacroEvents] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getStoredState = (key: string, defaultValue: string | null = null): any => {
        try {
            const stored = sessionStorage.getItem(key);
            if (stored) return JSON.parse(stored);
        } catch { /* ignore */ }
        return defaultValue;
    };

    // Pre-fill from URL
    const prefillTicker = searchParams.get('ticker') || '';
    const prefillEntry = searchParams.get('entry') || '';
    const prefillThesis = searchParams.get('thesis') ? decodeURIComponent(searchParams.get('thesis')!) : '';
    const hasPrefill = !!prefillTicker;

    // Filters
    const [searchQuery, setSearchQuery] = useState(() => getStoredState(STORAGE_KEYS.SEARCH, ''));
    const [selectedType, setSelectedType] = useState<string | null>(() => getStoredState(STORAGE_KEYS.TYPE));
    const [selectedMood, setSelectedMood] = useState<string | null>(() => getStoredState(STORAGE_KEYS.MOOD));
    const [selectedTag, setSelectedTag] = useState<string | null>(() => getStoredState(STORAGE_KEYS.TAG));
    const [selectedDate, setSelectedDate] = useState<string | null>(() => getStoredState(STORAGE_KEYS.DATE));

    // Persist filters
    useEffect(() => sessionStorage.setItem(STORAGE_KEYS.SEARCH, JSON.stringify(searchQuery)), [searchQuery]);
    useEffect(() => {
        if (selectedType) sessionStorage.setItem(STORAGE_KEYS.TYPE, JSON.stringify(selectedType));
        else sessionStorage.removeItem(STORAGE_KEYS.TYPE);
    }, [selectedType]);
    useEffect(() => {
        if (selectedMood) sessionStorage.setItem(STORAGE_KEYS.MOOD, JSON.stringify(selectedMood));
        else sessionStorage.removeItem(STORAGE_KEYS.MOOD);
    }, [selectedMood]);
    useEffect(() => {
        if (selectedTag) sessionStorage.setItem(STORAGE_KEYS.TAG, JSON.stringify(selectedTag));
        else sessionStorage.removeItem(STORAGE_KEYS.TAG);
    }, [selectedTag]);
    useEffect(() => {
        if (selectedDate) sessionStorage.setItem(STORAGE_KEYS.DATE, JSON.stringify(selectedDate));
        else sessionStorage.removeItem(STORAGE_KEYS.DATE);
    }, [selectedDate]);

    // Form State
    const [showForm, setShowForm] = useState(hasPrefill);
    const [ticker, setTicker] = useState(prefillTicker);
    const [direction, setDirection] = useState<'long' | 'short'>('long');
    const [entryPrice, setEntryPrice] = useState(prefillEntry);
    const [exitPrice, setExitPrice] = useState('');
    const [shares, setShares] = useState('');
    const [stopLoss, setStopLoss] = useState('');
    const [targetPrice, setTargetPrice] = useState('');
    const [entryRationale, setEntryRationale] = useState(prefillThesis);
    const [postTradeReview, setPostTradeReview] = useState('');
    const [lessonsLearned, setLessonsLearned] = useState('');
    const [whatWentWell, setWhatWentWell] = useState('');
    const [whatWentWrong, setWhatWentWrong] = useState('');
    const [wouldTakeAgain, setWouldTakeAgain] = useState<boolean | null>(null);
    const [mood, setMood] = useState('😐');
    const [tagInput, setTagInput] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [screenshots, setScreenshots] = useState<string[]>([]);

    // Closed positions for auto-fill
    const [recentPositions, setRecentPositions] = useState<any[]>([]);

    useEffect(() => {
        fetchEntries();
        fetchRecentPositions();
    }, []);

    async function fetchEntries() {
        setLoading(true);
        const { data, error } = await supabase
            .from('journal_entries')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) setEntries(data);

        const { data: eventsData, error: eventsError } = await supabase
            .from('market_events')
            .select('detected_at, headline, severity')
            .gte('severity', 8)
            .order('severity', { ascending: false });

        if (!eventsError && eventsData) {
            const eventsMap: Record<string, string> = {};
            eventsData.forEach(e => {
                const date = (e.detected_at || '').split('T')[0];
                if (date && !eventsMap[date]) eventsMap[date] = e.headline;
            });
            setMacroEvents(eventsMap);
        }
        setLoading(false);
    }

    async function fetchRecentPositions() {
        const { data } = await supabase
            .from('positions')
            .select('*')
            .eq('status', 'closed')
            .order('closed_at', { ascending: false })
            .limit(10);
        if (data) setRecentPositions(data);
    }

    function handlePositionSelect(posId: string) {
        const pos = recentPositions.find(p => p.id === posId);
        if (!pos) return;
        setTicker(pos.ticker);
        setDirection(pos.side as 'long' | 'short');
        setEntryPrice(pos.entry_price?.toString() || '');
        setExitPrice(pos.exit_price?.toString() || '');
        setShares(pos.shares?.toString() || '');
    }

    // Calendar heatmap data
    const entryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        entries.forEach(e => {
            const date = (e.created_at || '').split('T')[0];
            if (date) counts[date] = (counts[date] || 0) + 1;
        });
        return counts;
    }, [entries]);

    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        entries.forEach(e => (e.tags || []).forEach((t: string) => tagSet.add(t)));
        return Array.from(tagSet).sort();
    }, [entries]);

    const filteredEntries = useMemo(() => {
        let result = [...entries];
        if (selectedDate) result = result.filter(e => (e.created_at || '').startsWith(selectedDate));
        if (selectedType) result = result.filter(e => e.entry_type === selectedType);
        if (selectedMood) result = result.filter(e => e.mood === selectedMood);
        if (selectedTag) result = result.filter(e => (e.tags || []).includes(selectedTag));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(e =>
                (e.content || '').toLowerCase().includes(q) ||
                (e.ticker || '').toLowerCase().includes(q) ||
                (e.tags || []).some((t: string) => t.toLowerCase().includes(q))
            );
        }
        return result;
    }, [entries, selectedDate, selectedType, selectedMood, selectedTag, searchQuery]);

    function addTag() {
        const t = tagInput.trim().toLowerCase();
        if (t && !tags.includes(t)) setTags([...tags, t]);
        setTagInput('');
    }

    function handleScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
        const files = e.target.files;
        if (!files) return;
        Array.from(files).slice(0, 3 - screenshots.length).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result as string;
                if (result) setScreenshots(prev => [...prev, result].slice(0, 3));
            };
            reader.readAsDataURL(file);
        });
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();
        setSaving(true);

        const result = await JournalService.createEntry({
            ticker: ticker.toUpperCase(),
            direction,
            entry_price: entryPrice ? parseFloat(entryPrice) : null,
            exit_price: exitPrice ? parseFloat(exitPrice) : null,
            shares: shares ? parseInt(shares) : null,
            stop_loss: stopLoss ? parseFloat(stopLoss) : null,
            target_price: targetPrice ? parseFloat(targetPrice) : null,
            entry_rationale: entryRationale,
            post_trade_review: postTradeReview,
            mood,
            tags,
            screenshots,
            lessons_learned: lessonsLearned,
            what_went_well: whatWentWell,
            what_went_wrong: whatWentWrong,
            would_take_again: wouldTakeAgain ?? undefined,
        });

        setSaving(false);

        if (result.success) {
            setShowForm(false);
            setTicker(''); setEntryPrice(''); setExitPrice(''); setShares('');
            setStopLoss(''); setTargetPrice('');
            setEntryRationale(''); setPostTradeReview('');
            setLessonsLearned(''); setWhatWentWell(''); setWhatWentWrong('');
            setWouldTakeAgain(null);
            setMood('😐'); setTags([]); setTagInput(''); setScreenshots([]);
            if (hasPrefill) navigate('/journal', { replace: true });
            fetchEntries();
        } else {
            alert('Failed to save entry: ' + result.error);
        }
    }

    function exportMarkdown() {
        const lines = [
            `# Trade Journal Export`,
            `> Exported at ${new Date().toLocaleString()}`,
            `> ${filteredEntries.length} entries`,
            '',
        ];
        filteredEntries.forEach(entry => {
            const date = new Date(entry.created_at).toLocaleDateString();
            lines.push(`## ${entry.ticker || 'General'} — ${date}`);
            lines.push(`**Type:** ${entry.entry_type || 'unknown'} | **Mood:** ${entry.mood || 'N/A'}`);
            if (entry.tags?.length) lines.push(`**Tags:** ${entry.tags.join(', ')}`);
            lines.push('');
            lines.push(entry.content || '');
            lines.push('');
            lines.push('---');
            lines.push('');
        });
        const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `journal-export-${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    const activeFilters = [selectedType, selectedMood, selectedTag, selectedDate].filter(Boolean).length;

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* HEADER */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <BookOpen className="w-7 h-7 sm:w-8 sm:h-8 text-blue-400" /> Trade Journal
                    </h1>
                    <p className="text-sentinel-400 mt-1 text-sm">
                        Log executions, capture rationale, review biases, and get AI post-mortems.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={exportMarkdown}
                        className="px-3 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ring-1 ring-sentinel-700"
                    >
                        <Download className="w-4 h-4" /> <span className="hidden sm:inline">MD</span>
                    </button>
                    <button
                        onClick={() => {
                            const csv = exportJournalToCSV(filteredEntries);
                            downloadCSV(`journal-${new Date().toISOString().split('T')[0]}`, csv);
                        }}
                        className="px-3 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ring-1 ring-sentinel-700"
                    >
                        <Download className="w-4 h-4" /> <span className="hidden sm:inline">CSV</span>
                    </button>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> {showForm ? 'Cancel' : 'New Entry'}
                    </button>
                </div>
            </div>

            {/* CALENDAR HEATMAP */}
            <div className="glass-panel p-4 rounded-xl overflow-x-auto">
                <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider mb-3">Activity — Last 12 Months</h3>
                <CalendarHeatmap
                    entryCounts={entryCounts}
                    onDayClick={setSelectedDate}
                    selectedDate={selectedDate}
                    macroEvents={macroEvents}
                />
            </div>

            {/* ENHANCED ENTRY FORM */}
            {showForm && (
                <form onSubmit={handleSave} className="glass-panel p-4 sm:p-6 rounded-xl space-y-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-2 gap-2">
                        <h2 className="text-lg font-semibold text-sentinel-200">Log Trade</h2>
                        {recentPositions.length > 0 && (
                            <select
                                onChange={e => handlePositionSelect(e.target.value)}
                                defaultValue=""
                                className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sentinel-400 max-w-[200px]"
                            >
                                <option value="">Auto-fill from position...</option>
                                {recentPositions.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.ticker} {p.side?.toUpperCase()} — ${p.entry_price?.toFixed(2)} → ${p.exit_price?.toFixed(2)}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Row 1: Core Trade Details */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Ticker</label>
                            <input required value={ticker} onChange={e => setTicker(e.target.value)} placeholder="AAPL" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 uppercase text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Direction</label>
                            <select value={direction} onChange={e => setDirection(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm">
                                <option value="long">LONG</option>
                                <option value="short">SHORT</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Entry Price</label>
                            <input type="number" step="0.01" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="150.00" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Exit Price</label>
                            <input type="number" step="0.01" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="165.00" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                        </div>
                    </div>

                    {/* Row 2: Risk Params */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Shares</label>
                            <input type="number" value={shares} onChange={e => setShares(e.target.value)} placeholder="100" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Stop Loss</label>
                            <input type="number" step="0.01" value={stopLoss} onChange={e => setStopLoss(e.target.value)} placeholder="145.00" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Target Price</label>
                            <input type="number" step="0.01" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} placeholder="175.00" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1">Entry Rationale — Why are you taking this trade?</label>
                        <textarea rows={2} value={entryRationale} onChange={e => setEntryRationale(e.target.value)} placeholder="Signal showed overreaction bias with 80% confidence. TA confirmed with RSI oversold..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                    </div>

                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1">Post-Trade Review (fill after closing)</label>
                        <textarea rows={2} value={postTradeReview} onChange={e => setPostTradeReview(e.target.value)} placeholder="Did the thesis play out? What drove the price action?" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs text-emerald-400/70 mb-1 flex items-center gap-1">
                                <ThumbsUp className="w-3 h-3" /> What went well
                            </label>
                            <input value={whatWentWell} onChange={e => setWhatWentWell(e.target.value)} placeholder="Followed my plan, proper sizing..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs text-red-400/70 mb-1 flex items-center gap-1">
                                <ThumbsDown className="w-3 h-3" /> What went wrong
                            </label>
                            <input value={whatWentWrong} onChange={e => setWhatWentWrong(e.target.value)} placeholder="Moved stop too early, FOMO'd in..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-amber-400/70 mb-1">Lessons Learned</label>
                        <input value={lessonsLearned} onChange={e => setLessonsLearned(e.target.value)} placeholder="Wait for confirmation before entry..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 text-sm" />
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs text-sentinel-400">Would you take this trade again?</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setWouldTakeAgain(true)} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${wouldTakeAgain === true ? 'bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500' : 'bg-white/5 text-sentinel-400 hover:bg-white/10'}`}>Yes</button>
                            <button type="button" onClick={() => setWouldTakeAgain(false)} className={`px-3 py-1.5 rounded-lg text-xs transition-all ${wouldTakeAgain === false ? 'bg-red-600/20 text-red-400 ring-1 ring-red-500' : 'bg-white/5 text-sentinel-400 hover:bg-white/10'}`}>No</button>
                        </div>
                    </div>

                    {/* Mood & Tags */}
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-2">Mood</label>
                            <div className="flex gap-2">
                                {MOODS.map(m => (
                                    <button key={m} type="button" onClick={() => setMood(m)} className={`px-3 py-2 rounded-lg text-lg transition-all ${mood === m ? 'bg-blue-600/20 ring-2 ring-blue-500 scale-110' : 'bg-white/5 hover:bg-white/10'}`} title={MOOD_LABELS[m]}>{m}</button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs text-sentinel-400 mb-1">Tags</label>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {tags.map(t => (
                                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sentinel-800 text-sentinel-300 text-xs rounded-full ring-1 ring-sentinel-700">
                                        <Tag className="w-3 h-3" />{t}
                                        <button type="button" onClick={() => setTags(tags.filter(tag => tag !== t))} className="text-sentinel-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add tag..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-sentinel-200" />
                                <button type="button" onClick={addTag} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-sentinel-300 rounded-lg text-xs border border-white/5">Add</button>
                            </div>
                        </div>
                    </div>

                    {/* Screenshots */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-2 flex items-center gap-1.5">
                            <Camera className="w-3.5 h-3.5" /> Screenshots (max 3)
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {screenshots.map((src, i) => (
                                <div key={i} className="relative group">
                                    <img src={src} alt={`Screenshot ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-sentinel-700" />
                                    <button type="button" onClick={() => setScreenshots(screenshots.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <X className="w-3 h-3 text-white" />
                                    </button>
                                </div>
                            ))}
                            {screenshots.length < 3 && (
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="w-20 h-20 border-2 border-dashed border-sentinel-700 rounded-lg flex flex-col items-center justify-center text-sentinel-500 hover:text-sentinel-300 hover:border-sentinel-500 transition-colors">
                                    <Image className="w-5 h-5 mb-1" />
                                    <span className="text-[9px]">Add</span>
                                </button>
                            )}
                        </div>
                        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleScreenshot} className="hidden" />
                    </div>

                    {/* AI Post-Mortem Notice */}
                    {exitPrice && entryPrice && (
                        <div className="flex items-center gap-2 px-3 py-2 bg-purple-500/5 rounded-lg border border-purple-500/10">
                            <Brain className="w-4 h-4 text-purple-400" />
                            <span className="text-xs text-purple-300">AI will auto-generate a post-mortem analysis for this closed trade</span>
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button type="submit" disabled={saving} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save to Journal'}
                        </button>
                    </div>
                </form>
            )}

            {/* FILTER BAR */}
            <div className="glass-panel rounded-xl overflow-hidden">
                <div className="p-3 sm:p-4 border-b border-white/5">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-sentinel-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search journal..." className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-sm text-sentinel-200 focus:outline-none focus:ring-1 focus:ring-sentinel-600" />
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                            {ENTRY_TYPES.map(t => (
                                <button key={t} onClick={() => setSelectedType(selectedType === t ? null : t)} className={`px-2.5 py-1 text-xs rounded-full capitalize transition-colors ${selectedType === t ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/50' : 'bg-white/5 text-sentinel-400 hover:text-sentinel-200 border border-white/5'}`}>{t}</button>
                            ))}
                        </div>
                        <div className="flex gap-1">
                            {MOODS.map(m => (
                                <button key={m} onClick={() => setSelectedMood(selectedMood === m ? null : m)} className={`w-8 h-8 rounded-lg text-sm transition-all ${selectedMood === m ? 'bg-blue-600/20 ring-1 ring-blue-500' : 'bg-white/5 hover:bg-white/10 border border-white/5'}`} title={MOOD_LABELS[m]}>{m}</button>
                            ))}
                        </div>
                    </div>
                    {allTags.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-3">
                            {allTags.slice(0, 12).map(t => (
                                <button key={t} onClick={() => setSelectedTag(selectedTag === t ? null : t)} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full transition-colors ${selectedTag === t ? 'bg-purple-600/20 text-purple-400 ring-1 ring-purple-500/50' : 'bg-white/5 text-sentinel-500 hover:text-sentinel-300 border border-white/5'}`}>
                                    <Tag className="w-2.5 h-2.5" />{t}
                                </button>
                            ))}
                        </div>
                    )}
                    {activeFilters > 0 && (
                        <div className="flex items-center justify-between mt-3 text-xs">
                            <span className="text-sentinel-500">{filteredEntries.length} of {entries.length} entries shown</span>
                            <button onClick={() => { setSelectedType(null); setSelectedMood(null); setSelectedTag(null); setSelectedDate(null); setSearchQuery(''); }} className="text-blue-400 hover:text-blue-300">Clear all filters</button>
                        </div>
                    )}
                </div>

                {/* ENTRIES LIST */}
                {loading ? (
                    <div className="p-12 flex justify-center"><div className="w-8 h-8 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin" /></div>
                ) : filteredEntries.length === 0 ? (
                    <EmptyState
                        icon={<BookOpen className="w-8 h-8 text-blue-400" />}
                        title={entries.length === 0 ? 'Start Your Trade Journal' : 'No entries match filters'}
                        description={entries.length === 0
                            ? 'Log your first trade to build a structured record. Track entry rationale, post-trade reviews, and let AI generate post-mortems on closed trades.'
                            : 'Try adjusting your filters or search query.'}
                        action={entries.length === 0 ? (
                            <button onClick={() => setShowForm(true)} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium flex items-center gap-2">
                                <Plus className="w-4 h-4" /> Log First Trade
                            </button>
                        ) : undefined}
                    />
                ) : (
                    <div className="divide-y divide-white/5">
                        {filteredEntries.map(entry => (
                            <TradeReviewCard key={entry.id} entry={entry} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
