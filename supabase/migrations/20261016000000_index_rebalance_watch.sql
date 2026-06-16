-- Sentinel — Index Rebalance Watch
--
-- Tracks announced index additions/removals (Nasdaq-100, S&P 500/400/600, etc.)
-- with their effective dates, so Sentinel can anticipate the forced index-fund
-- flow (the "index effect") and produce an entry plan BEFORE the effective date
-- instead of reacting after. Example: Nebius added to the Nasdaq-100, effective
-- the 22nd — Sentinel should know that, research it, and recommend whether to
-- enter now and at what level.
--
-- Discovery is populated by the `index-rebalance` Edge Function (grounded
-- search), scheduled daily. Per-event analysis (entry plan / recommendation) is
-- computed from live quote + TA and persisted into `analysis`.

CREATE TABLE IF NOT EXISTS public.index_rebalance_events (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker            TEXT NOT NULL,
    company_name      TEXT,
    index_name        TEXT NOT NULL,            -- e.g. 'NASDAQ-100', 'S&P 500'
    action            TEXT NOT NULL DEFAULT 'add' CHECK (action IN ('add','remove')),
    announcement_date DATE,
    effective_date    DATE,
    source_url        TEXT,
    rationale         TEXT,                     -- why (e.g. 'replacing ACME after acquisition')
    status            TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','effective','passed')),
    analysis          JSONB,                    -- Sentinel's research: thesis, entry plan, recommendation
    signal_id         UUID,                     -- optional link to a generated signal
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ticker, index_name, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_index_rebalance_effective ON public.index_rebalance_events (effective_date);
CREATE INDEX IF NOT EXISTS idx_index_rebalance_status ON public.index_rebalance_events (status);

ALTER TABLE public.index_rebalance_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'index_rebalance_events' AND policyname = 'index_rebalance_read') THEN
        CREATE POLICY index_rebalance_read ON public.index_rebalance_events FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'index_rebalance_events' AND policyname = 'index_rebalance_write') THEN
        CREATE POLICY index_rebalance_write ON public.index_rebalance_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Keep updated_at fresh on analysis writes.
CREATE OR REPLACE FUNCTION public.touch_index_rebalance_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_index_rebalance_updated_at ON public.index_rebalance_events;
CREATE TRIGGER trg_index_rebalance_updated_at BEFORE UPDATE ON public.index_rebalance_events
    FOR EACH ROW EXECUTE FUNCTION public.touch_index_rebalance_updated_at();

-- Daily discovery cron (07:00 UTC) — invokes the index-rebalance Edge Function.
-- Reuses the vault secret `sentinel_service_role_key` (created in
-- 20261010000001_fix_daily_cron_auth.sql). No new post-deploy step required.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
    PERFORM cron.unschedule('invoke-index-rebalance-daily');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'invoke-index-rebalance-daily',
    '0 7 * * *',
    $cron$
    SELECT net.http_post(
        url := 'https://nuccazrwkbmemzhoqnwx.supabase.co/functions/v1/index-rebalance',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'sentinel_service_role_key'
                LIMIT 1
            )
        ),
        body := '{}'::jsonb
    );
    $cron$
);
