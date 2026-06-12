#!/usr/bin/env node
/**
 * Silent-catch ratchet (CLAUDE.md → Lint Ratchets).
 *
 * Fails when the number of silently-swallowed promise rejections exceeds a
 * baseline. A "silent catch" is `.catch(<arg> => <trivial>)` where the body is
 * null/undefined/{}/[]/false/true/0/'' (or an empty block) — the error vanishes
 * with no log and no context. These are a real bug class on signal-delivery,
 * audit-trail-write, post-mortem, and learning-feedback paths.
 *
 * Adding a new silent catch requires one of:
 *   (a) replace an existing one,
 *   (b) upgrade it to `.catch(err => log.warn('context:', err))`, or
 *   (c) bump BASELINE below WITH an inline comment naming the exception class
 *       (localStorage / JSON.parse / cache-cleanup / req.json() body parse /
 *        schema-drift-tolerant), and update the trajectory line in CLAUDE.md.
 *
 * Usage: node scripts/lint-silent-catches.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Baseline = count of silent catches present when the ratchet was introduced.
// Ratchet down over time; never up without naming the exception class.
// Current 24 are mostly fire-and-forget browser-notification / best-effort
// client outcome+exposure triggers (real work is server-side) + 1 req.json()
// body parse. Ratchet down by adding context logs or inline exception comments.
const BASELINE = 24;

const ROOTS = ['src', join('supabase', 'functions')];
const EXT = /\.(ts|tsx)$/;

// `.catch( (args) => trivial )` or `.catch( arg => trivial )`, trivial body =
// null | undefined | {} | [] | ({}) | false | true | 0 | '' | "" | `` | { }
const SILENT = /\.catch\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:null|undefined|\{\s*\}|\[\s*\]|\(\s*\{\s*\}\s*\)|false|true|0|''|""|``)\s*\)/g;

/** @param {string} dir @param {string[]} out */
function walk(dir, out) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
        if (name === 'node_modules' || name.startsWith('.')) continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) walk(full, out);
        else if (EXT.test(name)) out.push(full);
    }
}

const files = [];
for (const root of ROOTS) walk(root, files);

const hits = [];
for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        SILENT.lastIndex = 0;
        if (SILENT.test(lines[i])) hits.push(`${file}:${i + 1}: ${lines[i].trim()}`);
    }
}

if (hits.length) {
    console.log(`Silent catches found (${hits.length}):`);
    for (const h of hits) console.log('  ' + h);
} else {
    console.log('No silent catches found.');
}

if (hits.length > BASELINE) {
    console.error(`\n✖ Silent-catch ratchet: ${hits.length} > baseline ${BASELINE}.`);
    console.error('  Upgrade to `.catch(err => log.warn(...))`, or bump BASELINE with a reason (see header).');
    process.exit(1);
}
console.log(`\n✓ Silent-catch ratchet: ${hits.length} ≤ baseline ${BASELINE}.`);
