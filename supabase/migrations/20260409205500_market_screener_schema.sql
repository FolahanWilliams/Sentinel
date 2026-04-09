-- Migration: Market Screener Schema Support
-- Adds source_performance table and scan_phase column to relevant tables

-- 1. Add scan_phase to scan_logs if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scan_logs' AND column_name = 'scan_phase') THEN
        ALTER TABLE scan_logs ADD COLUMN scan_phase text;
    END IF;
END $$;

-- 2. Add scan_phase to signals if it doesn't exist (assuming agent_outputs is JSONB and may contain it, but if it needs to be top-level)
-- We will also add it to signals just in case, or we rely entirely on agent_outputs JSONB.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'scan_phase') THEN
        ALTER TABLE signals ADD COLUMN scan_phase text;
    END IF;
END $$;

-- 3. Create source_performance table
CREATE TABLE IF NOT EXISTS source_performance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    domain text UNIQUE NOT NULL,
    total_signals integer NOT NULL DEFAULT 0,
    winning_signals integer NOT NULL DEFAULT 0,
    win_rate numeric NOT NULL DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    last_updated timestamp with time zone DEFAULT now()
);

-- 4. Set up Row Level Security (RLS) for source_performance
ALTER TABLE source_performance ENABLE ROW LEVEL SECURITY;

-- Allow public read access to source_performance (used by edge functions or clients to calculate weights)
CREATE POLICY "Allow public read access to source_performance" 
    ON source_performance FOR SELECT 
    USING (true);

-- Allow authenticated/service roles to insert/update
CREATE POLICY "Allow service role insert source_performance" 
    ON source_performance FOR INSERT 
    WITH CHECK (true);
    
CREATE POLICY "Allow service role update source_performance" 
    ON source_performance FOR UPDATE 
    USING (true);

-- Create an index to quickly lookup performance by domain
CREATE INDEX IF NOT EXISTS idx_source_performance_domain ON source_performance(domain);
