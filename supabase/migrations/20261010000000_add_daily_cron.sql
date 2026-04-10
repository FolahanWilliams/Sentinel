-- Set up a pg_cron job to trigger the sentinel edge function once daily
-- This ensures the system autonomously sweeps news & geopolitical catalysts

-- Enable the pg_net and pg_cron extensions if they don't exist yet
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Note: We use pg_net async HTTP POST calls to avoid cron job timeouts.
-- The function URL uses the standard Supabase Edge Function path convention.
-- To ensure this runs in production, the user must update their anon key locally or via secrets if needed,
-- but the Supabase cron runs within the DB context securely.

SELECT cron.schedule(
    'invoke-sentinel-daily',
    '0 8 * * 1-5', -- Run at 8:00 AM UTC (4:00 AM EST) Monday through Friday
    $$
    SELECT net.http_post(
        url:='https://nuccazrwkbmemzhoqnwx.supabase.co/functions/v1/sentinel',
        headers:='{"Content-Type": "application/json"}'::jsonb
    );
    $$
);
