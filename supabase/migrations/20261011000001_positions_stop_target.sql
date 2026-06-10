-- Sentinel — persist the trade plan on the position itself
--
-- The "Open Position" flow carried a signal's stop/target into a banner but
-- never stored them: the positions table had no such columns, so the plan was
-- dropped the moment the modal closed, and stop/target alerts could only read
-- the *signal's* levels (and only for signal-linked positions). Persisting the
-- levels on the position lets alerts be position-driven, side-aware, and work
-- for manual positions and adjusted stops.

ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(10, 4);
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS target_price DECIMAL(10, 4);

COMMENT ON COLUMN public.positions.stop_loss IS 'Trade-plan stop for this position (own copy; may be adjusted independently of the source signal).';
COMMENT ON COLUMN public.positions.target_price IS 'Trade-plan target for this position (own copy; may be adjusted independently of the source signal).';
