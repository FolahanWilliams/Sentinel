/**
 * Sentinel — Alpaca Paper-Trading Connectivity Test
 *
 * Verifies that the Alpaca paper-trading credentials in .env.local can:
 *   1. Reach GET /v2/account
 *   2. Submit a tiny bracket test order for 1 share of AAPL
 *
 * This test calls the Alpaca API DIRECTLY using the credentials from
 * .env.local. It is intended for one-time verification BEFORE moving keys
 * server-side into the proxy-alpaca Edge Function. After the migration, use
 * the proxy via test_edge_functions.ts instead.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/test_alpaca_connectivity.ts
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local manually since dotenv defaults to .env
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
    } catch {
        // Fine — .env.local optional, fall through to existing env vars
    }
}

loadEnvLocal();

const ALPACA_ENDPOINT = 'https://paper-api.alpaca.markets/v2';

const apiKey = process.env.ALPACA_API_KEY || process.env.VITE_ALPACA_API_KEY;
const secretKey = process.env.ALPACA_SECRET_KEY || process.env.VITE_ALPACA_SECRET_KEY;

if (!apiKey || !secretKey) {
    console.error('ALPACA_API_KEY / ALPACA_SECRET_KEY (or VITE_ variants) not found in env or .env.local');
    process.exit(1);
}

function headers(): Record<string, string> {
    return {
        'APCA-API-KEY-ID': apiKey!,
        'APCA-API-SECRET-KEY': secretKey!,
        'Content-Type': 'application/json',
    };
}

let passed = 0;
let failed = 0;

function record(label: string, ok: boolean, detail?: string) {
    if (ok) {
        passed++;
        console.log(`  ✓ ${label}`);
    } else {
        failed++;
        console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    }
}

// ── Test 1: GET /account ───────────────────────────────────────────────────

async function testAccount(): Promise<boolean> {
    console.log('\n[Test 1] GET /v2/account');
    try {
        const res = await fetch(`${ALPACA_ENDPOINT}/account`, { headers: headers() });
        const ok = res.ok;
        record(`HTTP ${res.status}`, ok, ok ? undefined : await res.text().catch(() => ''));
        if (!ok) return false;

        const data = await res.json() as Record<string, any>;
        record('has account_number', typeof data.account_number === 'string');
        record('has buying_power', typeof data.buying_power === 'string' && Number(data.buying_power) >= 0);
        record('paper trading flag', data.account_blocked === false);
        console.log(`     buying_power=$${data.buying_power} status=${data.status} pattern_day_trader=${data.pattern_day_trader}`);
        return true;
    } catch (err: any) {
        record('account request', false, err?.message);
        return false;
    }
}

// ── Test 2: Submit and cancel a tiny test order ────────────────────────────

async function testOrderRoundtrip(): Promise<void> {
    console.log('\n[Test 2] Submit + cancel bracket order (1 share AAPL)');

    // Probe current AAPL price so the limit doesn't immediately fill
    let limitPrice = 100; // safe low default for paper account
    try {
        const quoteRes = await fetch(
            'https://query2.finance.yahoo.com/v7/finance/quote?symbols=AAPL',
            { headers: { 'User-Agent': 'Mozilla/5.0' } },
        );
        if (quoteRes.ok) {
            const q = await quoteRes.json();
            const p = q?.quoteResponse?.result?.[0]?.regularMarketPrice;
            if (typeof p === 'number' && p > 0) {
                limitPrice = Math.round(p * 0.5 * 100) / 100; // far-below-market limit (won't fill)
            }
        }
    } catch { /* fall through with default */ }

    const payload = {
        symbol: 'AAPL',
        qty: 1,
        side: 'buy',
        type: 'limit',
        time_in_force: 'gtc',
        limit_price: limitPrice,
        extended_hours: false,
        order_class: 'bracket',
        take_profit: { limit_price: Number((limitPrice * 1.2).toFixed(2)) },
        stop_loss: { stop_price: Number((limitPrice * 0.8).toFixed(2)) },
    };

    let orderId: string | null = null;
    try {
        const res = await fetch(`${ALPACA_ENDPOINT}/orders`, {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify(payload),
        });
        const ok = res.ok;
        const body = await res.json().catch(() => ({}));
        record(`HTTP ${res.status}`, ok, ok ? undefined : JSON.stringify(body).slice(0, 200));
        if (!ok) return;

        record('response has id', typeof body.id === 'string');
        record('response symbol matches', body.symbol === 'AAPL');
        record('response qty matches', body.qty === '1' || body.qty === 1);
        record('response order_class=bracket', body.order_class === 'bracket');
        orderId = body.id;
        console.log(`     order_id=${orderId} status=${body.status}`);
    } catch (err: any) {
        record('order submission', false, err?.message);
    }

    // Clean up
    if (orderId) {
        try {
            const cancelRes = await fetch(`${ALPACA_ENDPOINT}/orders/${orderId}`, {
                method: 'DELETE',
                headers: headers(),
            });
            record(`cancel cleanup HTTP ${cancelRes.status}`, cancelRes.status === 204 || cancelRes.ok);
        } catch (err: any) {
            record('cancel cleanup', false, err?.message);
        }
    }
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function main() {
    console.log('===  Alpaca Paper-Trading Connectivity Test  ===');
    console.log(`API key prefix: ${apiKey!.slice(0, 6)}…`);

    const accountOk = await testAccount();
    if (!accountOk) {
        console.log('\nSkipping order roundtrip — account fetch failed (auth likely broken).');
        console.log(`\nPassed: ${passed}  Failed: ${failed}`);
        process.exit(1);
    }

    await testOrderRoundtrip();

    console.log('\n─── Summary ───');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
