-- Decision Quality Index (DQI) — composite quality score for signals
-- Part of the Decision Intelligence integration (ported from Decision Intel startup)

ALTER TABLE signals ADD COLUMN IF NOT EXISTS dqi_score integer;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS dqi_components jsonb;

-- Index for DQI-based filtering and analytics
CREATE INDEX IF NOT EXISTS idx_signals_dqi_score ON signals (dqi_score) WHERE dqi_score IS NOT NULL;

COMMENT ON COLUMN signals.dqi_score IS 'Decision Quality Index: composite 0-100 score aggregating bias audit, noise, pre-mortem, twin consensus, self-critique, cross-source, RPD pattern, and toxic combination scores';
COMMENT ON COLUMN signals.dqi_components IS 'Breakdown of individual DQI component scores (JSON)';
