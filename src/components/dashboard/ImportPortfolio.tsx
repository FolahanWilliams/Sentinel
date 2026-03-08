/**
 * Sentinel — Universal Brokerage Portfolio Importer
 *
 * Drag-and-drop import supporting CSV and PDF files from multiple brokerages:
 * - Hargreaves Lansdown (CSV)
 * - Wells Fargo Advisors (PDF)
 * - Generic brokerage CSV (Fidelity, Schwab, etc.)
 * - Generic PDF fallback
 *
 * Features:
 * - Auto-detects brokerage from file content
 * - Duplicate detection with replace option
 * - Editable quantity and price fields in preview
 * - Auto-updates portfolio total capital
 * - Auto-close positions missing from re-import
 */

import { useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/config/supabase';
import { MarketDataService } from '@/services/marketData';
import { Upload, X, FileText, AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatPrice } from '@/utils/formatters';
import { inferCurrency } from '@/utils/portfolio';
import type { Position } from '@/hooks/usePortfolio';
import {
    parseBrokerageDocument,
    type ParsedHolding,
    type AccountSummary,
    type ParseResult,
    type BrokerageType,
} from '@/services/brokerageParser';

interface ImportPortfolioProps {
    onClose: () => void;
    existingTickers?: string[];
    existingPositions?: Position[];
}

const BROKERAGE_LABELS: Record<BrokerageType, string> = {
    'hargreaves-lansdown': 'Hargreaves Lansdown',
    'wells-fargo': 'Wells Fargo Advisors',
    'generic-csv': 'Brokerage CSV',
    'unknown': 'Unknown',
};

export function ImportPortfolio({ onClose, existingTickers = [], existingPositions = [] }: ImportPortfolioProps) {
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
    const [holdings, setHoldings] = useState<ParsedHolding[]>([]);
    const [parseErrors, setParseErrors] = useState<string[]>([]);
    const [importResult, setImportResult] = useState<{ success: number; failed: number; replaced: number; capitalUpdated: number | null; closed: number }>({ success: 0, failed: 0, replaced: 0, capitalUpdated: null, closed: 0 });
    const [replaceExisting, setReplaceExisting] = useState(false);
    const [autoCloseEnabled, setAutoCloseEnabled] = useState(true);
    const [accountSummary, setAccountSummary] = useState<AccountSummary | null>(null);
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [isGBPSource, setIsGBPSource] = useState(false);
    const [brokerage, setBrokerage] = useState<BrokerageType>('unknown');
    const [dragActive, setDragActive] = useState(false);
    const [parsing, setParsing] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const existingSet = new Set(existingTickers.map(t => t.toUpperCase()));

    const handleFile = useCallback(async (file: File) => {
        const ext = file.name.toLowerCase().split('.').pop();
        if (ext !== 'csv' && ext !== 'pdf') {
            setParseErrors(['Please upload a .csv or .pdf file from your brokerage.']);
            return;
        }

        setParsing(true);
        setParseErrors([]);

        try {
            const result: ParseResult = await parseBrokerageDocument(file, existingSet);
            setHoldings(result.holdings);
            setParseErrors(result.errors);
            setAccountSummary(result.accountSummary);
            setExchangeRate(result.exchangeRate);
            setIsGBPSource(result.isGBPSource);
            setBrokerage(result.brokerage);
            if (result.holdings.length > 0) setStep('preview');
        } catch (err) {
            setParseErrors([`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`]);
        } finally {
            setParsing(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(true);
    }, []);

    const handleDragLeave = useCallback(() => setDragActive(false), []);

    const toggleHolding = (idx: number) => {
        setHoldings(prev => prev.map((h, i) => i === idx ? { ...h, selected: !h.selected } : h));
    };

    const toggleAll = () => {
        const allSelected = holdings.every(h => h.selected);
        setHoldings(prev => prev.map(h => ({ ...h, selected: !allSelected })));
    };

    const toggleReplaceDuplicates = () => {
        const next = !replaceExisting;
        setReplaceExisting(next);
        if (next) {
            setHoldings(prev => prev.map(h => h.isDuplicate ? { ...h, selected: true } : h));
        }
    };

    const toggleSuffix = (idx: number) => {
        setHoldings(prev => prev.map((h, i) => {
            if (i !== idx) return h;
            const t = h.ticker;
            return { ...h, ticker: t.endsWith('.L') ? t.replace('.L', '') : `${t}.L` };
        }));
    };

    const updateField = (idx: number, field: 'quantity' | 'price', value: string) => {
        const num = parseFloat(value);
        if (isNaN(num) || num < 0) return;
        setHoldings(prev => prev.map((h, i) => {
            if (i !== idx) return h;
            const updated = { ...h, [field]: num };
            updated.cost = updated.quantity * updated.price;
            return updated;
        }));
    };

    const handleImport = async () => {
        const selected = holdings.filter(h => h.selected);
        if (selected.length === 0) return;

        setStep('importing');
        let success = 0;
        let failed = 0;
        let replaced = 0;

        // If replacing duplicates, delete existing open positions for those tickers first
        if (replaceExisting) {
            const dupTickers = selected.filter(h => h.isDuplicate).map(h => h.ticker.toUpperCase());
            const allVariants = dupTickers.flatMap(t => t.endsWith('.L') ? [t, t.replace('.L', '')] : [t, `${t}.L`]);

            if (allVariants.length > 0) {
                const { error: delErr } = await supabase
                    .from('positions')
                    .delete()
                    .eq('status', 'open')
                    .in('ticker', allVariants);

                if (delErr) {
                    console.error('[ImportPortfolio] Failed to delete existing positions:', delErr);
                } else {
                    replaced = dupTickers.length;
                }
            }
        }

        const brokerageLabel = BROKERAGE_LABELS[brokerage] || brokerage;
        const rows = selected.map(h => ({
            ticker: h.ticker.toUpperCase(),
            side: 'long' as const,
            entry_price: Math.round(h.price * 10000) / 10000,
            shares: h.quantity,
            position_size_usd: Math.round(h.cost * 100) / 100,
            currency: inferCurrency(h.ticker),
            status: 'open',
            notes: `Imported from ${brokerageLabel} — ${h.name}`,
            opened_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('positions').insert(rows);

        if (error) {
            console.error('[ImportPortfolio] Batch insert failed, trying individual:', error);
            for (const row of rows) {
                const { error: singleErr } = await supabase.from('positions').insert(row);
                if (singleErr) {
                    console.error(`[ImportPortfolio] Failed: ${row.ticker}`, singleErr);
                    failed++;
                } else {
                    success++;
                }
            }
        } else {
            success = rows.length;
        }

        // Auto-update total capital
        let capitalUpdated: number | null = null;
        if (accountSummary && accountSummary.totalValue > 0) {
            const conversionRate = (isGBPSource && exchangeRate) ? exchangeRate : 1;
            const totalInUsd = Math.round(accountSummary.totalValue * conversionRate * 100) / 100;

            const { data: existing } = await supabase
                .from('portfolio_config')
                .select('id')
                .limit(1)
                .single();

            if (existing?.id) {
                const { error: capErr } = await supabase
                    .from('portfolio_config')
                    .update({ total_capital: totalInUsd })
                    .eq('id', existing.id);
                if (!capErr) capitalUpdated = totalInUsd;
            } else {
                const { error: capErr } = await supabase
                    .from('portfolio_config')
                    .insert({ total_capital: totalInUsd });
                if (!capErr) capitalUpdated = totalInUsd;
            }
        }

        // Auto-close positions missing from the import (sold)
        let closed = 0;
        const deletedTickers = new Set(selected.filter(h => h.isDuplicate).map(h => h.ticker.toUpperCase()));
        const toAutoClose = missingPositions.filter(p => !deletedTickers.has(p.ticker.toUpperCase()));
        if (autoCloseEnabled && toAutoClose.length > 0) {
            for (const pos of toAutoClose) {
                try {
                    let exitPrice = pos.entry_price ?? 0;
                    try {
                        const quote = await MarketDataService.getQuote(pos.ticker);
                        if (quote?.price) exitPrice = quote.price;
                    } catch { /* use entry price as fallback */ }

                    const entryValue = (pos.entry_price ?? 0) * (pos.shares ?? 0);
                    const exitValue = exitPrice * (pos.shares ?? 0);
                    const realizedPnl = pos.side === 'long'
                        ? exitValue - entryValue
                        : entryValue - exitValue;
                    const realizedPnlPct = entryValue > 0 ? (realizedPnl / entryValue) * 100 : 0;

                    const { error: closeErr } = await supabase
                        .from('positions')
                        .update({
                            status: 'closed',
                            exit_price: Math.round(exitPrice * 10000) / 10000,
                            realized_pnl: Math.round(realizedPnl * 100) / 100,
                            realized_pnl_pct: Math.round(realizedPnlPct * 100) / 100,
                            closed_at: new Date().toISOString(),
                            close_reason: `Auto-closed: missing from ${brokerageLabel} re-import`,
                        })
                        .eq('id', pos.id);

                    if (!closeErr) closed++;
                } catch (err) {
                    console.error(`[ImportPortfolio] Failed to auto-close ${pos.ticker}:`, err);
                }
            }
        }

        setImportResult({ success, failed, replaced, capitalUpdated, closed });
        setStep('done');
    };

    // Detect positions that exist in the DB but are MISSING from the import (sold)
    const missingPositions = useMemo(() => {
        if (holdings.length === 0 || existingPositions.length === 0) return [];
        const csvTickers = new Set(holdings.map(h => h.ticker.toUpperCase()));
        holdings.forEach(h => {
            const base = h.ticker.replace('.L', '').toUpperCase();
            csvTickers.add(base);
            csvTickers.add(`${base}.L`);
        });
        return existingPositions.filter(p =>
            p.status === 'open' && !csvTickers.has(p.ticker.toUpperCase())
        );
    }, [holdings, existingPositions]);

    const selectedCount = holdings.filter(h => h.selected).length;
    const totalCost = holdings.filter(h => h.selected).reduce((sum, h) => sum + h.cost, 0);

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
                className="bg-sentinel-900 border border-sentinel-800 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label="Import Portfolio"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold text-sentinel-100 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-400" />
                        Import Portfolio
                        {brokerage !== 'unknown' && step !== 'upload' && (
                            <span className="text-xs font-normal text-sentinel-500 ml-1">
                                ({BROKERAGE_LABELS[brokerage]})
                            </span>
                        )}
                    </h3>
                    <button onClick={onClose} className="text-sentinel-500 hover:text-sentinel-300 bg-transparent border-none cursor-pointer" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {/* Step 1: Upload */}
                    {step === 'upload' && (
                        <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <div
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => !parsing && fileRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                                    parsing
                                        ? 'border-blue-500/40 bg-blue-500/5 cursor-wait'
                                        : dragActive
                                            ? 'border-blue-500 bg-blue-500/10'
                                            : 'border-sentinel-700 hover:border-sentinel-600 bg-sentinel-800/30'
                                }`}
                            >
                                {parsing ? (
                                    <>
                                        <Loader2 className="w-10 h-10 mx-auto mb-3 text-blue-400 animate-spin" />
                                        <p className="text-sm text-sentinel-300 mb-1">
                                            Parsing document...
                                        </p>
                                        <p className="text-xs text-sentinel-500">
                                            Detecting brokerage format and extracting holdings
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <Upload className={`w-10 h-10 mx-auto mb-3 ${dragActive ? 'text-blue-400' : 'text-sentinel-500'}`} />
                                        <p className="text-sm text-sentinel-300 mb-1">
                                            Drag & drop your portfolio export here
                                        </p>
                                        <p className="text-xs text-sentinel-500">
                                            CSV or PDF &middot; Supports HL, Wells Fargo, Fidelity, Schwab & more
                                        </p>
                                    </>
                                )}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv,.pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFile(file);
                                    }}
                                />
                            </div>

                            {parseErrors.length > 0 && (
                                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-1">
                                    {parseErrors.map((err, i) => (
                                        <p key={i} className="text-xs text-red-400 flex items-start gap-2">
                                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                            {err}
                                        </p>
                                    ))}
                                </div>
                            )}

                            <div className="mt-4 space-y-2">
                                <p className="text-[10px] text-sentinel-600 leading-relaxed">
                                    <span className="text-sentinel-500 font-medium">Hargreaves Lansdown:</span> My Accounts &rarr; Portfolio &rarr; Download CSV
                                </p>
                                <p className="text-[10px] text-sentinel-600 leading-relaxed">
                                    <span className="text-sentinel-500 font-medium">Wells Fargo:</span> Upload your monthly statement PDF (Portfolio detail page)
                                </p>
                                <p className="text-[10px] text-sentinel-600 leading-relaxed">
                                    <span className="text-sentinel-500 font-medium">Others:</span> Export positions/holdings as CSV from your brokerage
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 2: Preview */}
                    {step === 'preview' && (
                        <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {parseErrors.length > 0 && (
                                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                                    {parseErrors.map((err, i) => (
                                        <p key={i} className="text-[11px] text-amber-400 flex items-start gap-2">
                                            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                            {err}
                                        </p>
                                    ))}
                                    {holdings.some(h => h.isDuplicate) && (
                                        <button
                                            onClick={toggleReplaceDuplicates}
                                            className={`mt-1 px-2.5 py-1 text-[11px] font-medium rounded-md border-none cursor-pointer transition-colors flex items-center gap-1.5 ${
                                                replaceExisting
                                                    ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                                                    : 'bg-sentinel-800/50 text-sentinel-400 hover:text-sentinel-300 hover:bg-sentinel-800'
                                            }`}
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            {replaceExisting ? 'Will replace duplicates' : 'Replace existing positions'}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Account summary + exchange rate banner */}
                            <div className="mb-3 flex items-center gap-4 px-1 flex-wrap">
                                {accountSummary && (
                                    <>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">Stock Value</span>
                                            <span className="text-xs font-mono text-sentinel-300">
                                                {formatPrice(accountSummary.stockValue, isGBPSource ? 'GBP' : 'USD')}
                                            </span>
                                        </div>
                                        {accountSummary.totalCash !== 0 && (
                                            <div className="flex flex-col">
                                                <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">Cash</span>
                                                <span className="text-xs font-mono text-sentinel-300">
                                                    {formatPrice(Math.abs(accountSummary.totalCash), isGBPSource ? 'GBP' : 'USD')}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">
                                                Total{isGBPSource ? ' (GBP)' : ''}
                                            </span>
                                            <span className="text-xs font-mono text-sentinel-300">
                                                {formatPrice(accountSummary.totalValue, isGBPSource ? 'GBP' : 'USD')}
                                            </span>
                                        </div>
                                    </>
                                )}
                                {exchangeRate && (
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">GBP/USD Rate</span>
                                        <span className="text-xs font-mono text-blue-400">{exchangeRate.toFixed(4)}</span>
                                    </div>
                                )}
                                {accountSummary && exchangeRate && isGBPSource && (
                                    <div className="flex flex-col ml-auto text-right">
                                        <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">Capital (USD)</span>
                                        <span className="text-xs font-mono text-emerald-400 font-medium">{formatPrice(accountSummary.totalValue * exchangeRate)}</span>
                                    </div>
                                )}
                                {accountSummary && !exchangeRate && isGBPSource && (
                                    <span className="text-[9px] text-amber-500 ml-auto">No exchange rate found — values stored as-is</span>
                                )}
                            </div>

                            <div className="overflow-x-auto rounded-lg border border-sentinel-800/50">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-[10px] text-sentinel-500 uppercase tracking-wider border-b border-sentinel-800/30 bg-sentinel-800/20">
                                            <th className="px-3 py-2 text-left font-medium w-8">
                                                <input
                                                    type="checkbox"
                                                    checked={holdings.length > 0 && holdings.every(h => h.selected)}
                                                    onChange={toggleAll}
                                                    className="accent-emerald-500 cursor-pointer"
                                                    title="Select / deselect all"
                                                />
                                            </th>
                                            <th className="px-3 py-2 text-left font-medium">Ticker</th>
                                            <th className="px-3 py-2 text-left font-medium">Name</th>
                                            <th className="px-3 py-2 text-right font-medium">Qty</th>
                                            <th className="px-3 py-2 text-right font-medium">Avg Cost</th>
                                            <th className="px-3 py-2 text-right font-medium">Cost Basis</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {holdings.map((h, i) => {
                                            const currency = inferCurrency(h.ticker);
                                            return (
                                                <tr
                                                    key={i}
                                                    className={`border-b border-sentinel-800/20 transition-colors ${
                                                        h.selected ? 'hover:bg-sentinel-800/30' : 'opacity-40'
                                                    } ${h.isDuplicate ? 'ring-1 ring-inset ring-amber-500/20' : ''}`}
                                                >
                                                    <td className="px-3 py-2">
                                                        <input
                                                            type="checkbox"
                                                            checked={h.selected}
                                                            onChange={() => toggleHolding(i)}
                                                            className="accent-emerald-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono font-bold text-sentinel-200">{h.ticker}</span>
                                                            {isGBPSource && (
                                                                <button
                                                                    onClick={() => toggleSuffix(i)}
                                                                    className="px-1 py-0.5 text-[9px] font-mono bg-blue-500/10 text-blue-400 rounded ring-1 ring-blue-500/20 hover:bg-blue-500/20 transition-colors border-none cursor-pointer"
                                                                    title="Toggle .L suffix for London Stock Exchange"
                                                                >
                                                                    {h.ticker.endsWith('.L') ? 'UK' : 'US'}
                                                                </button>
                                                            )}
                                                            {h.isDuplicate && (
                                                                <span className="px-1 py-0.5 text-[9px] bg-amber-500/10 text-amber-400 rounded ring-1 ring-amber-500/20" title="Already in portfolio">
                                                                    DUP
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-sentinel-400 text-xs max-w-[160px] truncate">{h.name}</td>
                                                    <td className="px-3 py-2 text-right">
                                                        <input
                                                            type="number"
                                                            value={h.quantity}
                                                            onChange={(e) => updateField(i, 'quantity', e.target.value)}
                                                            className="w-16 text-right font-mono text-sentinel-300 bg-transparent border-b border-sentinel-700/50 focus:border-sentinel-500 outline-none text-sm py-0.5"
                                                            step="any"
                                                            min="0"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-right">
                                                        <input
                                                            type="number"
                                                            value={Math.round(h.price * 100) / 100}
                                                            onChange={(e) => updateField(i, 'price', e.target.value)}
                                                            className="w-20 text-right font-mono text-sentinel-300 bg-transparent border-b border-sentinel-700/50 focus:border-sentinel-500 outline-none text-sm py-0.5"
                                                            step="0.01"
                                                            min="0"
                                                        />
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono text-sentinel-300">{formatPrice(h.cost, currency)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Missing positions — will be auto-closed */}
                            {missingPositions.length > 0 && (
                                <div className="mt-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                                            <span className="text-[11px] text-red-400 font-medium">
                                                {missingPositions.length} position{missingPositions.length !== 1 ? 's' : ''} no longer in export (sold?)
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => setAutoCloseEnabled(!autoCloseEnabled)}
                                            className={`px-2 py-0.5 text-[10px] font-medium rounded border-none cursor-pointer transition-colors ${
                                                autoCloseEnabled
                                                    ? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/30'
                                                    : 'bg-sentinel-800/50 text-sentinel-500 hover:text-sentinel-400'
                                            }`}
                                        >
                                            {autoCloseEnabled ? 'Will auto-close' : 'Skip closing'}
                                        </button>
                                    </div>
                                    <div className="space-y-1">
                                        {missingPositions.map(pos => (
                                            <div key={pos.id} className="flex items-center justify-between text-[11px]">
                                                <span className="font-mono text-sentinel-300">{pos.ticker}</span>
                                                <span className="text-sentinel-500">
                                                    {pos.shares ?? 0} shares @ {formatPrice(pos.entry_price ?? 0, inferCurrency(pos.ticker))}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {autoCloseEnabled && (
                                        <p className="text-[9px] text-sentinel-600 mt-2">
                                            Exit price will use last market quote. You can edit afterwards.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center justify-between mt-4">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => { setStep('upload'); setHoldings([]); setParseErrors([]); setBrokerage('unknown'); }}
                                        className="px-3 py-1.5 text-sentinel-400 hover:text-sentinel-200 text-xs bg-transparent border border-sentinel-700 rounded-lg cursor-pointer transition-colors"
                                    >
                                        Back
                                    </button>
                                    <span className="text-xs text-sentinel-500">
                                        {selectedCount} of {holdings.length} selected &middot; {formatPrice(totalCost)} total
                                    </span>
                                </div>
                                <button
                                    onClick={handleImport}
                                    disabled={selectedCount === 0}
                                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-none cursor-pointer flex items-center gap-2"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    Import {selectedCount} Position{selectedCount !== 1 ? 's' : ''}
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Step 3: Importing */}
                    {step === 'importing' && (
                        <motion.div key="importing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-10 text-center">
                            <Loader2 className="w-8 h-8 text-blue-400 animate-spin mx-auto mb-3" />
                            <p className="text-sm text-sentinel-300">Importing positions...</p>
                        </motion.div>
                    )}

                    {/* Step 4: Done */}
                    {step === 'done' && (
                        <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-8 text-center">
                            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                            <p className="text-sm text-sentinel-200 font-medium mb-1">
                                Import Complete
                            </p>
                            <p className="text-xs text-sentinel-400 mb-2">
                                {importResult.success} position{importResult.success !== 1 ? 's' : ''} imported successfully
                                {importResult.replaced > 0 && (
                                    <span className="text-amber-400"> ({importResult.replaced} replaced)</span>
                                )}
                                {importResult.failed > 0 && (
                                    <span className="text-red-400"> ({importResult.failed} failed)</span>
                                )}
                            </p>
                            {importResult.closed > 0 && (
                                <p className="text-xs text-red-400/80 mb-2">
                                    {importResult.closed} position{importResult.closed !== 1 ? 's' : ''} auto-closed (no longer in export)
                                </p>
                            )}
                            {importResult.capitalUpdated !== null && (
                                <p className="text-xs text-emerald-400 mb-2">
                                    Total capital updated to {formatPrice(importResult.capitalUpdated)}
                                </p>
                            )}
                            {exchangeRate && isGBPSource && (
                                <p className="text-[10px] text-sentinel-500 mb-4">
                                    GBP/USD rate: {exchangeRate.toFixed(4)} (from export)
                                </p>
                            )}
                            <div className="flex items-center justify-center gap-2">
                                <span className="text-[10px] text-sentinel-600">
                                    Source: {BROKERAGE_LABELS[brokerage]}
                                </span>
                            </div>
                            <button
                                onClick={onClose}
                                className="mt-4 px-5 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700 border-none cursor-pointer"
                            >
                                Done
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}
