-- Add confluence scoring, projected ROI, and agent reflections columns to signals table
-- These support the hybrid TA confluence engine and historical ROI projections

ALTER TABLE signals ADD COLUMN IF NOT EXISTS confluence_score smallint;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS confluence_level text CHECK (confluence_level IN ('strong', 'moderate', 'weak', 'none'));
ALTER TABLE signals ADD COLUMN IF NOT EXISTS projected_roi numeric(8,2);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS projected_win_rate smallint;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS similar_events_count smallint;

-- Agent reflections table — stores post-mortem lessons from the ReflectionAgent
CREATE TABLE IF NOT EXISTS agent_reflections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bias_type text NOT NULL,
    sector text NOT NULL DEFAULT 'all',
    rule text NOT NULL,
    win_rate numeric(5,2) NOT NULL,
    sample_size integer NOT NULL DEFAULT 0,
    severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on agent_reflections
ALTER TABLE agent_reflections ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write their reflections
CREATE POLICY "Allow authenticated read on agent_reflections"
    ON agent_reflections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert on agent_reflections"
    ON agent_reflections FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update on agent_reflections"
    ON agent_reflections FOR UPDATE TO authenticated USING (true);

-- Index for fast lookups by bias_type and active status
CREATE INDEX IF NOT EXISTS idx_agent_reflections_bias_active
    ON agent_reflections (bias_type, is_active);

-- Index for confluence-based signal filtering
CREATE INDEX IF NOT EXISTS idx_signals_confluence
    ON signals (confluence_level, confluence_score DESC)
    WHERE confluence_level IS NOT NULL;
