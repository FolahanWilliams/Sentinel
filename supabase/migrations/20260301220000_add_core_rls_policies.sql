-- ======================================================================================
-- SENTINEL: RLS Policies for Core Tables
-- ======================================================================================
-- The initial migration enabled RLS on all 11 core tables but created no policies,
-- which silently blocks all client-side (anon key) reads and writes.
-- This migration adds permissive policies so the browser client can operate.
--
-- Security model: The app uses a client-side password gate (not Supabase Auth),
-- so all authenticated access comes through the anon key.
-- Edge Functions use the service_role key which bypasses RLS entirely.
-- ======================================================================================

-- 1. watchlist
CREATE POLICY "Allow public read watchlist"
    ON public.watchlist FOR SELECT USING (true);
CREATE POLICY "Allow public insert watchlist"
    ON public.watchlist FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update watchlist"
    ON public.watchlist FOR UPDATE USING (true);
CREATE POLICY "Allow public delete watchlist"
    ON public.watchlist FOR DELETE USING (true);

-- 2. market_events
CREATE POLICY "Allow public read market_events"
    ON public.market_events FOR SELECT USING (true);
CREATE POLICY "Allow public insert market_events"
    ON public.market_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update market_events"
    ON public.market_events FOR UPDATE USING (true);

-- 3. signals
CREATE POLICY "Allow public read signals"
    ON public.signals FOR SELECT USING (true);
CREATE POLICY "Allow public insert signals"
    ON public.signals FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update signals"
    ON public.signals FOR UPDATE USING (true);

-- 4. signal_outcomes
CREATE POLICY "Allow public read signal_outcomes"
    ON public.signal_outcomes FOR SELECT USING (true);
CREATE POLICY "Allow public insert signal_outcomes"
    ON public.signal_outcomes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update signal_outcomes"
    ON public.signal_outcomes FOR UPDATE USING (true);

-- 5. scan_logs
CREATE POLICY "Allow public read scan_logs"
    ON public.scan_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert scan_logs"
    ON public.scan_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update scan_logs"
    ON public.scan_logs FOR UPDATE USING (true);

-- 6. app_settings
CREATE POLICY "Allow public read app_settings"
    ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Allow public insert app_settings"
    ON public.app_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update app_settings"
    ON public.app_settings FOR UPDATE USING (true);

-- 7. api_usage
CREATE POLICY "Allow public read api_usage"
    ON public.api_usage FOR SELECT USING (true);
CREATE POLICY "Allow public insert api_usage"
    ON public.api_usage FOR INSERT WITH CHECK (true);

-- 8. portfolio_config
CREATE POLICY "Allow public read portfolio_config"
    ON public.portfolio_config FOR SELECT USING (true);
CREATE POLICY "Allow public insert portfolio_config"
    ON public.portfolio_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update portfolio_config"
    ON public.portfolio_config FOR UPDATE USING (true);

-- 9. positions
CREATE POLICY "Allow public read positions"
    ON public.positions FOR SELECT USING (true);
CREATE POLICY "Allow public insert positions"
    ON public.positions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update positions"
    ON public.positions FOR UPDATE USING (true);

-- 10. journal_entries
CREATE POLICY "Allow public read journal_entries"
    ON public.journal_entries FOR SELECT USING (true);
CREATE POLICY "Allow public insert journal_entries"
    ON public.journal_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete journal_entries"
    ON public.journal_entries FOR DELETE USING (true);

-- 11. rss_cache
CREATE POLICY "Allow public read rss_cache"
    ON public.rss_cache FOR SELECT USING (true);
CREATE POLICY "Allow public insert rss_cache"
    ON public.rss_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update rss_cache"
    ON public.rss_cache FOR UPDATE USING (true);
