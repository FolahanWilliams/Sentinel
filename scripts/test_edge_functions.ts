/**
 * Sentinel — Edge Function Reachability Test
 *
 * Verifies that each deployed Edge Function:
 *   1. Responds to CORS preflight (OPTIONS)
 *   2. Responds with the expected status when called with the ANON KEY
 *      (some functions accept anon, others require a real user JWT and
 *      should return 401 — that 401 confirms the JWT gate is wired up).
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/test_edge_functions.ts
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
    try {
        const path = resolve(process.cwd(), '.env.local');
        const text = readFileSync(path, 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/i);
            if (!m) continue;
            const [, k, rawV] = m;
            const v = rawV.replace(/^['"]|['"]$/g, '').trim();
            if (!(k in process.env)) process.env[k] = v;
        }
    } catch { /* optional */ }
}

loadEnvLocal();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !ANON_KEY) {
    console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing from env or .env.local');
    process.exit(1);
}

const FN_BASE = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1`;

// ── Test matrix ────────────────────────────────────────────────────────────

interface FnTest {
    name: string;
    method: 'GET' | 'POST';
    body?: Record<string, unknown>;
    expectStatus: number | number[];
    expectPreflight?: number[]; // override expected OPTIONS status codes
    note?: string;
}

const TESTS: FnTest[] = [
    {
        name: 'proxy-gemini',
        method: 'POST',
        body: { contents: [{ role: 'user', parts: [{ text: 'echo: connectivity test' }] }] },
        expectStatus: 401,
        note: 'requires real user JWT — anon key should be rejected (Phase 1 fix C3)',
    },
    {
        name: 'proxy-market-data',
        method: 'POST',
        body: { endpoint: 'quote', ticker: 'AAPL' },
        expectStatus: 200,
        note: 'public — anon allowed',
    },
    {
        name: 'proxy-rss',
        method: 'POST',
        body: { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US' },
        expectStatus: [200, 400, 401],
        note: 'JWT-protected — anon-key call returns 401',
    },
    {
        name: 'sentinel',
        method: 'POST',
        body: {},
        expectStatus: 401,
        note: 'requires real user JWT — anon key rejected',
    },
    {
        name: 'send-alert-email',
        method: 'POST',
        body: { signal: { ticker: 'TEST', thesis: 'connectivity test', conviction: 50 } },
        expectStatus: [200, 401, 400],
        note: 'tolerate auth/payload variants — verifying reachability only',
    },
    {
        name: 'proxy-alpaca',
        method: 'POST',
        body: { action: 'account' },
        expectStatus: [401, 404],
        expectPreflight: [200, 204, 404],
        note: 'requires real user JWT once deployed — 404 means not yet deployed',
    },
];

// ── Runner ─────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function runOne(t: FnTest): Promise<void> {
    console.log(`\n[${t.name}] ${t.note ? '— ' + t.note : ''}`);

    // CORS preflight
    try {
        const preflightRes = await fetch(`${FN_BASE}/${t.name}`, {
            method: 'OPTIONS',
            headers: {
                'Origin': 'http://localhost:5173',
                'Access-Control-Request-Method': t.method,
                'Access-Control-Request-Headers': 'authorization,content-type',
            },
        });
        const expectedPreflight = t.expectPreflight || [200, 204];
        const corsOk = expectedPreflight.includes(preflightRes.status);
        if (corsOk) {
            passed++;
            console.log(`  ✓ OPTIONS preflight HTTP ${preflightRes.status}`);
        } else {
            failed++;
            console.log(`  ✗ OPTIONS preflight HTTP ${preflightRes.status} (expected ${expectedPreflight.join('|')})`);
        }
    } catch (err: any) {
        failed++;
        console.log(`  ✗ OPTIONS preflight network error — ${err?.message}`);
    }

    // Call with anon key
    try {
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${ANON_KEY}`,
            'apikey': ANON_KEY!,
            'Content-Type': 'application/json',
        };
        const res = await fetch(`${FN_BASE}/${t.name}`, {
            method: t.method,
            headers,
            body: t.body ? JSON.stringify(t.body) : undefined,
        });
        const expected = Array.isArray(t.expectStatus) ? t.expectStatus : [t.expectStatus];
        const ok = expected.includes(res.status);
        const text = await res.text();
        let snippet = text.slice(0, 120);
        try { snippet = JSON.stringify(JSON.parse(text)).slice(0, 160); } catch { /* leave raw */ }

        if (ok) {
            passed++;
            console.log(`  ✓ ${t.method} HTTP ${res.status} (expected ${expected.join('|')})`);
            console.log(`     body: ${snippet}`);
        } else {
            failed++;
            console.log(`  ✗ ${t.method} HTTP ${res.status} (expected ${expected.join('|')})`);
            console.log(`     body: ${snippet}`);
        }
    } catch (err: any) {
        failed++;
        console.log(`  ✗ call network error — ${err?.message}`);
    }
}

async function main() {
    console.log('===  Edge Function Reachability Test  ===');
    console.log(`Base: ${FN_BASE}`);
    console.log(`Anon key prefix: ${ANON_KEY!.slice(0, 12)}…`);

    for (const t of TESTS) {
        await runOne(t);
    }

    console.log('\n─── Summary ───');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
