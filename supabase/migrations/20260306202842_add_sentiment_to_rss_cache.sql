-- Migration: Add AI sentiment columns to rss_cache
-- Purpose: Store Gemini sentiment analysis results for Reddit and News data

ALTER TABLE public.rss_cache
ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC,
ADD COLUMN IF NOT EXISTS sentiment_reasoning TEXT;
