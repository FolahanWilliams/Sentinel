-- Add currency field to positions table
-- Defaults to 'USD' for backwards compatibility with existing positions.
-- The CSV importer and manual trade logger will set this based on ticker suffix.

ALTER TABLE public.positions
    ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'USD';

COMMENT ON COLUMN public.positions.currency IS 'ISO 4217 currency code (USD, GBP, EUR, etc.)';
