/**
 * CommandPalette — ⌘K global command palette for power-user navigation.
 *
 * Features:
 * - Fuzzy search across pages, tickers, and actions
 * - Keyboard navigation (↑↓ to select, Enter to execute, Esc to close)
 * - Grouped results: Pages, Ticker Search, Quick Actions
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, LayoutDashboard, Briefcase, Zap, BarChart3,
    FileText, Activity, Settings, Command,
    ArrowRight
} from 'lucide-react';
import { ScannerService } from '@/services/scanner';
import { useToast } from '@/hooks/useToast';

interface CommandItem {
    id: string;
    label: string;
    description?: string;
    icon: React.ReactNode;
    group: string;
    action: () => void;
}

export function CommandPalette() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();
    const { addToast } = useToast();

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

    // Static page / action commands
    const staticCommands: CommandItem[] = useMemo(() => [
        {
            id: 'nav-dashboard',
            label: 'Dashboard',
            description: 'Intelligence Overview',
            icon: <LayoutDashboard className="w-4 h-4" />,
            group: 'Pages',
            action: () => navigate('/'),
        },
        {
            id: 'nav-positions',
            label: 'Positions',
            description: 'Trade Tracker & PnL',
            icon: <Briefcase className="w-4 h-4" />,
            group: 'Pages',
            action: () => navigate('/positions'),
        },
        {
            id: 'nav-watchlist',
            label: 'Scanner Watchlist',
            description: 'Monitored Tickers',
            icon: <Zap className="w-4 h-4" />,
            group: 'Pages',
            action: () => navigate('/watchlist'),
        },
        {
            id: 'nav-intelligence',
            label: 'Intelligence Feed',
            description: 'News & Research',
            icon: <FileText className="w-4 h-4" />,
            group: 'Pages',
            action: () => navigate('/intelligence'),
        },
        {
            id: 'nav-settings',
            label: 'Settings',
            description: 'App Configuration',
            icon: <Settings className="w-4 h-4" />,
            group: 'Pages',
            action: () => navigate('/settings'),
        },
        {
            id: 'action-scan',
            label: 'Run AI Discovery Scan',
            description: 'Scan all watched tickers',
            icon: <Activity className="w-4 h-4 text-emerald-400" />,
            group: 'Actions',
            action: async () => {
                addToast('Starting AI Discovery Scan...', 'info');
                try {
                    const results = await ScannerService.runScan();
                    const signalCount = (results as any)?.signalsGenerated || (results as any)?.signals?.length || 0;
                    addToast(`Scan complete — ${signalCount} signal${signalCount !== 1 ? 's' : ''} generated`, 'success');
                } catch {
                    addToast('Scan failed. Check console for details.', 'error');
                }
            },
        },
    ], [navigate, addToast]);

    // Generate ticker search command dynamically from query
    const tickerCommand: CommandItem | null = useMemo(() => {
        const cleanQuery = query.trim().toUpperCase();
        if (cleanQuery.length >= 1 && cleanQuery.length <= 6 && /^[A-Z]+$/.test(cleanQuery)) {
            return {
                id: `ticker-${cleanQuery}`,
                label: `Analyze ${cleanQuery}`,
                description: `Open analysis page for ${cleanQuery}`,
                icon: <BarChart3 className="w-4 h-4 text-blue-400" />,
                group: 'Ticker Search',
                action: () => navigate(`/analysis/${cleanQuery}`),
            };
        }
        return null;
    }, [query, navigate]);

    // Filter items by query
    const filteredItems = useMemo(() => {
        const items: CommandItem[] = [];
        const lowerQuery = query.toLowerCase();

        if (tickerCommand) {
            items.push(tickerCommand);
        }

        const matchedStatic = staticCommands.filter(
            cmd =>
                cmd.label.toLowerCase().includes(lowerQuery) ||
                cmd.description?.toLowerCase().includes(lowerQuery) ||
                cmd.group.toLowerCase().includes(lowerQuery)
        );

        items.push(...matchedStatic);
        return items;
    }, [query, staticCommands, tickerCommand]);

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

    let flatIndex = -1;

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
                        <div className="max-h-[300px] overflow-y-auto p-2">
                            {filteredItems.length === 0 ? (
                                <div className="py-8 text-center text-sentinel-500 text-sm">
                                    No results found for "{query}"
                                </div>
                            ) : (
                                groups.map(([groupName, items]) => (
                                    <div key={groupName}>
                                        <div className="px-3 py-1.5 text-[10px] font-bold text-sentinel-500 uppercase tracking-widest">
                                            {groupName}
                                        </div>
                                        {items.map(item => {
                                            flatIndex++;
                                            const currentIndex = flatIndex;
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
                                                    {isSelected && (
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
