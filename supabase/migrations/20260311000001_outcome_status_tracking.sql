-- Outcome Status Tracking
-- Adds mandatory outcome tracking fields to signals table
-- and monetary value fields for £/$ impact calculation.

-- Outcome status enum: tracks where each signal is in the outcome lifecycle
DO $$ BEGIN
    CREATE TYPE outcome_status AS ENUM ('pending_outcome', 'outcome_logged', 'outcome_overdue');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add outcome tracking columns to signals
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS outcome_status outcome_status DEFAULT 'pending_outcome',
    ADD COLUMN IF NOT EXISTS outcome_due_at timestamptz,
    ADD COLUMN IF NOT EXISTS outcome_review_days int;

-- Add monetary value columns to signals for £/$ impact tracking
ALTER TABLE signals
    ADD COLUMN IF NOT EXISTS monetary_value decimal,
    ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD';

-- Add user_outcome fields to signal_outcomes for manual outcome logging
ALTER TABLE signal_outcomes
    ADD COLUMN IF NOT EXISTS user_outcome_notes text,
    ADD COLUMN IF NOT EXISTS user_reported_result text,
    ADD COLUMN IF NOT EXISTS confirmed_biases text[],
    ADD COLUMN IF NOT EXISTS lessons_learned text;

-- Index for compliance queries (find overdue outcomes)
CREATE INDEX IF NOT EXISTS idx_signals_outcome_status ON signals (outcome_status)
    WHERE outcome_status IN ('pending_outcome', 'outcome_overdue');

CREATE INDEX IF NOT EXISTS idx_signals_outcome_due ON signals (outcome_due_at)
    WHERE outcome_due_at IS NOT NULL AND outcome_status = 'pending_outcome';

-- Backfill: set outcome_due_at for existing signals that already have signal_outcomes
UPDATE signals s
SET outcome_due_at = s.created_at + (COALESCE(s.expected_timeframe_days, 30) * 2) * INTERVAL '1 day',
    outcome_status = CASE
        WHEN EXISTS (
            SELECT 1 FROM signal_outcomes so
            WHERE so.signal_id = s.id AND so.outcome != 'pending'
        ) THEN 'outcome_logged'::outcome_status
        WHEN s.created_at + (COALESCE(s.expected_timeframe_days, 30) * 2) * INTERVAL '1 day' < NOW()
        THEN 'outcome_overdue'::outcome_status
        ELSE 'pending_outcome'::outcome_status
    END
WHERE s.outcome_due_at IS NULL;
