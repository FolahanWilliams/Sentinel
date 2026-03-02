-- Migration to allow authenticated users full access to tables used by the frontend client
-- Enable RLS for all tables (already done in initial schema, but good to be explicit if they were turned off)
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.market_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.portfolio_config ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rss_cache ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users for all tables
-- Watchlist
CREATE POLICY "Enable ALL for authenticated users on watchlist" ON public.watchlist FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- Market Events
CREATE POLICY "Enable ALL for authenticated users on market_events" ON public.market_events FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- Signals
CREATE POLICY "Enable ALL for authenticated users on signals" ON public.signals FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- Signal Outcomes
CREATE POLICY "Enable ALL for authenticated users on signal_outcomes" ON public.signal_outcomes FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- Scan Logs
CREATE POLICY "Enable ALL for authenticated users on scan_logs" ON public.scan_logs FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- App Settings
CREATE POLICY "Enable ALL for authenticated users on app_settings" ON public.app_settings FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- API Usage
CREATE POLICY "Enable ALL for authenticated users on api_usage" ON public.api_usage FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- Portfolio Config
CREATE POLICY "Enable ALL for authenticated users on portfolio_config" ON public.portfolio_config FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- Positions
CREATE POLICY "Enable ALL for authenticated users on positions" ON public.positions FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- Journal Entries
CREATE POLICY "Enable ALL for authenticated users on journal_entries" ON public.journal_entries FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);

-- RSS Cache
CREATE POLICY "Enable ALL for authenticated users on rss_cache" ON public.rss_cache FOR ALL TO authenticated USING (true)
WITH
    CHECK (true);