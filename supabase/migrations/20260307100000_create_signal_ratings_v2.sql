-- Migration: Create Signal Ratings Table
-- Track user feedback on AI signals.

CREATE TABLE IF NOT EXISTS signal_ratings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id uuid REFERENCES signals(id) ON DELETE CASCADE UNIQUE,
  rating text NOT NULL CHECK (rating IN ('up', 'down')),
  rated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE signal_ratings ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for now (adjust once auth is fully integrated)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'signal_ratings' AND policyname = 'Allow public read access'
    ) THEN
        CREATE POLICY "Allow public read access" ON signal_ratings FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'signal_ratings' AND policyname = 'Allow public insert access'
    ) THEN
        CREATE POLICY "Allow public insert access" ON signal_ratings FOR INSERT WITH CHECK (true);
    END IF;
END
$$;
