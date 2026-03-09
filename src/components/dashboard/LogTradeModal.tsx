/**
 * Log Trade Modal — extracted from UnifiedPortfolioView for modularity.
 */

import { useState } from 'react';
import { supabase } from '@/config/supabase';
import { inferCurrency } from '@/utils/portfolio';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';

interface LogTradeModalProps {
    onClose: () => void;
}

export function LogTradeModal({ onClose }: LogTradeModalProps) {
    const [ticker, setTicker] = useState('');
    const [side, setSide] = useState<'long' | 'short'>('long');
    const [entryPrice, setEntryPrice] = useState('');
    const [shares, setShares] = useState('');
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!ticker || !entryPrice || !shares) return;
        setSaving(true);

        try {
            const entry = parseFloat(entryPrice);
            const shareCount = parseInt(shares, 10);

            await supabase.from('positions').insert({
                ticker: ticker.toUpperCase(),
                side,
                entry_price: entry,
                shares: shareCount,
                position_size_usd: entry * shareCount,
                currency: inferCurrency(ticker.toUpperCase()),
                status: 'open',
                notes: notes || null,
                opened_at: new Date().toISOString(),
            });

            onClose();
        } catch (err) {
            console.error('[LogTradeModal] Save failed:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-sentinel-900 border border-sentinel-800 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Log new trade"
            >
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold text-sentinel-100">Log New Trade</h3>
                    <button onClick={onClose} className="text-sentinel-500 hover:text-sentinel-300 bg-transparent border-none cursor-pointer" aria-label="Close modal">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-ticker">Ticker</label>
                        <input
                            id="trade-ticker"
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value.toUpperCase())}
                            placeholder="AAPL"
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                        />
                    </div>

                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-side">Side</label>
                            <select
                                id="trade-side"
                                value={side}
                                onChange={(e) => setSide(e.target.value as 'long' | 'short')}
                                className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none"
                            >
                                <option value="long">Long (Buy)</option>
                                <option value="short">Short (Sell)</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-shares">Shares</label>
                            <input
                                id="trade-shares"
                                type="number"
                                value={shares}
                                onChange={(e) => setShares(e.target.value)}
                                placeholder="10"
                                className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-price">Entry Price</label>
                        <input
                            id="trade-price"
                            type="number"
                            step="0.01"
                            value={entryPrice}
                            onChange={(e) => setEntryPrice(e.target.value)}
                            placeholder="150.00"
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 font-mono"
                        />
                    </div>

                    <div>
                        <label className="text-xs text-sentinel-400 font-medium mb-1 block" htmlFor="trade-notes">Notes (optional)</label>
                        <textarea
                            id="trade-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Trade rationale..."
                            rows={2}
                            className="w-full bg-sentinel-800 text-sentinel-200 rounded-lg px-3 py-2 text-sm border border-sentinel-700/50 outline-none focus:ring-1 focus:ring-sentinel-600 resize-none"
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={!ticker || !entryPrice || !shares || saving}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer"
                    >
                        {saving ? 'Saving...' : 'Save Trade'}
                    </button>
                </div>
            </motion.div>
        </motion.div>
    );
}
