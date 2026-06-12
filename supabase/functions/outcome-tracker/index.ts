/**
 * Sentinel — Outcome Tracker (server-side, path-aware)
 *
 * Runs on a server cron (and is also invoked by the client on load for
 * immediacy) so the audit trail — the moat — updates even when no browser tab
 * is open. For each pending outcome it reconstructs the true daily price path
 * and settles checkpoints, stop/target hits, and extremes via `measureOutcome`.
 *
 * Replaces the previous client-only, spot-price-sampled tracker, which missed
 * intraday stop/target touches and mis-measured max gain/drawdown — biasing
 * every win/loss label the learning loop trains on.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { measureOutcome, type Bar, type SignalLevels } from './measure.ts';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status,
        });

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, serviceKey);

        // ── 1. Pending outcomes ───────────────────────────────────────────
        const { data: outcomes, error } = await supabase
            .from('signal_outcomes')
            .select('*')
            .eq('outcome', 'pending');

        if (error) return json({ success: false, error: error.message }, 500);
        if (!outcomes || outcomes.length === 0) {
            const overdue = await markOverdue(supabase);
            return json({ success: true, updated: 0, completed: 0, overdue });
        }

        // ── 2. Parent signal levels (batched) ─────────────────────────────
        const signalIds = [...new Set(outcomes.map((o) => o.signal_id).filter(Boolean))];
        const levelsById = new Map<string, SignalLevels>();
        if (signalIds.length > 0) {
            const { data: signals } = await supabase
                .from('signals')
                .select('id, stop_loss, target_price, signal_type')
                .in('id', signalIds);
            for (const s of signals ?? []) {
                levelsById.set(s.id, {
                    stop_loss: typeof s.stop_loss === 'number' ? s.stop_loss : null,
                    target_price: typeof s.target_price === 'number' ? s.target_price : null,
                    is_short: typeof s.signal_type === 'string' && s.signal_type.includes('short'),
                });
            }
        }

        // ── 3. Daily bars, one fetch per unique ticker ────────────────────
        const barsByTicker = new Map<string, Bar[]>();
        const uniqueTickers = [...new Set(outcomes.map((o) => o.ticker))];
        for (const ticker of uniqueTickers) {
            barsByTicker.set(ticker, await fetchBars(supabase, ticker));
        }

        // ── 4. Measure + persist ──────────────────────────────────────────
        const now = Date.now();
        let updated = 0;
        let completed = 0;

        for (const outcome of outcomes) {
            const bars = barsByTicker.get(outcome.ticker) ?? [];
            if (bars.length === 0) continue;

            const levels = outcome.signal_id ? levelsById.get(outcome.signal_id) ?? null : null;
            const { updates, isComplete } = measureOutcome(outcome, levels, bars, now);

            if (Object.keys(updates).length === 0) continue;

            const { error: updErr } = await supabase
                .from('signal_outcomes')
                .update(updates)
                .eq('id', outcome.id);
            if (updErr) continue;

            updated++;
            if (isComplete) {
                completed++;
                if (outcome.signal_id) {
                    await supabase
                        .from('signals')
                        .update({ outcome_status: 'outcome_logged' })
                        .eq('id', outcome.signal_id);
                }
            }
        }

        const overdue = await markOverdue(supabase);
        return json({ success: true, updated, completed, overdue });
    } catch (err) {
        return json({ success: false, error: String(err) }, 500);
    }
});

/** Fetch 2y of daily OHLC bars via the market-data proxy. */
async function fetchBars(supabase: ReturnType<typeof createClient>, ticker: string): Promise<Bar[]> {
    try {
        const { data, error } = await supabase.functions.invoke('proxy-market-data', {
            body: { endpoint: 'historical', ticker: ticker.toUpperCase() },
        });
        if (error || !data?.success || !Array.isArray(data.data)) return [];
        return (data.data as Bar[]).filter((b) => b && b.close > 0 && b.date);
    } catch {
        return [];
    }
}

/** Mark signals whose outcome review window has passed as overdue. */
async function markOverdue(supabase: ReturnType<typeof createClient>): Promise<number> {
    const { data, error } = await supabase
        .from('signals')
        .update({ outcome_status: 'outcome_overdue' })
        .eq('outcome_status', 'pending_outcome')
        .lt('outcome_due_at', new Date().toISOString())
        .not('outcome_due_at', 'is', null)
        .select('id');
    if (error) return 0;
    return data?.length ?? 0;
}
