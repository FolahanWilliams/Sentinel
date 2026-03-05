/**
 * Journal — Enhanced trade journal with calendar heatmap, tag/mood filters,
 * search, markdown export, and improved entry form.
 */

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { BookOpen, Plus, Search, Download, X, Tag } from 'lucide-react';
import { CalendarHeatmap } from '@/components/journal/CalendarHeatmap';

const MOODS = ['😡', '😐', '😊', '🔥'] as const;
const MOOD_LABELS: Record<string, string> = { '😡': 'Frustrated', '😐': 'Neutral', '😊': 'Confident', '🔥': 'On Fire' };
const ENTRY_TYPES = ['thesis', 'learning', 'mistake', 'general'] as const;

export function Journal() {
    const [entries, setEntries] = useState<any[]>([]);
    const [macroEvents, setMacroEvents] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    // Storage keys for filters
    const STORAGE_KEYS = {
        SEARCH: 'sentinel_journal_search',
        TYPE: 'sentinel_journal_type',
        MOOD: 'sentinel_journal_mood',
        TAG: 'sentinel_journal_tag',
        DATE: 'sentinel_journal_date',
    };

    // Helper to init state from sessionStorage
    const getStoredState = (key: string, defaultValue: string | null = null): any => {
        try {
            const stored = sessionStorage.getItem(key);
            if (stored) return JSON.parse(stored);
        } catch { /* ignore parse errors */ }
        return defaultValue;
    };

    // Filters (Initialized from storage)
    const [searchQuery, setSearchQuery] = useState(() => getStoredState(STORAGE_KEYS.SEARCH, ''));
    const [selectedType, setSelectedType] = useState<string | null>(() => getStoredState(STORAGE_KEYS.TYPE));
    const [selectedMood, setSelectedMood] = useState<string | null>(() => getStoredState(STORAGE_KEYS.MOOD));
    const [selectedTag, setSelectedTag] = useState<string | null>(() => getStoredState(STORAGE_KEYS.TAG));
    const [selectedDate, setSelectedDate] = useState<string | null>(() => getStoredState(STORAGE_KEYS.DATE));

    // Sync filters to sessionStorage
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
    const [showForm, setShowForm] = useState(false);
    const [ticker, setTicker] = useState('');
    const [direction, setDirection] = useState<'long' | 'short'>('long');
    const [entryPrice, setEntryPrice] = useState('');
    const [exitPrice, setExitPrice] = useState('');
    const [notes, setNotes] = useState('');
    const [mood, setMood] = useState('😐');
    const [tagInput, setTagInput] = useState('');
    const [tags, setTags] = useState<string[]>([]);

    useEffect(() => {
        fetchEntries();
    }, []);

    async function fetchEntries() {
        setLoading(true);
        const { data, error } = await supabase
            .from('journal_entries')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error && data) {
            setEntries(data);
        }

        // Fetch macro events for overlay overlay (severity >= 8)
        const { data: eventsData, error: eventsError } = await supabase
            .from('market_events')
            .select('detected_at, headline, severity')
            .gte('severity', 8)
            .order('severity', { ascending: false });

        if (!eventsError && eventsData) {
            const eventsMap: Record<string, string> = {};
            eventsData.forEach(e => {
                const date = (e.detected_at || '').split('T')[0];
                if (date && !eventsMap[date]) {
                    eventsMap[date] = e.headline; // Keeps highest severity per day
                }
            });
            setMacroEvents(eventsMap);
        }

        setLoading(false);
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

    // All unique tags across entries
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        entries.forEach(e => {
            (e.tags || []).forEach((t: string) => tagSet.add(t));
        });
        return Array.from(tagSet).sort();
    }, [entries]);

    // Filtered entries
    const filteredEntries = useMemo(() => {
        let result = [...entries];

        // Date filter (from heatmap click)
        if (selectedDate) {
            result = result.filter(e => (e.created_at || '').startsWith(selectedDate));
        }

        // Type filter
        if (selectedType) {
            result = result.filter(e => e.entry_type === selectedType);
        }

        // Mood filter
        if (selectedMood) {
            result = result.filter(e => e.mood === selectedMood);
        }

        // Tag filter
        if (selectedTag) {
            result = result.filter(e => (e.tags || []).includes(selectedTag));
        }

        // Search
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
        if (t && !tags.includes(t)) {
            setTags([...tags, t]);
        }
        setTagInput('');
    }

    function removeTag(t: string) {
        setTags(tags.filter(tag => tag !== t));
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();

        const allTags = [direction, ...tags];

        const { error } = await supabase.from('journal_entries').insert({
            ticker: ticker.toUpperCase() || null,
            entry_type: direction,
            content: `Entry: $${entryPrice} | Exit: ${exitPrice ? '$' + exitPrice : 'OPEN'}\n\n${notes}`,
            tags: allTags,
            mood,
        } as any);

        if (!error) {
            setShowForm(false);
            setTicker(''); setEntryPrice(''); setExitPrice(''); setNotes('');
            setMood('😐'); setTags([]); setTagInput('');
            fetchEntries();
        } else {
            alert("Failed to save entry: " + error.message);
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
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-blue-400" /> Trade Journal
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Log your executions, review biases, and track growth.
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={exportMarkdown}
                        className="px-3 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ring-1 ring-sentinel-700"
                    >
                        <Download className="w-4 h-4" /> Export
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
            <div className="glass-panel p-4 rounded-xl">
                <h3 className="text-xs font-semibold text-sentinel-400 uppercase tracking-wider mb-3">Activity — Last 12 Months</h3>
                <CalendarHeatmap
                    entryCounts={entryCounts}
                    onDayClick={setSelectedDate}
                    selectedDate={selectedDate}
                    macroEvents={macroEvents}
                />
            </div>

            {/* ENTRY FORM */}
            {showForm && (
                <form onSubmit={handleSave} className="glass-panel p-6 rounded-xl space-y-4">
                    <h2 className="text-lg font-semibold text-sentinel-200 border-b border-white/5 pb-2">Log Execution</h2>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Ticker</label>
                            <input required value={ticker} onChange={e => setTicker(e.target.value)} placeholder="AAPL" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 uppercase transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Direction</label>
                            <select value={direction} onChange={e => setDirection(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors">
                                <option value="long">LONG</option>
                                <option value="short">SHORT</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Entry Price</label>
                            <input required type="number" step="0.01" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="150.00" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Exit Price (Optional)</label>
                            <input type="number" step="0.01" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="165.00" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors" />
                        </div>
                    </div>

                    {/* Mood Selector */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-2">Mood</label>
                        <div className="flex gap-2">
                            {MOODS.map(m => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMood(m)}
                                    className={`px-3 py-2 rounded-lg text-lg transition-all ${mood === m ? 'bg-blue-600/20 ring-2 ring-blue-500 scale-110' : 'bg-white/5 hover:bg-white/10'}`}
                                    title={MOOD_LABELS[m]}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1">Tags</label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {tags.map(t => (
                                <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sentinel-800 text-sentinel-300 text-xs rounded-full ring-1 ring-sentinel-700">
                                    <Tag className="w-3 h-3" />{t}
                                    <button type="button" onClick={() => removeTag(t)} className="text-sentinel-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                value={tagInput}
                                onChange={e => setTagInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                                placeholder="Add tag..."
                                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-sentinel-200 transition-colors"
                            />
                            <button type="button" onClick={addTag} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-sentinel-300 rounded-lg text-xs transition-colors border border-white/5">Add</button>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1">Execution Notes & Review</label>
                        <textarea required rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why did you take this trade? Did you follow the Red Team advice?" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sentinel-100 transition-colors"></textarea>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
                            Save to Journal
                        </button>
                    </div>
                </form>
            )}

            {/* FILTER BAR */}
            <div className="glass-panel rounded-xl overflow-hidden">
                <div className="p-4 border-b border-white/5">
                    <div className="flex flex-col sm:flex-row gap-3">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-sentinel-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search journal..."
                                className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-4 py-1.5 text-sm text-sentinel-200 focus:outline-none focus:ring-1 focus:ring-sentinel-600 transition-colors"
                            />
                        </div>

                        {/* Type pills */}
                        <div className="flex gap-1.5 flex-wrap">
                            {ENTRY_TYPES.map(t => (
                                <button
                                    key={t}
                                    onClick={() => setSelectedType(selectedType === t ? null : t)}
                                    className={`px-2.5 py-1 text-xs rounded-full capitalize transition-colors ${selectedType === t ? 'bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/50' : 'bg-white/5 text-sentinel-400 hover:text-sentinel-200 border border-white/5'}`}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>

                        {/* Mood pills */}
                        <div className="flex gap-1">
                            {MOODS.map(m => (
                                <button
                                    key={m}
                                    onClick={() => setSelectedMood(selectedMood === m ? null : m)}
                                    className={`w-8 h-8 rounded-lg text-sm transition-all ${selectedMood === m ? 'bg-blue-600/20 ring-1 ring-blue-500' : 'bg-white/5 hover:bg-white/10 border border-white/5'}`}
                                    title={MOOD_LABELS[m]}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tag filter pills */}
                    {allTags.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-3">
                            {allTags.slice(0, 12).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setSelectedTag(selectedTag === t ? null : t)}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full transition-colors ${selectedTag === t ? 'bg-purple-600/20 text-purple-400 ring-1 ring-purple-500/50' : 'bg-white/5 text-sentinel-500 hover:text-sentinel-300 border border-white/5'}`}
                                >
                                    <Tag className="w-2.5 h-2.5" />{t}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Active filter count */}
                    {activeFilters > 0 && (
                        <div className="flex items-center justify-between mt-3 text-xs">
                            <span className="text-sentinel-500">
                                {filteredEntries.length} of {entries.length} entries shown
                            </span>
                            <button
                                onClick={() => { setSelectedType(null); setSelectedMood(null); setSelectedTag(null); setSelectedDate(null); setSearchQuery(''); }}
                                className="text-blue-400 hover:text-blue-300"
                            >
                                Clear all filters
                            </button>
                        </div>
                    )}
                </div>

                {/* ENTRIES LIST */}
                {loading ? (
                    <div className="p-12 flex justify-center"><div className="w-8 h-8 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div></div>
                ) : filteredEntries.length === 0 ? (
                    <div className="p-12 text-center text-sentinel-500">
                        {entries.length === 0 ? 'No trades logged yet.' : 'No entries match your filters.'}
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {filteredEntries.map(entry => {
                            // Parse PnL from content
                            const entryMatch = (entry.content || '').match(/Entry:\s*\$?([\d.]+)/);
                            const exitMatch = (entry.content || '').match(/Exit:\s*\$?([\d.]+)/);
                            const ep = entryMatch ? parseFloat(entryMatch[1]) : null;
                            const xp = exitMatch ? parseFloat(exitMatch[1]) : null;

                            let pnl: number | null = null;
                            if (ep && xp) {
                                pnl = ((xp - ep) / ep) * 100;
                                if (entry.entry_type === 'short') pnl = -pnl;
                            }

                            return (
                                <div key={entry.id} className="p-5 hover:bg-white/5 transition-colors">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            {entry.mood && <span className="text-lg" title={MOOD_LABELS[entry.mood]}>{entry.mood}</span>}
                                            <span className="text-lg font-bold text-sentinel-100">{entry.ticker || 'General'}</span>
                                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${entry.entry_type === 'long' ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20' : entry.entry_type === 'short' ? 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20' : 'bg-sentinel-700/30 text-sentinel-400 ring-1 ring-sentinel-600/30'}`}>
                                                {(entry.entry_type || 'unknown').toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex gap-4 text-right items-center">
                                            {pnl !== null ? (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs text-sentinel-500 font-mono">Realized PnL</span>
                                                    <span className={`font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-end">
                                                    <span className="text-xs text-sentinel-500 font-mono">Status</span>
                                                    <span className="font-bold text-amber-400">OPEN</span>
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

                                    {/* Date + Content */}
                                    <div className="text-xs text-sentinel-500 mb-2">
                                        {new Date(entry.created_at).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                    </div>
                                    <p className="text-sm text-sentinel-300 leading-relaxed bg-white/5 p-3 rounded-lg border-l-4 border-l-sentinel-600 whitespace-pre-wrap">
                                        {entry.content || entry.notes}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
