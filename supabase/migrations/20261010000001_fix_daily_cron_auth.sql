-- Sentinel — fix daily cron authentication
--
-- The previous cron job (20261010000000_add_daily_cron.sql) called the
-- `sentinel` Edge Function without an Authorization header. After Phase 1
-- security hardening (Audit C3), the function now requires a valid JWT, so
-- the cron call was getting 401'd.
--
-- This migration:
--   1. Unschedules the previous job.
--   2. Re-schedules using net.http_post with an Authorization header.
--   3. Reads the service-role key from supabase_vault at execution time so
--      the secret never lands in the migration file or pg_cron metadata.
--
-- Post-deploy step (REQUIRED — run once after this migration is applied):
--   SELECT vault.create_secret(
--       '<SUPABASE_SERVICE_ROLE_KEY>',
--       'sentinel_service_role_key',
--       'Service role JWT used by invoke-sentinel-daily cron job'
--   );
--
-- If the secret is rotated, update it with vault.update_secret(...); the
-- cron picks up the new value on its next run (no re-deploy needed).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop the prior job if it exists (DO block avoids errors when missing).
DO $$
BEGIN
    PERFORM cron.unschedule('invoke-sentinel-daily');
EXCEPTION WHEN OTHERS THEN
    -- Job didn't exist (e.g., fresh project) — fall through.
    NULL;
END $$;

-- Re-schedule with vault-backed Authorization header.
SELECT cron.schedule(
    'invoke-sentinel-daily',
    '0 8 * * 1-5', -- 08:00 UTC Mon-Fri
    $cron$
    SELECT net.http_post(
        url := 'https://nuccazrwkbmemzhoqnwx.supabase.co/functions/v1/sentinel',
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
