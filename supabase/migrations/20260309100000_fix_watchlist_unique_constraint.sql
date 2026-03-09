-- Fix watchlist unique constraint: replace partial index with a proper unique constraint
-- so that ON CONFLICT works correctly with PostgREST/Supabase upserts.
--
-- The previous migration (20260309000001) created a partial unique index:
--   CREATE UNIQUE INDEX watchlist_ticker_user ON watchlist(ticker, user_id) WHERE user_id IS NOT NULL;
-- PostgreSQL's ON CONFLICT cannot target partial indexes via PostgREST, causing 400 errors.

-- Drop the partial index
DROP INDEX IF EXISTS watchlist_ticker_user;

-- Create a proper unique constraint (works with ON CONFLICT)
ALTER TABLE public.watchlist
  ADD CONSTRAINT watchlist_ticker_user_id_unique UNIQUE (ticker, user_id);
