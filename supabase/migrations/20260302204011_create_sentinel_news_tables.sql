-- Migration: Create Sentinel News Intelligence Tables
-- Corresponds to Stage 12 of the pipeline.

-- Processed articles cache
CREATE TABLE IF NOT EXISTS sentinel_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  pub_date TIMESTAMPTZ NOT NULL,
  
  -- Gemini output
  summary TEXT,
  category TEXT NOT NULL,
  sentiment TEXT NOT NULL CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
  sentiment_score REAL NOT NULL DEFAULT 0,
  impact TEXT NOT NULL CHECK (impact IN ('high', 'medium', 'low')),
  signals JSONB DEFAULT '[]'::jsonb,
  entities TEXT[] DEFAULT '{}',
  
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_sentinel_pub_date ON sentinel_articles(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_sentinel_category ON sentinel_articles(category);
CREATE INDEX IF NOT EXISTS idx_sentinel_sentiment ON sentinel_articles(sentiment);
CREATE INDEX IF NOT EXISTS idx_sentinel_impact ON sentinel_articles(impact);
CREATE INDEX IF NOT EXISTS idx_sentinel_link ON sentinel_articles(link);

-- Daily briefings cache
CREATE TABLE IF NOT EXISTS sentinel_briefings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  top_stories TEXT[] NOT NULL,
  market_mood TEXT NOT NULL,
  trending_topics TEXT[] NOT NULL,
  signal_count JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(briefing_date)
);

-- Enable RLS
ALTER TABLE sentinel_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentinel_briefings ENABLE ROW LEVEL SECURITY;

-- Public read access (no auth needed for reading news during beta)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sentinel_articles' AND policyname = 'Public read sentinel_articles'
    ) THEN
        CREATE POLICY "Public read sentinel_articles"
          ON sentinel_articles FOR SELECT
          USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'sentinel_briefings' AND policyname = 'Public read sentinel_briefings'
    ) THEN
        CREATE POLICY "Public read sentinel_briefings"
          ON sentinel_briefings FOR SELECT
          USING (true);
    END IF;
END
$$;
