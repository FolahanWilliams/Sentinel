-- Phase 2-6 Migration: TA Confirmation, Calibration, Self-Critique, User Ratings
-- Adds new columns to signals table and creates signal_ratings table.

-- 1. Add TA and calibration columns to signals table
ALTER TABLE public.signals
    ADD COLUMN IF NOT EXISTS ta_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS ta_alignment VARCHAR(20) DEFAULT 'unavailable',
    ADD COLUMN IF NOT EXISTS calibrated_confidence DECIMAL(5, 1),
    ADD COLUMN IF NOT EXISTS trailing_stop_rule TEXT,
    ADD COLUMN IF NOT EXISTS data_quality VARCHAR(20) DEFAULT 'full';

-- 2. Create signal_ratings table for user feedback (Phase 5)
CREATE TABLE IF NOT EXISTS public.signal_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
    rating VARCHAR(10) NOT NULL CHECK (rating IN ('up', 'down')),
    rated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_signal_rating UNIQUE (signal_id)
);

-- 3. Enable RLS on signal_ratings
ALTER TABLE public.signal_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read signal_ratings" ON public.signal_ratings;
CREATE POLICY "Allow public read signal_ratings"
    ON public.signal_ratings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert signal_ratings" ON public.signal_ratings;
CREATE POLICY "Allow public insert signal_ratings"
    ON public.signal_ratings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update signal_ratings" ON public.signal_ratings;
CREATE POLICY "Allow public update signal_ratings"
    ON public.signal_ratings FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete signal_ratings" ON public.signal_ratings;
CREATE POLICY "Allow public delete signal_ratings"
    ON public.signal_ratings FOR DELETE USING (true);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_signals_ta_alignment ON public.signals(ta_alignment);
CREATE INDEX IF NOT EXISTS idx_signals_calibrated_confidence ON public.signals(calibrated_confidence);
CREATE INDEX IF NOT EXISTS idx_signal_ratings_signal_id ON public.signal_ratings(signal_id);

-- 5. Enable realtime on signal_ratings
ALTER PUBLICATION supabase_realtime ADD TABLE public.signal_ratings;
