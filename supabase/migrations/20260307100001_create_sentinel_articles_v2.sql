-- Migration: Create Sentinel Articles Table v2
-- Aligns with requested schema in implementation plan.

CREATE TABLE IF NOT EXISTS sentinel_articles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  summary text,
  pub_date timestamptz DEFAULT now(),
  processed_at timestamptz DEFAULT now(),
  impact text DEFAULT 'low',
  sentiment_score numeric,
  entities text[] DEFAULT '{}',
  affected_tickers text[] DEFAULT '{}',
  signals jsonb DEFAULT '[]',
  source_url text,
  created_at timestamptz DEFAULT now()
);

-- Index for ticker searches
CREATE INDEX IF NOT EXISTS idx_sentinel_articles_tickers ON sentinel_articles USING GIN (affected_tickers);
CREATE INDEX IF NOT EXISTS idx_sentinel_articles_pub_date ON sentinel_articles (pub_date DESC);

-- Enable RLS
ALTER TABLE sentinel_articles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sentinel_articles' AND policyname = 'Allow public read access'
    ) THEN
        CREATE POLICY "Allow public read access" ON sentinel_articles FOR SELECT USING (true);
    END IF;
END
$$;
