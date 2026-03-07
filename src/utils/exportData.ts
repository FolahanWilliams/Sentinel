/**
 * CSV Export Utilities for Sentinel
 *
 * Provides CSV generation and download for signals, journal entries,
 * and backtest trade results.
 */

import type { Signal } from '@/types/signals';
import type { JournalEntry } from '@/services/journalService';
import type { BacktestTrade } from '@/services/backtestEngine';

/** Escape a CSV field: wrap in quotes if it contains commas, quotes, or newlines. */
function escapeCSVField(value: unknown): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** Join fields into a single CSV row. */
function toCSVRow(fields: unknown[]): string {
    return fields.map(escapeCSVField).join(',');
}

/** Build a complete CSV string from headers and rows. */
function buildCSV(headers: string[], rows: unknown[][]): string {
    const lines = [toCSVRow(headers), ...rows.map(toCSVRow)];
    return lines.join('\n');
}

/**
 * Export an array of Signal objects to CSV.
 * Columns: ticker, signal_type, bias_type, confidence_score, thesis,
 *          target_price, stop_loss, entry_price, status, created_at
 */
export function exportSignalsToCSV(signals: Signal[]): string {
    const headers = [
        'ticker',
        'signal_type',
        'bias_type',
        'confidence_score',
        'thesis',
        'target_price',
        'stop_loss',
        'entry_price',
        'status',
        'created_at',
    ];

    const rows = signals.map((s) => [
        s.ticker,
        s.signal_type,
        s.bias_type,
        s.confidence_score,
        s.thesis,
        s.target_price,
        s.stop_loss,
        s.suggested_entry_low,
        s.status,
        s.created_at,
    ]);

    return buildCSV(headers, rows);
}

/**
 * Export an array of JournalEntry objects to CSV.
 * Columns: entry_type, ticker, content, mood, tags, created_at
 */
export function exportJournalToCSV(entries: JournalEntry[]): string {
    const headers = [
        'entry_type',
        'ticker',
        'content',
        'mood',
        'tags',
        'created_at',
    ];

    const rows = entries.map((e) => [
        e.entry_type,
        e.ticker,
        e.content,
        e.mood,
        e.tags.join('; '),
        e.created_at,
    ]);

    return buildCSV(headers, rows);
}

/**
 * Export an array of BacktestTrade objects to CSV.
 * Columns: ticker, signal_type, confidence, entry_price, pnl_pct,
 *          pnl_usd, equity_after, date
 */
export function exportBacktestToCSV(trades: BacktestTrade[]): string {
    const headers = [
        'ticker',
        'signal_type',
        'confidence',
        'entry_price',
        'pnl_pct',
        'pnl_usd',
        'equity_after',
        'date',
    ];

    const rows = trades.map((t) => [
        t.ticker,
        t.signal_type,
        t.confidence,
        t.entry_price,
        t.pnl_pct,
        t.pnl_usd,
        t.equity_after,
        t.date,
    ]);

    return buildCSV(headers, rows);
}

/**
 * Trigger a browser download of CSV content as a file.
 */
export function downloadCSV(filename: string, csvContent: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
