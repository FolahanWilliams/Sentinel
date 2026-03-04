-- ======================================================================================
-- PHASE 6 FIX: Add missing indexes on frequently queried columns (Audit M32)
-- ======================================================================================

-- market_events
CREATE INDEX IF NOT EXISTS idx_market_events_ticker ON public.market_events(ticker);
CREATE INDEX IF NOT EXISTS idx_market_events_detected_at ON public.market_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_events_event_type ON public.market_events(event_type);

-- signals
CREATE INDEX IF NOT EXISTS idx_signals_ticker ON public.signals(ticker);
CREATE INDEX IF NOT EXISTS idx_signals_status ON public.signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON public.signals(created_at DESC);

-- signal_outcomes
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal_id ON public.signal_outcomes(signal_id);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_outcome ON public.signal_outcomes(outcome);
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_tracked_at ON public.signal_outcomes(tracked_at DESC);

-- api_usage
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON public.api_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_provider ON public.api_usage(provider);

-- positions
CREATE INDEX IF NOT EXISTS idx_positions_ticker ON public.positions(ticker);
CREATE INDEX IF NOT EXISTS idx_positions_status ON public.positions(status);

-- rss_cache
CREATE INDEX IF NOT EXISTS idx_rss_cache_expires_at ON public.rss_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_rss_cache_fetched_at ON public.rss_cache(fetched_at DESC);

-- Fix (Audit m13): Drop redundant index on sentinel_articles.link
-- The UNIQUE constraint already creates an implicit index
DROP INDEX IF EXISTS idx_sentinel_link;
