-- Optimize Scanner Queries
-- Add composite and single-column indexes tailored to the ScannerService queries

-- 1. market_events: prioritizeTickers queries by ticker and detected_at
CREATE INDEX IF NOT EXISTS idx_market_events_ticker_detected_at ON public.market_events(ticker, detected_at DESC);

-- 2. signals: historical context lookup by ticker and created_at
CREATE INDEX IF NOT EXISTS idx_signals_ticker_created_at ON public.signals(ticker, created_at DESC);

-- 3. sentinel_articles: filter heavily by processed_at and impact
CREATE INDEX IF NOT EXISTS idx_sentinel_articles_processed_at ON public.sentinel_articles(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sentinel_articles_impact_processed_at ON public.sentinel_articles(impact, processed_at DESC);

-- 4. signal_outcomes: prioritizeTickers checks outcomes for a list of signals
CREATE INDEX IF NOT EXISTS idx_signal_outcomes_signal_id_outcome ON public.signal_outcomes(signal_id, outcome);
