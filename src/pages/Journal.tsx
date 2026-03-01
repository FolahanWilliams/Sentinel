import { useState, useEffect } from 'react';
import { supabase } from '@/config/supabase';
import { BookOpen, Plus, Search, Calendar, MessageSquareQuote } from 'lucide-react';

export function Journal() {
    const [entries, setEntries] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Form State
    const [showForm, setShowForm] = useState(false);
    const [ticker, setTicker] = useState('');
    const [direction, setDirection] = useState<'long' | 'short'>('long');
    const [entryPrice, setEntryPrice] = useState('');
    const [exitPrice, setExitPrice] = useState('');
    const [notes, setNotes] = useState('');

    useEffect(() => {
        fetchEntries();
    }, []);

    async function fetchEntries() {
        setLoading(true);
        const { data, error } = await supabase
            .from('journal_entries')
            .select(`
           *,
           signals (
              id,
              signal_type
           )
        `)
            .order('entry_date', { ascending: false });

        if (!error && data) {
            setEntries(data);
        }
        setLoading(false);
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault();

        const { error } = await supabase.from('journal_entries').insert({
            ticker: ticker.toUpperCase(),
            entry_type: direction,
            content: `Entry: $${entryPrice} | Exit: ${exitPrice ? '$' + exitPrice : 'OPEN'}\n\n${notes}`,
            tags: [status, direction],
            mood: 'neutral'
        } as any);

        if (!error) {
            setShowForm(false);
            setTicker(''); setEntryPrice(''); setExitPrice(''); setNotes('');
            fetchEntries();
        } else {
            alert("Failed to save entry: " + error.message);
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold font-display tracking-tight text-sentinel-100 flex items-center gap-3">
                        <BookOpen className="w-8 h-8 text-blue-400" /> Trade Journal
                    </h1>
                    <p className="text-sentinel-400 mt-1">
                        Log your actual executions against Sentinel's signals.
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" /> {showForm ? 'Cancel' : 'New Entry'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSave} className="bg-sentinel-900/80 rounded-xl border border-sentinel-700 p-6 space-y-4">
                    <h2 className="text-lg font-semibold text-sentinel-200 border-b border-sentinel-800 pb-2">Log Execution</h2>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Ticker</label>
                            <input required value={ticker} onChange={e => setTicker(e.target.value)} placeholder="AAPL" className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100 uppercase" />
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Direction</label>
                            <select value={direction} onChange={e => setDirection(e.target.value as any)} className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100">
                                <option value="long">LONG</option>
                                <option value="short">SHORT</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Entry Price</label>
                            <input required type="number" step="0.01" value={entryPrice} onChange={e => setEntryPrice(e.target.value)} placeholder="150.00" className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100" />
                        </div>
                        <div>
                            <label className="block text-xs text-sentinel-400 mb-1">Exit Price (Optional)</label>
                            <input type="number" step="0.01" value={exitPrice} onChange={e => setExitPrice(e.target.value)} placeholder="165.00" className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-sentinel-400 mb-1">Execution Notes & Review</label>
                        <textarea required rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Why did you take this trade? Did you follow the Red Team advice?" className="w-full bg-sentinel-950 border border-sentinel-700 rounded-lg px-3 py-2 text-sentinel-100"></textarea>
                    </div>

                    <div className="flex justify-end pt-2">
                        <button type="submit" className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors">
                            Save to Journal
                        </button>
                    </div>
                </form>
            )}

            <div className="bg-sentinel-900/50 rounded-xl border border-sentinel-800/50 overflow-hidden backdrop-blur-sm">
                <div className="p-4 border-b border-sentinel-800/50 flex items-center justify-between">
                    <div className="relative">
                        <Search className="w-4 h-4 text-sentinel-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Search journal..."
                            className="bg-sentinel-950 border border-sentinel-800 rounded-lg pl-9 pr-4 py-1.5 text-sm text-sentinel-200 focus:outline-none focus:ring-1 focus:ring-sentinel-600 w-64"
                        />
                    </div>
                </div>

                {loading ? (
                    <div className="p-12 flex justify-center"><div className="w-8 h-8 border-2 border-sentinel-600 border-t-sentinel-300 rounded-full animate-spin"></div></div>
                ) : entries.length === 0 ? (
                    <div className="p-12 text-center text-sentinel-500">No trades logged yet.</div>
                ) : (
                    <div className="divide-y divide-sentinel-800/50">
                        {entries.map(entry => {
                            const pnl = entry.exit_price ? ((entry.exit_price - entry.entry_price) / entry.entry_price) * 100 : null;
                            if (entry.direction === 'short' && pnl) pnl * -1; // rough short pnl

                            return (
                                <div key={entry.id} className="p-5 hover:bg-sentinel-800/30 transition-colors">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg font-bold text-sentinel-100">{entry.ticker}</span>
                                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${entry.entry_type === 'long' ? 'bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20' : 'bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20'}`}>
                                                {entry.entry_type ? entry.entry_type.toUpperCase() : 'UNKNOWN'}
                                            </span>
                                            {entry.signals && (
                                                <span className="text-xs text-sentinel-500 border border-sentinel-700 px-2 py-0.5 rounded flex items-center gap-1">
                                                    <MessageSquareQuote className="w-3 h-3" /> Linked to Signal
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex gap-4 text-right">
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

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-sm bg-sentinel-950/50 p-3 rounded-lg border border-sentinel-800/50">
                                        <div>
                                            <div className="text-sentinel-500 text-xs font-mono mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Entry Date</div>
                                            <div className="text-sentinel-200">{new Date(entry.created_at || entry.entry_date).toLocaleDateString()}</div>
                                        </div>
                                    </div>

                                    <p className="text-sm text-sentinel-300 leading-relaxed bg-sentinel-900/50 p-3 rounded-lg border-l-2 border-l-sentinel-600 whitespace-pre-wrap">
                                        {entry.content || entry.notes}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
