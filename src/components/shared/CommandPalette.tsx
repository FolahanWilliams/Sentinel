/**
 * CommandPalette — ⌘K global command palette for power-user navigation.
 *
 * Features:
 * - Fuzzy search across pages, tickers, and actions
 * - Recent tickers section for quick re-access
 * - Keyboard navigation (↑↓ to select, Enter to execute, Esc to close)
 * - Grouped results: Recent, Pages, Ticker Search, Quick Actions
 * - Keyboard shortcut hints displayed per command
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, LayoutDashboard, Briefcase, Zap, BarChart3,
    Activity, Settings, Command,
    ArrowRight, Clock, Newspaper, BookOpen, Shield, Bell,
    Trophy, Calendar, FlaskConical, Radar, Plus, Microscope, List,
} from 'lucide-react';
import { ScannerService } from '@/services/scanner';
import { useToast } from '@/hooks/useToast';
import { useRecentTickers } from '@/hooks/useRecentTickers';
import { useWatchlistStore } from '@/stores/watchlistStore';

interface CommandItem {
    id: string;
    label: string;
    description?: string;
    icon: React.ReactNode;
    group: string;
    action: () => void;
    shortcut?: string;
}

export function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { recentTickers, addRecent } = useRecentTickers();
    const watchlistTickers = useWatchlistStore(s => s.tickers);

    // Global ⌘K / Ctrl+K listener
    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        }
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Static page commands
    const pageCommands: CommandItem[] = useMemo(() => [
        { id: 'nav-dashboard', label: 'Dashboard', description: 'Intelligence Overview', icon: <LayoutDashboard className="w-4 h-4" />, group: 'Pages', action: () => navigate('/'), shortcut: 'G D' },
        { id: 'nav-intelligence', label: 'Intelligence Feed', description: 'News & Research', icon: <Newspaper className="w-4 h-4" />, group: 'Pages', action: () => navigate('/?tab=intelligence'), shortcut: 'G I' },
        { id: 'nav-positions', label: 'Positions', description: 'Trade Tracker & PnL', icon: <Briefcase className="w-4 h-4" />, group: 'Pages', action: () => navigate('/positions'), shortcut: 'G P' },
        { id: 'nav-watchlist', label: 'Watchlist', description: 'Monitored Tickers', icon: <List className="w-4 h-4" />, group: 'Pages', action: () => navigate('/watchlist'), shortcut: 'G W' },
        { id: 'nav-scanner', label: 'Scanner', description: 'AI Signal Discovery', icon: <Radar className="w-4 h-4" />, group: 'Pages', action: () => navigate('/scanner'), shortcut: 'G S' },
        { id: 'nav-research', label: 'Research', description: 'Deep Stock Analysis', icon: <Microscope className="w-4 h-4" />, group: 'Pages', action: () => navigate('/research') },
        { id: 'nav-backtest', label: 'Backtest', description: 'Strategy Backtesting', icon: <FlaskConical className="w-4 h-4" />, group: 'Pages', action: () => navigate('/backtest'), shortcut: 'G B' },
        { id: 'nav-journal', label: 'Journal', description: 'Trading Journal', icon: <BookOpen className="w-4 h-4" />, group: 'Pages', action: () => navigate('/journal'), shortcut: 'G J' },
        { id: 'nav-alerts', label: 'Alerts', description: 'Price & Signal Alerts', icon: <Bell className="w-4 h-4" />, group: 'Pages', action: () => navigate('/alerts'), shortcut: 'G A' },
        { id: 'nav-risk', label: 'Risk Dashboard', description: 'Exposure & Risk Metrics', icon: <Shield className="w-4 h-4" />, group: 'Pages', action: () => navigate('/risk'), shortcut: 'G R' },
        { id: 'nav-leaderboard', label: 'Leaderboard', description: 'Strategy Leaderboard', icon: <Trophy className="w-4 h-4" />, group: 'Pages', action: () => navigate('/leaderboard') },
        { id: 'nav-earnings', label: 'Earnings Calendar', description: 'Upcoming Earnings', icon: <Calendar className="w-4 h-4" />, group: 'Pages', action: () => navigate('/earnings'), shortcut: 'G E' },
        { id: 'nav-settings', label: 'Settings', description: 'App Configuration', icon: <Settings className="w-4 h-4" />, group: 'Pages', action: () => navigate('/settings') },
    ], [navigate]);

    // Action commands
    const actionCommands: CommandItem[] = useMemo(() => [
        {
            id: 'action-new-position', label: 'New Position', description: 'Create a new trade position',
            icon: <Plus className="w-4 h-4 text-emerald-400" />, group: 'Actions',
            action: () => navigate('/positions?prefill=true'), shortcut: 'N',
        },
        {
            id: 'action-scan', label: 'Run AI Discovery Scan', description: 'Find new trending tickers',
            icon: <Activity className="w-4 h-4 text-emerald-400" />, group: 'Actions',
            action: async () => {
                addToast('Starting AI Discovery Scan...', 'info');
                try {
                    const results = await ScannerService.runDiscoveryScan();
                    const signalCount = results.signalsGenerated || 0;
                    if (results.discovered === 0) {
                        addToast('No new trending tickers found right now.', 'warning');
                    } else {
                        addToast(`Scan complete: ${results.discovered} tickers found, ${signalCount} signal${signalCount !== 1 ? 's' : ''} generated`, 'success');
                    }
                } catch {
                    addToast('Discovery scan failed. Check console for details.', 'error');
                }
            },
        },
    ], [navigate, addToast]);

    // Recent ticker commands
    const recentCommands: CommandItem[] = useMemo(() => {
        if (query) return []; // Hide when searching
        return recentTickers.slice(0, 5).map(ticker => ({
            id: `recent-${ticker}`,
            label: ticker,
            description: 'Recently viewed',
            icon: <Clock className="w-4 h-4 text-sentinel-500" />,
            group: 'Recent',
            action: () => { addRecent(ticker); navigate(`/analysis/${ticker}`); },
        }));
    }, [recentTickers, query, navigate, addRecent]);

    // Dynamic ticker search commands from query
    const tickerCommands: CommandItem[] = useMemo(() => {
        const cleanQuery = query.trim().toUpperCase();
        if (cleanQuery.length < 1 || cleanQuery.length > 6 || !/^[A-Z]+$/.test(cleanQuery)) return [];

        const items: CommandItem[] = [];

        // Check watchlist matches
        const watchlistMatches = watchlistTickers.filter(t =>
            t.ticker.toUpperCase().includes(cleanQuery)
        );

        for (const match of watchlistMatches.slice(0, 3)) {
            items.push({
                id: `wl-${match.ticker}`,
                label: match.ticker,
                description: match.company_name || 'Watchlist ticker',
                icon: <Zap className="w-4 h-4 text-amber-400" />,
                group: 'Tickers',
                action: () => { addRecent(match.ticker); navigate(`/analysis/${match.ticker}`); },
            });
        }

        // Always add a direct analyze option for the typed ticker
        const alreadyInList = items.some(i => i.label === cleanQuery);
        if (!alreadyInList) {
            items.push({
                id: `ticker-analyze-${cleanQuery}`,
                label: `Analyze ${cleanQuery}`,
                description: `Open analysis for ${cleanQuery}`,
                icon: <BarChart3 className="w-4 h-4 text-blue-400" />,
                group: 'Tickers',
                action: () => { addRecent(cleanQuery); navigate(`/analysis/${cleanQuery}`); },
            });
        }

        // Add contextual actions for the typed ticker
        items.push(
            {
                id: `ticker-research-${cleanQuery}`,
                label: `Research ${cleanQuery}`,
                description: `Deep research for ${cleanQuery}`,
                icon: <Microscope className="w-4 h-4 text-indigo-400" />,
                group: 'Tickers',
                action: () => { addRecent(cleanQuery); navigate(`/research/${cleanQuery}`); },
            },
            {
                id: `ticker-news-${cleanQuery}`,
                label: `News for ${cleanQuery}`,
                description: `View intelligence feed for ${cleanQuery}`,
                icon: <Newspaper className="w-4 h-4 text-cyan-400" />,
                group: 'Tickers',
                action: () => navigate(`/?tab=intelligence&q=${cleanQuery}`),
            },
            {
                id: `ticker-scan-${cleanQuery}`,
                label: `Scan ${cleanQuery}`,
                description: `Run AI scan on ${cleanQuery}`,
                icon: <Radar className="w-4 h-4 text-purple-400" />,
                group: 'Tickers',
                action: () => navigate(`/?tab=intelligence&scan=${cleanQuery}`),
            },
            {
                id: `ticker-position-${cleanQuery}`,
                label: `Create Position for ${cleanQuery}`,
                description: `Open new trade for ${cleanQuery}`,
                icon: <Plus className="w-4 h-4 text-emerald-400" />,
                group: 'Tickers',
                action: () => navigate(`/positions?ticker=${cleanQuery}&prefill=true`),
            },
        );

        return items;
    }, [query, watchlistTickers, navigate, addRecent]);

    // Filter and combine all items
    const filteredItems = useMemo(() => {
        const lowerQuery = query.toLowerCase();

        // If query looks like a ticker, show ticker commands first
        if (tickerCommands.length > 0) {
            const matchedPages = pageCommands.filter(cmd =>
                cmd.label.toLowerCase().includes(lowerQuery) ||
                cmd.description?.toLowerCase().includes(lowerQuery)
            );
            return [...tickerCommands, ...matchedPages.slice(0, 3)];
        }

        // No query: show recent, then pages, then actions
        if (!query) {
            return [...recentCommands, ...pageCommands.slice(0, 6), ...actionCommands];
        }

        // Text search: filter pages and actions
        const matchedPages = pageCommands.filter(cmd =>
            cmd.label.toLowerCase().includes(lowerQuery) ||
            cmd.description?.toLowerCase().includes(lowerQuery)
        );
        const matchedActions = actionCommands.filter(cmd =>
            cmd.label.toLowerCase().includes(lowerQuery) ||
            cmd.description?.toLowerCase().includes(lowerQuery)
        );
        return [...matchedPages, ...matchedActions];
    }, [query, pageCommands, actionCommands, recentCommands, tickerCommands]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, filteredItems.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
            e.preventDefault();
            filteredItems[selectedIndex].action();
            setIsOpen(false);
        }
    }, [filteredItems, selectedIndex]);

    // Reset selection when query changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Group items
    const groups = useMemo(() => {
        const map = new Map<string, CommandItem[]>();
        filteredItems.forEach(item => {
            const existing = map.get(item.group) || [];
            existing.push(item);
            map.set(item.group, existing);
        });
        return Array.from(map.entries());
    }, [filteredItems]);

    const flatIndexRef = useRef(0);
    flatIndexRef.current = -1;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Palette */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-lg z-[201] bg-sentinel-950/98 rounded-2xl border border-sentinel-800/60 shadow-2xl shadow-black/60 backdrop-blur-xl overflow-hidden"
                    >
                        {/* Search input */}
                        <div className="flex items-center gap-3 px-4 py-3 border-b border-sentinel-800/50">
                            <Search className="w-5 h-5 text-sentinel-400 flex-shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Search pages, tickers, or actions..."
                                className="flex-1 bg-transparent text-sentinel-100 placeholder:text-sentinel-500 outline-none text-sm"
                            />
                            <div className="flex items-center gap-1">
                                <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-sentinel-400 bg-sentinel-800/50 rounded border border-sentinel-700/50">ESC</kbd>
                            </div>
                        </div>

                        {/* Results */}
                        <div className="max-h-[360px] overflow-y-auto p-2">
                            {filteredItems.length === 0 ? (
                                <div className="py-8 text-center text-sentinel-500 text-sm">
                                    No results found for &ldquo;{query}&rdquo;
                                </div>
                            ) : (
                                groups.map(([groupName, items]) => (
                                    <div key={groupName}>
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-sentinel-500 uppercase tracking-widest">
                                            {groupName}
                                        </div>
                                        {items.map(item => {
                                            flatIndexRef.current++;
                                            const currentIndex = flatIndexRef.current;
                                            const isSelected = selectedIndex === currentIndex;

                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => {
                                                        item.action();
                                                        setIsOpen(false);
                                                    }}
                                                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors cursor-pointer border-none ${isSelected
                                                        ? 'bg-sentinel-800/60 text-sentinel-100'
                                                        : 'bg-transparent text-sentinel-300 hover:bg-sentinel-800/30'
                                                        }`}
                                                >
                                                    <div className={`flex-shrink-0 ${isSelected ? 'text-sentinel-100' : 'text-sentinel-400'}`}>
                                                        {item.icon}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-medium truncate">{item.label}</div>
                                                        {item.description && (
                                                            <div className="text-xs text-sentinel-500 truncate">{item.description}</div>
                                                        )}
                                                    </div>
                                                    {item.shortcut && (
                                                        <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-sentinel-500 bg-sentinel-800/50 rounded border border-sentinel-700/50 flex-shrink-0">
                                                            {item.shortcut}
                                                        </kbd>
                                                    )}
                                                    {isSelected && !item.shortcut && (
                                                        <ArrowRight className="w-3.5 h-3.5 text-sentinel-500 flex-shrink-0" />
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-4 py-2 border-t border-sentinel-800/50 text-[10px] text-sentinel-500">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1 py-0.5 font-mono bg-sentinel-800/50 rounded border border-sentinel-700/50">↑↓</kbd>
                                    Navigate
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="px-1 py-0.5 font-mono bg-sentinel-800/50 rounded border border-sentinel-700/50">↵</kbd>
                                    Select
                                </span>
                                <span className="hidden sm:flex items-center gap-1">
                                    <kbd className="px-1 py-0.5 font-mono bg-sentinel-800/50 rounded border border-sentinel-700/50">G</kbd>
                                    then key for nav
                                </span>
                            </div>
                            <div className="flex items-center gap-1">
                                <Command className="w-3 h-3" />
                                <span className="font-mono">K</span>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
