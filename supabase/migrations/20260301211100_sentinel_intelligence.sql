-- ======================================================================================
-- SENTINEL: News Intelligence Subsystem Tables (from sentinel-spec.md §4)
-- ======================================================================================

-- Processed articles cache (Gemini-enriched)
CREATE TABLE IF NOT EXISTS public.sentinel_articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    link TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    pub_date TIMESTAMPTZ NOT NULL,

    -- Gemini output fields
    summary TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    sentiment TEXT NOT NULL DEFAULT 'neutral' CHECK (sentiment IN ('bullish', 'bearish', 'neutral')),
    sentiment_score REAL NOT NULL DEFAULT 0,
    impact TEXT NOT NULL DEFAULT 'low' CHECK (impact IN ('high', 'medium', 'low')),
    signals JSONB DEFAULT '[]'::jsonb,
    entities TEXT[] DEFAULT '{}',

    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_sentinel_pub_date ON public.sentinel_articles(pub_date DESC);
CREATE INDEX IF NOT EXISTS idx_sentinel_category ON public.sentinel_articles(category);
CREATE INDEX IF NOT EXISTS idx_sentinel_sentiment ON public.sentinel_articles(sentiment);
CREATE INDEX IF NOT EXISTS idx_sentinel_impact ON public.sentinel_articles(impact);
CREATE INDEX IF NOT EXISTS idx_sentinel_link ON public.sentinel_articles(link);

-- Daily briefings cache
CREATE TABLE IF NOT EXISTS public.sentinel_briefings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    briefing_date DATE NOT NULL DEFAULT CURRENT_DATE,
    top_stories TEXT[] NOT NULL DEFAULT '{}',
    market_mood TEXT NOT NULL DEFAULT 'mixed',
    trending_topics TEXT[] NOT NULL DEFAULT '{}',
    signal_count JSONB NOT NULL DEFAULT '{"bullish":0,"bearish":0,"neutral":0}'::jsonb,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(briefing_date)
);

-- Enable RLS
ALTER TABLE public.sentinel_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sentinel_briefings ENABLE ROW LEVEL SECURITY;

-- Public read access (spec requires unauthenticated reads for news data)
CREATE POLICY "Public read sentinel_articles"
    ON public.sentinel_articles FOR SELECT
    USING (true);

CREATE POLICY "Service write sentinel_articles"
    ON public.sentinel_articles FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service update sentinel_articles"
    ON public.sentinel_articles FOR UPDATE
    USING (true);

CREATE POLICY "Public read sentinel_briefings"
    ON public.sentinel_briefings FOR SELECT
    USING (true);

CREATE POLICY "Service write sentinel_briefings"
    ON public.sentinel_briefings FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Service update sentinel_briefings"
    ON public.sentinel_briefings FOR UPDATE
    USING (true);
