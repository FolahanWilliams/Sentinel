-- ======================================================================================
-- PHASE 1 FIX: Lock down RLS policies (Audit C1)
-- ======================================================================================
-- The previous migration (20260301220000) created wide-open anonymous policies
-- with USING(true) on all 11 core tables. This migration drops those anonymous
-- policies and keeps only the authenticated-user policies from 20260301224200.
--
-- After this migration:
--   - Anonymous (anon key) users: NO access to any table
--   - Authenticated users: Full access via the "Enable ALL for authenticated users" policies
--   - Service role (Edge Functions): Bypasses RLS entirely (unchanged)
-- ======================================================================================

-- 1. watchlist
DROP POLICY IF EXISTS "Allow public read watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "Allow public insert watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "Allow public update watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "Allow public delete watchlist" ON public.watchlist;

-- 2. market_events
DROP POLICY IF EXISTS "Allow public read market_events" ON public.market_events;
DROP POLICY IF EXISTS "Allow public insert market_events" ON public.market_events;
DROP POLICY IF EXISTS "Allow public update market_events" ON public.market_events;

-- 3. signals
DROP POLICY IF EXISTS "Allow public read signals" ON public.signals;
DROP POLICY IF EXISTS "Allow public insert signals" ON public.signals;
DROP POLICY IF EXISTS "Allow public update signals" ON public.signals;

-- 4. signal_outcomes
DROP POLICY IF EXISTS "Allow public read signal_outcomes" ON public.signal_outcomes;
DROP POLICY IF EXISTS "Allow public insert signal_outcomes" ON public.signal_outcomes;
DROP POLICY IF EXISTS "Allow public update signal_outcomes" ON public.signal_outcomes;

-- 5. scan_logs
DROP POLICY IF EXISTS "Allow public read scan_logs" ON public.scan_logs;
DROP POLICY IF EXISTS "Allow public insert scan_logs" ON public.scan_logs;
DROP POLICY IF EXISTS "Allow public update scan_logs" ON public.scan_logs;

-- 6. app_settings
DROP POLICY IF EXISTS "Allow public read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow public insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow public update app_settings" ON public.app_settings;

-- 7. api_usage
DROP POLICY IF EXISTS "Allow public read api_usage" ON public.api_usage;
DROP POLICY IF EXISTS "Allow public insert api_usage" ON public.api_usage;

-- 8. portfolio_config
DROP POLICY IF EXISTS "Allow public read portfolio_config" ON public.portfolio_config;
DROP POLICY IF EXISTS "Allow public insert portfolio_config" ON public.portfolio_config;
DROP POLICY IF EXISTS "Allow public update portfolio_config" ON public.portfolio_config;

-- 9. positions
DROP POLICY IF EXISTS "Allow public read positions" ON public.positions;
DROP POLICY IF EXISTS "Allow public insert positions" ON public.positions;
DROP POLICY IF EXISTS "Allow public update positions" ON public.positions;

-- 10. journal_entries
DROP POLICY IF EXISTS "Allow public read journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Allow public insert journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Allow public delete journal_entries" ON public.journal_entries;

-- 11. rss_cache
DROP POLICY IF EXISTS "Allow public read rss_cache" ON public.rss_cache;
DROP POLICY IF EXISTS "Allow public insert rss_cache" ON public.rss_cache;
DROP POLICY IF EXISTS "Allow public update rss_cache" ON public.rss_cache;

-- Verify: The remaining policies should be the "Enable ALL for authenticated users" ones
-- from migration 20260301224200_enable_auth_rls.sql
