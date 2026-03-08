-- Add Buffett/Lynch conviction fields to signals table
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS conviction_score int,
    ADD COLUMN IF NOT EXISTS moat_rating int,
    ADD COLUMN IF NOT EXISTS lynch_category text,
    ADD COLUMN IF NOT EXISTS margin_of_safety_pct numeric,
    ADD COLUMN IF NOT EXISTS why_high_conviction text;

-- Add check constraints
ALTER TABLE signals
    ADD CONSTRAINT chk_conviction_score CHECK (conviction_score IS NULL OR (conviction_score >= 0 AND conviction_score <= 100)),
    ADD CONSTRAINT chk_moat_rating CHECK (moat_rating IS NULL OR (moat_rating >= 1 AND moat_rating <= 10)),
    ADD CONSTRAINT chk_lynch_category CHECK (lynch_category IS NULL OR lynch_category IN ('fast_grower', 'stalwart', 'turnaround', 'asset_play', 'cyclical', 'slow_grower'));

-- Index for high-conviction signal filtering
CREATE INDEX IF NOT EXISTS idx_signals_conviction ON signals (conviction_score DESC NULLS LAST) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_signals_lynch_category ON signals (lynch_category) WHERE status = 'active' AND lynch_category IS NOT NULL;

-- Signal lessons table — stores Buffett/Lynch lessons from trade outcomes
CREATE TABLE IF NOT EXISTS signal_lessons (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    ticker text,
    category text NOT NULL,
    conviction_score int,
    lesson_text text NOT NULL,
    outcome_impact text,
    trade_return_pct numeric,
    lynch_category text,
    moat_rating int,
    signal_id uuid REFERENCES signals(id) ON DELETE SET NULL,
    created_at timestamptz DEFAULT now()
);

-- Index for fast lesson retrieval
CREATE INDEX IF NOT EXISTS idx_signal_lessons_recent ON signal_lessons (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_lessons_category ON signal_lessons (category);

-- RLS policies for signal_lessons
ALTER TABLE signal_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read_signal_lessons" ON signal_lessons
    FOR SELECT TO anon USING (true);

CREATE POLICY "service_role_all_signal_lessons" ON signal_lessons
    FOR ALL TO service_role USING (true) WITH CHECK (true);
