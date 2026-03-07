/**
 * Sentinel — Hargreaves Lansdown CSV Importer
 *
 * Drag-and-drop CSV import for HL portfolio exports.
 * Parses HL's standard format, shows a preview table, and batch-inserts into positions.
 *
 * Features:
 * - Auto-detects pence vs pounds in Price column (HL often exports in pence)
 * - Duplicate detection: warns if ticker already exists in open positions
 * - Select all / deselect all toggle
 * - GBP→USD conversion using HL's own exchange rate from the CSV footer
 * - Auto-appends .L suffix for UK-native stocks (non-*R)
 * - Editable quantity and price fields in preview
 * - Auto-updates portfolio total capital from HL account summary
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/config/supabase';
import { Upload, X, FileText, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatPrice } from '@/utils/formatters';
import { inferCurrency } from '@/utils/portfolio';

interface ParsedHolding {
    ticker: string;
    name: string;
    quantity: number;
    price: number;       // Entry price (cost basis per share) — in target currency (USD)
    value: number;
    cost: number;        // Total cost basis — in target currency (USD)
    pnl: number;
    pnlPct: number;
    selected: boolean;
    isDuplicate: boolean;
    isConverted: boolean; // true if *R stock (HL converted from foreign currency to GBP)
}

interface ImportHLCSVProps {
    onClose: () => void;
    existingTickers?: string[];
}

interface AccountSummary {
    stockValue: number;
    totalCash: number;
    totalValue: number;
}

/** Safe column accessor — returns '' for missing indices */
function getCol(cols: string[], idx: number | undefined): string {
    if (idx === undefined || idx < 0 || idx >= cols.length) return '';
    return cols[idx] ?? '';
}

/**
 * Find the header row in an HL CSV export.
 *
 * HL's account-summary CSV has ~10 metadata rows (client name, account number,
 * summary values) before the actual data table. The header row contains columns
 * like "Code", "Stock", "Units held", "Price (pence)", "Value (£)", "Cost (£)".
 * We scan all lines until we find the one that looks like a data header.
 */
function findHeaderRow(lines: string[]): number {
    const headerKeywords = ['code', 'ticker', 'tidm', 'stock', 'units held', 'price', 'value', 'cost'];
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        const lower = (lines[i] ?? '').toLowerCase();
        const matches = headerKeywords.filter(kw => lower.includes(kw));
        if (matches.length >= 3) return i;
    }
    return -1;
}

/**
 * Extract account summary values from HL metadata rows (before the data table).
 * HL format has rows like:
 *   "Stock value:",,"2,049.88"
 *   "Total cash:",,"0.65"
 *   "Total value:",,"2,050.53"
 */
function parseAccountSummary(lines: string[], headerIdx: number): AccountSummary {
    const summary: AccountSummary = { stockValue: 0, totalCash: 0, totalValue: 0 };
    for (let i = 0; i < headerIdx; i++) {
        const cols = parseCSVLine(lines[i] ?? '');
        const label = (cols[0] ?? '').toLowerCase().replace(/[:]/g, '').trim();
        const val = parseNumber(cols[2] ?? '') || parseNumber(cols[1] ?? '');
        if (label === 'stock value') summary.stockValue = val;
        else if (label === 'total cash') summary.totalCash = val;
        else if (label === 'amount available to invest' && summary.totalCash === 0) summary.totalCash = val;
        else if (label === 'total value') summary.totalValue = val;
    }
    if (summary.totalValue === 0 && summary.stockValue > 0) {
        summary.totalValue = summary.stockValue + summary.totalCash;
    }
    return summary;
}

/**
 * Parse GBP/USD exchange rate from HL CSV footer.
 *
 * HL includes a line like:
 *   "- US and Canadian stocks: 1.3411USD to 100 pence. Exchange rate correct at 07/03/2026"
 *
 * This means 100 pence (= £1) = 1.3411 USD, so GBP→USD rate = 1.3411.
 */
function parseExchangeRate(lines: string[]): number | null {
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = (lines[i] ?? '').toLowerCase();
        // Match patterns like "1.3411usd to 100 pence" or "1.34usd to 100p"
        const match = line.match(/([\d.]+)\s*usd\s+to\s+100\s*p/);
        if (match) {
            const rate = parseFloat(match[1]!);
            if (rate > 0 && rate < 10) return rate; // sanity check
        }
    }
    return null;
}

interface ParseResult {
    holdings: ParsedHolding[];
    errors: string[];
    accountSummary: AccountSummary | null;
    exchangeRate: number | null;
    isGBPSource: boolean;
}

/**
 * Parse HL CSV export. Handles the actual HL "account-summary" format:
 *
 * Rows 1-10: Metadata (account name, client number, stock value, cash, etc.)
 * Row 11:    Header — Code, Stock, Units held, Price (pence), Value (£), Cost (£), Gain/loss (£), Gain/loss (%)
 * Rows 12+:  Data rows (one per holding)
 * Last row:  "Totals" summary row
 * Footer:    Disclaimers and exchange rate notes
 *
 * Currency handling:
 * - Stocks marked with *R in the name column had their price converted to GBP by HL.
 *   These are foreign (typically US) stocks → we convert back to USD using HL's own rate.
 * - Non-*R stocks are UK-native → we append .L suffix and keep GBP values.
 * - Account summary (total capital) is converted to USD.
 */
function parseHLCSV(text: string, existingTickers: Set<string>): ParseResult {
    const errors: string[] = [];
    const holdings: ParsedHolding[] = [];

    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) {
        errors.push('CSV file appears empty or has no data rows.');
        return { holdings, errors, accountSummary: null, exchangeRate: null, isGBPSource: false };
    }

    const headerIdx = findHeaderRow(lines);
    if (headerIdx === -1) {
        errors.push('Could not find the data header row. Expected columns like "Code", "Stock", "Units held", "Price", "Value", "Cost".');
        return { holdings, errors, accountSummary: null, exchangeRate: null, isGBPSource: false };
    }

    const accountSummary = parseAccountSummary(lines, headerIdx);
    const exchangeRate = parseExchangeRate(lines);
    const headers = parseCSVLine(lines[headerIdx] ?? '').map(h => h.toLowerCase().trim());

    // Detect GBP source from headers (£ or pence in column names)
    const isGBPSource = headers.some(h => h.includes('£') || h.includes('pence'));

    const colMap: Record<string, number | undefined> = {};
    const aliases: Record<string, string[]> = {
        ticker: ['code', 'ticker', 'tidm', 'epic', 'symbol'],
        name: ['stock', 'stock name', 'name', 'holding', 'security'],
        quantity: ['units held', 'quantity', 'units', 'shares', 'holding quantity'],
        price: ['price (pence)', 'price (p)', 'price', 'current price', 'last price'],
        value: ['value (£)', 'value (gbp)', 'value', 'market value', 'current value'],
        cost: ['cost (£)', 'cost (gbp)', 'cost', 'total cost', 'book cost'],
        gainLoss: ['gain/loss (£)', 'gain/loss', 'p&l'],
        gainLossPct: ['gain/loss (%)', 'gain/loss %', 'p&l %'],
    };

    for (const [field, names] of Object.entries(aliases)) {
        const idx = headers.findIndex(h => names.some(n => h.includes(n)));
        if (idx !== -1) colMap[field] = idx;
    }

    if (colMap.ticker === undefined) {
        errors.push(`Could not find a Code/Ticker column in header row ${headerIdx + 1}. Found columns: ${headers.filter(h => h).join(', ')}`);
        return { holdings, errors, accountSummary, exchangeRate, isGBPSource };
    }
    if (colMap.quantity === undefined && colMap.value === undefined) {
        errors.push('Could not find "Units held" or "Value" columns in CSV header.');
        return { holdings, errors, accountSummary, exchangeRate, isGBPSource };
    }

    const priceInPence = headers.some(h => h.includes('pence') || h.includes('(p)'));

    // Use exchange rate for GBP→USD conversion (fallback to 1.0 if not found = no conversion)
    const gbpToUsd = (isGBPSource && exchangeRate) ? exchangeRate : 1;

    const tickerIdx = colMap.ticker;
    for (let i = headerIdx + 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i] ?? '');
        if (cols.length < 2) continue;

        const rawTicker = getCol(cols, tickerIdx);
        if (!rawTicker) continue;
        const lowerTicker = rawTicker.toLowerCase().trim();
        if (lowerTicker === 'totals' || lowerTicker === 'total' || lowerTicker === 'cash') continue;
        if (lowerTicker.startsWith('shares are') || lowerTicker.startsWith('*') || lowerTicker.startsWith('-')) continue;

        const nameVal = getCol(cols, colMap.name);
        if (nameVal.toLowerCase().trim() === 'totals' || nameVal.toLowerCase().trim() === 'total') continue;

        const baseTicker = rawTicker.toUpperCase().trim();
        if (!/^[A-Z0-9.]{1,10}$/.test(baseTicker)) continue;

        // Detect *R flag — HL marks stocks whose price was converted from foreign currency to GBP
        const isConverted = nameVal.includes('*R');

        // For GBP-source CSVs: non-*R stocks are UK-native → append .L
        // *R stocks are foreign (usually US) → keep without .L
        const ticker = (isGBPSource && !isConverted) ? `${baseTicker}.L` : baseTicker;

        const name = nameVal.replace(/\s*\*\d+\s*/g, '').replace(/\s*\*R\s*/g, '').trim() || ticker;
        const quantity = parseNumber(getCol(cols, colMap.quantity));
        let price = parseNumber(getCol(cols, colMap.price));
        let value = parseNumber(getCol(cols, colMap.value));
        let cost = parseNumber(getCol(cols, colMap.cost));

        // Convert pence to pounds
        if (priceInPence && price > 0) {
            price = price / 100;
        }

        // For *R stocks (foreign stocks with GBP-converted values): convert to USD
        // For non-*R stocks (UK-native): keep in GBP (market quotes in GBP will match)
        if (isConverted && gbpToUsd > 1) {
            value = value * gbpToUsd;
            cost = cost * gbpToUsd;
            // price is per-share in pence→pounds, also needs conversion
            price = price * gbpToUsd;
        }

        const gainLoss = parseNumber(getCol(cols, colMap.gainLoss));
        const gainLossPct = parseNumber(getCol(cols, colMap.gainLossPct));

        if (quantity <= 0 && value <= 0 && cost <= 0) {
            errors.push(`Row ${i + 1}: Skipped "${rawTicker}" — no quantity, value, or cost.`);
            continue;
        }

        const effectiveCost = cost || value;
        const effectiveQty = quantity || (price > 0 ? (value || cost) / price : 0);
        const entryPrice = effectiveQty > 0 ? effectiveCost / effectiveQty : price;
        const pnl = gainLoss || (value - cost);
        const pnlPct = gainLossPct || (cost > 0 ? ((value - cost) / cost) * 100 : 0);
        const isDuplicate = existingTickers.has(ticker) || existingTickers.has(baseTicker) || existingTickers.has(`${baseTicker}.L`);

        holdings.push({
            ticker,
            name,
            quantity: effectiveQty,
            price: entryPrice,
            value: value || cost,
            cost: effectiveCost,
            pnl,
            pnlPct,
            selected: !isDuplicate,
            isDuplicate,
            isConverted,
        });
    }

    if (holdings.length === 0 && errors.length === 0) {
        errors.push('No valid holdings found in CSV. Expected HL account-summary format with Code, Stock, Units held, Price, Value, Cost columns.');
    }

    const dupeCount = holdings.filter(h => h.isDuplicate).length;
    if (dupeCount > 0) {
        errors.push(`${dupeCount} holding${dupeCount > 1 ? 's' : ''} already exist in your portfolio (deselected by default).`);
    }

    return {
        holdings,
        errors,
        accountSummary: accountSummary.totalValue > 0 ? accountSummary : null,
        exchangeRate,
        isGBPSource,
    };
}

/** Parse a single CSV line handling quoted fields */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += c;
        }
    }
    result.push(current.trim());
    return result;
}

/** Parse a number from HL's format (handles commas, currency symbols, pence) */
function parseNumber(val: string): number {
    if (!val) return 0;
    const cleaned = val.replace(/[£$€,\s]/g, '').trim();
    if (!cleaned || cleaned === '-' || cleaned === 'n/a') return 0;
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

export function ImportHLCSV({ onClose, existingTickers = [] }: ImportHLCSVProps) {
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
    const [holdings, setHoldings] = useState<ParsedHolding[]>([]);
    const [parseErrors, setParseErrors] = useState<string[]>([]);
    const [importResult, setImportResult] = useState<{ success: number; failed: number; replaced: number; capitalUpdated: number | null }>({ success: 0, failed: 0, replaced: 0, capitalUpdated: null });
    const [replaceExisting, setReplaceExisting] = useState(false);
    const [accountSummary, setAccountSummary] = useState<AccountSummary | null>(null);
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const existingSet = new Set(existingTickers.map(t => t.toUpperCase()));

    const handleFile = useCallback((file: File) => {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            setParseErrors(['Please upload a .csv file.']);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            const result = parseHLCSV(text, existingSet);
            setHoldings(result.holdings);
            setParseErrors(result.errors);
            setAccountSummary(result.accountSummary);
            setExchangeRate(result.exchangeRate);
            if (result.holdings.length > 0) setStep('preview');
        };
        reader.readAsText(file);
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
                    console.error('[ImportHLCSV] Failed to delete existing positions:', delErr);
                } else {
                    replaced = dupTickers.length;
                }
            }
        }

        const rows = selected.map(h => ({
            ticker: h.ticker.toUpperCase(),
            side: 'long' as const,
            entry_price: Math.round(h.price * 10000) / 10000,
            shares: h.quantity,
            position_size_usd: Math.round(h.cost * 100) / 100,
            currency: inferCurrency(h.ticker),
            status: 'open',
            notes: `Imported from HL CSV — ${h.name}`,
            opened_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('positions').insert(rows);

        if (error) {
            console.error('[ImportHLCSV] Batch insert failed, trying individual:', error);
            for (const row of rows) {
                const { error: singleErr } = await supabase.from('positions').insert(row);
                if (singleErr) {
                    console.error(`[ImportHLCSV] Failed: ${row.ticker}`, singleErr);
                    failed++;
                } else {
                    success++;
                }
            }
        } else {
            success = rows.length;
        }

        // Auto-update total capital from HL account summary (converted to USD)
        let capitalUpdated: number | null = null;
        if (accountSummary && accountSummary.totalValue > 0) {
            const gbpToUsd = exchangeRate ?? 1;
            const totalInUsd = Math.round(accountSummary.totalValue * gbpToUsd * 100) / 100;

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

        setImportResult({ success, failed, replaced, capitalUpdated });
        setStep('done');
    };

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
                aria-label="Import HL CSV"
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-semibold text-sentinel-100 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-400" />
                        Import HL Portfolio
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
                                onClick={() => fileRef.current?.click()}
                                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                                    dragActive
                                        ? 'border-blue-500 bg-blue-500/10'
                                        : 'border-sentinel-700 hover:border-sentinel-600 bg-sentinel-800/30'
                                }`}
                            >
                                <Upload className={`w-10 h-10 mx-auto mb-3 ${dragActive ? 'text-blue-400' : 'text-sentinel-500'}`} />
                                <p className="text-sm text-sentinel-300 mb-1">
                                    Drag & drop your HL CSV export here
                                </p>
                                <p className="text-xs text-sentinel-500">
                                    or click to browse files
                                </p>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv"
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

                            <p className="text-[10px] text-sentinel-600 mt-4 leading-relaxed">
                                Export from HL: My Accounts &rarr; Portfolio &rarr; Download CSV.
                                GBP values are automatically converted to USD using the exchange rate from the CSV.
                            </p>
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
                                            <span className="text-xs font-mono text-sentinel-300">{formatPrice(accountSummary.stockValue, 'GBP')}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">Cash</span>
                                            <span className="text-xs font-mono text-sentinel-300">{formatPrice(accountSummary.totalCash, 'GBP')}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">Total (GBP)</span>
                                            <span className="text-xs font-mono text-sentinel-300">{formatPrice(accountSummary.totalValue, 'GBP')}</span>
                                        </div>
                                    </>
                                )}
                                {exchangeRate && (
                                    <div className="flex flex-col">
                                        <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">GBP/USD Rate</span>
                                        <span className="text-xs font-mono text-blue-400">{exchangeRate.toFixed(4)}</span>
                                    </div>
                                )}
                                {accountSummary && exchangeRate && (
                                    <div className="flex flex-col ml-auto text-right">
                                        <span className="text-[9px] text-sentinel-600 uppercase tracking-wider">Capital (USD)</span>
                                        <span className="text-xs font-mono text-emerald-400 font-medium">{formatPrice(accountSummary.totalValue * exchangeRate)}</span>
                                    </div>
                                )}
                                {accountSummary && !exchangeRate && (
                                    <span className="text-[9px] text-amber-500 ml-auto">No exchange rate found in CSV — values stored as-is</span>
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
                                                            <button
                                                                onClick={() => toggleSuffix(i)}
                                                                className="px-1 py-0.5 text-[9px] font-mono bg-blue-500/10 text-blue-400 rounded ring-1 ring-blue-500/20 hover:bg-blue-500/20 transition-colors border-none cursor-pointer"
                                                                title="Toggle .L suffix for London Stock Exchange"
                                                            >
                                                                {h.ticker.endsWith('.L') ? 'UK' : 'US'}
                                                            </button>
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

                            <div className="flex items-center justify-between mt-4">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => { setStep('upload'); setHoldings([]); setParseErrors([]); }}
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
                            {importResult.capitalUpdated !== null && (
                                <p className="text-xs text-emerald-400 mb-2">
                                    Total capital updated to {formatPrice(importResult.capitalUpdated)}
                                </p>
                            )}
                            {exchangeRate && (
                                <p className="text-[10px] text-sentinel-500 mb-4">
                                    GBP/USD rate: {exchangeRate.toFixed(4)} (from HL export)
                                </p>
                            )}
                            <button
                                onClick={onClose}
                                className="px-5 py-2 bg-sentinel-800 hover:bg-sentinel-700 text-sentinel-100 rounded-lg text-sm font-medium transition-colors ring-1 ring-sentinel-700 border-none cursor-pointer"
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
