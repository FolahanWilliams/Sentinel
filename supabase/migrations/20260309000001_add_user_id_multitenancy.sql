-- ======================================================================================
-- MULTITENANCY: Add user_id to user-scoped tables for per-user data isolation
-- ======================================================================================
-- Previously all data was shared globally. This migration adds user_id columns
-- (with DEFAULT auth.uid()) so each authenticated user gets their own data silo.
-- RLS policies are updated to enforce user_id = auth.uid() filtering.
--
-- Tables receiving user_id (user-scoped):
--   watchlist, signals, signal_outcomes, scan_logs, app_settings, portfolio_config,
--   positions, journal_entries, signal_ratings, chat_conversations, agent_reflections,
--   signal_lessons
--
-- Tables remaining global (shared data):
--   market_events, rss_cache, sentinel_articles, sentinel_briefings, api_usage
-- ======================================================================================

-- ── 1. Drop FK constraints that reference watchlist(ticker) ────────────────────
-- Because watchlist.ticker will no longer be globally unique (each user can watch
-- the same ticker), the FK on ticker alone is invalid. We drop these FKs.
-- The ticker column remains as a plain string — no referential integrity needed.

ALTER TABLE public.signals DROP CONSTRAINT IF EXISTS signals_ticker_fkey;
ALTER TABLE public.market_events DROP CONSTRAINT IF EXISTS market_events_ticker_fkey;

-- ── 2. Add user_id column to all user-scoped tables ───────────────────────────
-- DEFAULT auth.uid() auto-fills the column on INSERT without client code changes.

ALTER TABLE public.watchlist ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.signals ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.signal_outcomes ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.scan_logs ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.portfolio_config ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.signal_ratings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.chat_conversations ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.agent_reflections ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.signal_lessons ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;

-- ── 3. Handle app_settings PK change ──────────────────────────────────────────
-- app_settings had PK on (key). We need (key, user_id) to allow per-user settings.
-- Add a surrogate id column and switch the PK, then add a unique index.

ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
ALTER TABLE public.app_settings ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS app_settings_key_user ON public.app_settings(key, user_id);

-- ── 4. Update unique constraints ──────────────────────────────────────────────

-- watchlist: UNIQUE(ticker) → UNIQUE(ticker, user_id) so different users can watch same ticker
ALTER TABLE public.watchlist DROP CONSTRAINT IF EXISTS watchlist_ticker_key;
DROP INDEX IF EXISTS watchlist_ticker_key;
CREATE UNIQUE INDEX IF NOT EXISTS watchlist_ticker_user ON public.watchlist(ticker, user_id) WHERE user_id IS NOT NULL;

-- portfolio_config: global singleton → per-user singleton
DROP INDEX IF EXISTS single_portfolio_config;
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_config_per_user ON public.portfolio_config(user_id) WHERE user_id IS NOT NULL;

-- signal_ratings: UNIQUE(signal_id) → UNIQUE(signal_id, user_id) so each user rates independently
ALTER TABLE public.signal_ratings DROP CONSTRAINT IF EXISTS signal_ratings_signal_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS signal_ratings_signal_user ON public.signal_ratings(signal_id, user_id) WHERE user_id IS NOT NULL;

-- ── 5. Add indexes for user_id lookups ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON public.watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_signals_user ON public.signals(user_id);
CREATE INDEX IF NOT EXISTS idx_positions_user ON public.positions(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_config_user ON public.portfolio_config(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_user ON public.journal_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_logs_user ON public.scan_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON public.chat_conversations(user_id);

-- ── 6. Drop ALL old RLS policies for user-scoped tables ───────────────────────
-- We'll replace them with user_id-filtered policies.

-- Drop anon policies (from 20260305100000_restore_anon_rls_policies.sql)
DROP POLICY IF EXISTS "Allow anon read watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "Allow anon insert watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "Allow anon update watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "Allow anon delete watchlist" ON public.watchlist;

DROP POLICY IF EXISTS "Allow anon read signals" ON public.signals;
DROP POLICY IF EXISTS "Allow anon insert signals" ON public.signals;
DROP POLICY IF EXISTS "Allow anon update signals" ON public.signals;

DROP POLICY IF EXISTS "Allow anon read signal_outcomes" ON public.signal_outcomes;
DROP POLICY IF EXISTS "Allow anon insert signal_outcomes" ON public.signal_outcomes;
DROP POLICY IF EXISTS "Allow anon update signal_outcomes" ON public.signal_outcomes;

DROP POLICY IF EXISTS "Allow anon read scan_logs" ON public.scan_logs;
DROP POLICY IF EXISTS "Allow anon insert scan_logs" ON public.scan_logs;
DROP POLICY IF EXISTS "Allow anon update scan_logs" ON public.scan_logs;

DROP POLICY IF EXISTS "Allow anon read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow anon insert app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Allow anon update app_settings" ON public.app_settings;

DROP POLICY IF EXISTS "Allow anon read portfolio_config" ON public.portfolio_config;
DROP POLICY IF EXISTS "Allow anon insert portfolio_config" ON public.portfolio_config;
DROP POLICY IF EXISTS "Allow anon update portfolio_config" ON public.portfolio_config;

DROP POLICY IF EXISTS "Allow anon read positions" ON public.positions;
DROP POLICY IF EXISTS "Allow anon insert positions" ON public.positions;
DROP POLICY IF EXISTS "Allow anon update positions" ON public.positions;

DROP POLICY IF EXISTS "Allow anon read journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Allow anon insert journal_entries" ON public.journal_entries;
DROP POLICY IF EXISTS "Allow anon delete journal_entries" ON public.journal_entries;

DROP POLICY IF EXISTS "Allow anon read signal_ratings" ON public.signal_ratings;
DROP POLICY IF EXISTS "Allow anon insert signal_ratings" ON public.signal_ratings;
DROP POLICY IF EXISTS "Allow anon update signal_ratings" ON public.signal_ratings;

DROP POLICY IF EXISTS "Allow anon read agent_reflections" ON public.agent_reflections;
DROP POLICY IF EXISTS "Allow anon insert agent_reflections" ON public.agent_reflections;
DROP POLICY IF EXISTS "Allow anon update agent_reflections" ON public.agent_reflections;

DROP POLICY IF EXISTS "Allow anon full access to chat_conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "anon_read_signal_lessons" ON public.signal_lessons;

-- Drop old public policies (from signal_ratings v2 migration)
DROP POLICY IF EXISTS "Allow public read access" ON public.signal_ratings;
DROP POLICY IF EXISTS "Allow public insert access" ON public.signal_ratings;

-- Drop old authenticated policies (from 20260301224200, used USING(true))
DROP POLICY IF EXISTS "Enable ALL for authenticated users on watchlist" ON public.watchlist;
DROP POLICY IF EXISTS "Enable ALL for authenticated users on signals" ON public.signals;
DROP POLICY IF EXISTS "Enable ALL for authenticated users on signal_outcomes" ON public.signal_outcomes;
DROP POLICY IF EXISTS "Enable ALL for authenticated users on scan_logs" ON public.scan_logs;
DROP POLICY IF EXISTS "Enable ALL for authenticated users on app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Enable ALL for authenticated users on portfolio_config" ON public.portfolio_config;
DROP POLICY IF EXISTS "Enable ALL for authenticated users on positions" ON public.positions;
DROP POLICY IF EXISTS "Enable ALL for authenticated users on journal_entries" ON public.journal_entries;

-- Drop service_role policy on signal_lessons (it bypasses RLS anyway)
DROP POLICY IF EXISTS "service_role_all_signal_lessons" ON public.signal_lessons;

-- ── 7. Create new authenticated RLS policies with user_id filtering ───────────

-- watchlist
CREATE POLICY "user_select_watchlist" ON public.watchlist FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_watchlist" ON public.watchlist FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_watchlist" ON public.watchlist FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_delete_watchlist" ON public.watchlist FOR DELETE TO authenticated USING (user_id = auth.uid());

-- signals
CREATE POLICY "user_select_signals" ON public.signals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_signals" ON public.signals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_signals" ON public.signals FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- signal_outcomes
CREATE POLICY "user_select_signal_outcomes" ON public.signal_outcomes FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_signal_outcomes" ON public.signal_outcomes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_signal_outcomes" ON public.signal_outcomes FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- scan_logs
CREATE POLICY "user_select_scan_logs" ON public.scan_logs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_scan_logs" ON public.scan_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_scan_logs" ON public.scan_logs FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- app_settings
CREATE POLICY "user_select_app_settings" ON public.app_settings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_app_settings" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_app_settings" ON public.app_settings FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- portfolio_config
CREATE POLICY "user_select_portfolio_config" ON public.portfolio_config FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_portfolio_config" ON public.portfolio_config FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_portfolio_config" ON public.portfolio_config FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- positions
CREATE POLICY "user_select_positions" ON public.positions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_positions" ON public.positions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_positions" ON public.positions FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_delete_positions" ON public.positions FOR DELETE TO authenticated USING (user_id = auth.uid());

-- journal_entries
CREATE POLICY "user_select_journal_entries" ON public.journal_entries FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_journal_entries" ON public.journal_entries FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_delete_journal_entries" ON public.journal_entries FOR DELETE TO authenticated USING (user_id = auth.uid());

-- signal_ratings
CREATE POLICY "user_select_signal_ratings" ON public.signal_ratings FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_signal_ratings" ON public.signal_ratings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_signal_ratings" ON public.signal_ratings FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_delete_signal_ratings" ON public.signal_ratings FOR DELETE TO authenticated USING (user_id = auth.uid());

-- chat_conversations
CREATE POLICY "user_select_chat_conversations" ON public.chat_conversations FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_chat_conversations" ON public.chat_conversations FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_chat_conversations" ON public.chat_conversations FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_delete_chat_conversations" ON public.chat_conversations FOR DELETE TO authenticated USING (user_id = auth.uid());

-- agent_reflections
CREATE POLICY "user_select_agent_reflections" ON public.agent_reflections FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_agent_reflections" ON public.agent_reflections FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_agent_reflections" ON public.agent_reflections FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- signal_lessons
CREATE POLICY "user_select_signal_lessons" ON public.signal_lessons FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "user_insert_signal_lessons" ON public.signal_lessons FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "user_update_signal_lessons" ON public.signal_lessons FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ── 8. Keep global tables accessible ──────────────────────────────────────────
-- market_events, rss_cache, sentinel_articles, sentinel_briefings, api_usage
-- These stay with the existing permissive policies (anon + authenticated USING(true)).
-- No changes needed for these tables.
