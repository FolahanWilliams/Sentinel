-- Quarantine non-live (strategy-backtest) rows from the live calibration /
-- performance / learning surfaces by unifying on the existing `is_simulated`
-- marker.
--
-- StrategyOutcomeWriter persists strategy backtests into the live `signals` and
-- `signal_outcomes` tables but never set `is_simulated`, so those rows defaulted
-- to is_simulated=false and were read by every live calibration/performance
-- aggregate alongside real out-of-sample outcomes — contaminating the confidence
-- calibration curve (the moat) and the live performance record. The writer now
-- tags new backtest rows is_simulated=true; this backfills the existing ones.
--
-- Training Dojo simulations already set is_simulated=true, so after this both
-- non-live sources share one canonical predicate: is_simulated=false === live.
-- The application code (same change) filters is_simulated=false on every live
-- read; BacktestValidator is the one intentional consumer of backtest rows and
-- is exempt by design.

UPDATE public.signals
   SET is_simulated = true
 WHERE signal_type = 'strategy_backtest'
   AND is_simulated IS DISTINCT FROM true;

UPDATE public.signal_outcomes o
   SET is_simulated = true
  FROM public.signals s
 WHERE o.signal_id = s.id
   AND s.signal_type = 'strategy_backtest'
   AND o.is_simulated IS DISTINCT FROM true;
