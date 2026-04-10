-- Add is_simulated flag to signals and signal_outcomes
-- This allows for training Dojo data to be isolated from live performance metrics.

ALTER TABLE public.signals ADD COLUMN is_simulated BOOLEAN DEFAULT false;
ALTER TABLE public.signal_outcomes ADD COLUMN is_simulated BOOLEAN DEFAULT false;

-- Add index for efficient filtering
CREATE INDEX idx_signals_is_simulated ON public.signals(is_simulated);
CREATE INDEX idx_signal_outcomes_is_simulated ON public.signal_outcomes(is_simulated);
