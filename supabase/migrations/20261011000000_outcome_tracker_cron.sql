-- Sentinel — schedule the path-aware outcome tracker server-side
--
-- The audit trail (signal outcomes at 1d/5d/10d/30d, stop/target hits) is the
-- product's moat, but it previously only updated while a browser tab was open
-- (client-side setInterval). This schedules the `outcome-tracker` Edge Function
-- so the record updates reliably without anyone watching.
--
-- Runs at 22:30 UTC Mon–Fri — after the US cash close (so the day's daily bar
-- is finalized). Because the function reconstructs the full price path from
-- daily bars, the exact run time does not affect measurement accuracy; it only
-- affects how promptly a completed outcome is recorded.
--
-- Auth: reuses the vault secret `sentinel_service_role_key` created in
-- 20261010000001_fix_daily_cron_auth.sql. No new post-deploy step required.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Drop the prior job if it exists (DO block avoids errors when missing).
DO $$
BEGIN
    PERFORM cron.unschedule('invoke-outcome-tracker-daily');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'invoke-outcome-tracker-daily',
    '30 22 * * 1-5', -- 22:30 UTC Mon-Fri, after the US cash close
    $cron$
    SELECT net.http_post(
        url := 'https://nuccazrwkbmemzhoqnwx.supabase.co/functions/v1/outcome-tracker',
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
