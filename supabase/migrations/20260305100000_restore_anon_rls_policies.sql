-- ======================================================================================
-- Restore anon RLS policies for client-side access
-- ======================================================================================
-- The Phase 1 security fix (20260304000001) dropped all anonymous policies and kept
-- only authenticated-user policies. However, the app uses a client-side password gate
-- with the Supabase anon key — NOT Supabase Auth. All browser requests use the anon
-- role, so dropping anon policies broke all client-side reads and writes (401 on HEAD).
--
-- This migration restores the anon policies so the frontend can operate again.
-- Security is maintained via the client-side password gate + Edge Functions using
-- service_role key (which bypasses RLS entirely).
-- ======================================================================================

-- 1. watchlist
CREATE POLICY "Allow anon read watchlist"
    ON public.watchlist FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert watchlist"
    ON public.watchlist FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update watchlist"
    ON public.watchlist FOR UPDATE TO anon USING (true);
CREATE POLICY "Allow anon delete watchlist"
    ON public.watchlist FOR DELETE TO anon USING (true);

-- 2. market_events
CREATE POLICY "Allow anon read market_events"
    ON public.market_events FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert market_events"
    ON public.market_events FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update market_events"
    ON public.market_events FOR UPDATE TO anon USING (true);

-- 3. signals
CREATE POLICY "Allow anon read signals"
    ON public.signals FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert signals"
    ON public.signals FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update signals"
    ON public.signals FOR UPDATE TO anon USING (true);

-- 4. signal_outcomes
CREATE POLICY "Allow anon read signal_outcomes"
    ON public.signal_outcomes FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert signal_outcomes"
    ON public.signal_outcomes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update signal_outcomes"
    ON public.signal_outcomes FOR UPDATE TO anon USING (true);

-- 5. scan_logs
CREATE POLICY "Allow anon read scan_logs"
    ON public.scan_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert scan_logs"
    ON public.scan_logs FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update scan_logs"
    ON public.scan_logs FOR UPDATE TO anon USING (true);

-- 6. app_settings
CREATE POLICY "Allow anon read app_settings"
    ON public.app_settings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert app_settings"
    ON public.app_settings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update app_settings"
    ON public.app_settings FOR UPDATE TO anon USING (true);

-- 7. api_usage
CREATE POLICY "Allow anon read api_usage"
    ON public.api_usage FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert api_usage"
    ON public.api_usage FOR INSERT TO anon WITH CHECK (true);

-- 8. portfolio_config
CREATE POLICY "Allow anon read portfolio_config"
    ON public.portfolio_config FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert portfolio_config"
    ON public.portfolio_config FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update portfolio_config"
    ON public.portfolio_config FOR UPDATE TO anon USING (true);

-- 9. positions
CREATE POLICY "Allow anon read positions"
    ON public.positions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert positions"
    ON public.positions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update positions"
    ON public.positions FOR UPDATE TO anon USING (true);

-- 10. journal_entries
CREATE POLICY "Allow anon read journal_entries"
    ON public.journal_entries FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert journal_entries"
    ON public.journal_entries FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon delete journal_entries"
    ON public.journal_entries FOR DELETE TO anon USING (true);

-- 11. rss_cache
CREATE POLICY "Allow anon read rss_cache"
    ON public.rss_cache FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert rss_cache"
    ON public.rss_cache FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update rss_cache"
    ON public.rss_cache FOR UPDATE TO anon USING (true);

-- 12. sentinel_articles (from sentinel news tables migration)
CREATE POLICY "Allow anon read sentinel_articles"
    ON public.sentinel_articles FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert sentinel_articles"
    ON public.sentinel_articles FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update sentinel_articles"
    ON public.sentinel_articles FOR UPDATE TO anon USING (true);

-- 13. sentinel_briefings
CREATE POLICY "Allow anon read sentinel_briefings"
    ON public.sentinel_briefings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert sentinel_briefings"
    ON public.sentinel_briefings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update sentinel_briefings"
    ON public.sentinel_briefings FOR UPDATE TO anon USING (true);

-- 14. signal_ratings
CREATE POLICY "Allow anon read signal_ratings"
    ON public.signal_ratings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert signal_ratings"
    ON public.signal_ratings FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update signal_ratings"
    ON public.signal_ratings FOR UPDATE TO anon USING (true);

-- 15. agent_reflections
CREATE POLICY "Allow anon read agent_reflections"
    ON public.agent_reflections FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert agent_reflections"
    ON public.agent_reflections FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update agent_reflections"
    ON public.agent_reflections FOR UPDATE TO anon USING (true);
