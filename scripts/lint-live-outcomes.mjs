#!/usr/bin/env node
/**
 * lint-live-outcomes — drift guard for the backtest/simulation quarantine.
 *
 * Non-live rows (strategy backtests + Training Dojo simulations) live in the same
 * `signal_outcomes` table as real out-of-sample outcomes, tagged `is_simulated`.
 * Every LIVE calibration / performance / learning read MUST filter
 * `.eq('is_simulated', false)` or it re-contaminates the calibration curve and the
 * live performance record (the moat). This ratchet fails when a `signal_outcomes`
 * READ lacks that filter, so the fix can never silently regress.
 *
 * A read is exempt when it is:
 *   - a WRITE (.insert/.update/.upsert/.delete)
 *   - a PER-SIGNAL read (filters .eq('signal_id', ...) — one signal, no aggregation)
 *   - in an all-listed NON-LIVE surface (backtest / training-dojo / the backtest validator)
 *
 * Run: node scripts/lint-live-outcomes.mjs   (wired into npm run lint + CI)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'supabase/functions'];
// Files that legitimately read non-live outcomes (the inverse surfaces) and are
// therefore exempt from the live-only filter. Keep this list tight.
const ALLOWLIST = [
    'src/services/backtestValidator.ts',   // designed consumer of backtest history
    'src/pages/Backtest.tsx',              // backtest analysis surface (not live)
    'src/pages/TrainingDojo.tsx',          // simulation surface (not live)
];

const WRITE = /\.(insert|update|upsert|delete)\s*\(/;
const PER_SIGNAL = /\.eq\(\s*['"]signal_id['"]/;
const LIVE_FILTER = /\.eq\(\s*['"]is_simulated['"]\s*,\s*false\s*\)/;

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const s = statSync(p);
        if (s.isDirectory()) walk(p, out);
        else if (/\.(ts|tsx)$/.test(p) && !p.endsWith('.d.ts')) out.push(p);
    }
    return out;
}

const violations = [];

for (const root of ROOTS) {
    let files = [];
    try { files = walk(root); } catch { continue; }
    for (const file of files) {
        if (ALLOWLIST.includes(file)) continue;
        const text = readFileSync(file, 'utf8');
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (!lines[i].includes(".from('signal_outcomes')") && !lines[i].includes('.from("signal_outcomes")')) continue;
            // Gather the statement window: from this line until the first ';' (the await chain end).
            let stmt = '';
            for (let j = i; j < Math.min(lines.length, i + 25); j++) {
                stmt += lines[j] + '\n';
                if (lines[j].includes(';')) break;
            }
            if (WRITE.test(stmt)) continue;       // a write, not a read
            if (PER_SIGNAL.test(stmt)) continue;  // per-signal read, no aggregation
            if (LIVE_FILTER.test(stmt)) continue; // correctly filtered
            violations.push(`${file}:${i + 1} — signal_outcomes read without .eq('is_simulated', false)`);
        }
    }
}

if (violations.length > 0) {
    console.error(`✗ live-outcomes ratchet: ${violations.length} unfiltered signal_outcomes read(s):`);
    for (const v of violations) console.error(`  ${v}`);
    console.error("\nAdd .eq('is_simulated', false) to keep backtest/simulation data out of live");
    console.error('calibration/performance, or — if this is a non-live surface — add the file to ALLOWLIST.');
    process.exit(1);
}

console.log('✓ live-outcomes ratchet: all signal_outcomes reads are live-only (or exempt).');
