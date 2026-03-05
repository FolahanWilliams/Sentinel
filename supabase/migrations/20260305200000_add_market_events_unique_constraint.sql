-- Add unique constraint on (ticker, headline) so upsert with onConflict works
-- First, deduplicate any existing rows keeping the most recent
DELETE FROM public.market_events a
USING public.market_events b
WHERE a.ticker = b.ticker
  AND a.headline = b.headline
  AND a.detected_at < b.detected_at;

ALTER TABLE public.market_events
  ADD CONSTRAINT unique_market_events_ticker_headline UNIQUE (ticker, headline);
