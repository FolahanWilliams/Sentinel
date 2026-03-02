-- ======================================================================================
-- Add affected_tickers to sentinel_articles for multi-ticker event mapping
-- Stores: [{ticker, relationship, direction, confidence}]
-- ======================================================================================

ALTER TABLE public.sentinel_articles
    ADD COLUMN IF NOT EXISTS affected_tickers JSONB DEFAULT '[]'::jsonb;

-- GIN index for fast ticker lookups (e.g. "find all articles affecting NVDA")
CREATE INDEX IF NOT EXISTS idx_sentinel_affected_tickers
    ON public.sentinel_articles USING GIN (affected_tickers);
