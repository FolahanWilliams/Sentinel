-- Optimize Scanner Queries - Prioritize Tickers RPC
-- Create an RPC function to calculate priority scores directly in the database
-- to reduce data transfer and client-side processing overhead

CREATE OR REPLACE FUNCTION prioritize_tickers(p_tickers text[])
RETURNS TABLE (
    ticker text,
    events int,
    signals int,
    rss int,
    sentinel_total int,
    sentinel_high_impact int,
    wins int,
    total_outcomes int
) AS $$
DECLARE
    one_day_ago timestamptz := NOW() - INTERVAL '1 day';
BEGIN
    RETURN QUERY
    WITH TickerList AS (
        SELECT unnest(p_tickers) AS ticker
    ),
    EventCounts AS (
        SELECT me.ticker, COUNT(*)::int AS events
        FROM market_events me
        WHERE me.ticker = ANY(p_tickers) AND me.detected_at >= one_day_ago
        GROUP BY me.ticker
    ),
    SignalCounts AS (
        SELECT s.ticker, COUNT(*)::int AS signals
        FROM signals s
        WHERE s.ticker = ANY(p_tickers)
        GROUP BY s.ticker
    ),
    OutcomeCounts AS (
        SELECT s.ticker, 
               COUNT(CASE WHEN so.outcome = 'win' THEN 1 END)::int AS wins,
               COUNT(so.outcome)::int AS total_outcomes
        FROM signals s
        JOIN signal_outcomes so ON s.id = so.signal_id
        WHERE s.ticker = ANY(p_tickers) AND so.outcome != 'pending'
        GROUP BY s.ticker
    ),
    -- RSS mentions: crude text search, could be optimized further later
    RssMentions AS (
        SELECT rc.title
        FROM rss_cache rc
        WHERE rc.fetched_at >= one_day_ago
        ORDER BY rc.fetched_at DESC
        LIMIT 200
    ),
    RssCounts AS (
        SELECT t.ticker, COUNT(*)::int AS rss
        FROM TickerList t
        JOIN RssMentions r ON r.title ILIKE '%' || t.ticker || '%'
        GROUP BY t.ticker
    ),
    -- Sentinel articles
    SentinelArticles AS (
        SELECT sa.title, sa.summary, sa.impact, sa.affected_tickers, sa.signals
        FROM sentinel_articles sa
        WHERE sa.processed_at >= one_day_ago
        ORDER BY sa.processed_at DESC
        LIMIT 100
    ),
    SentinelCounts AS (
        SELECT t.ticker, 
               COUNT(*)::int AS sentinel_total,
               COUNT(CASE WHEN sa.impact = 'high' THEN 1 END)::int AS sentinel_high_impact
        FROM TickerList t
        CROSS JOIN SentinelArticles sa
        -- A ticker is mentioned if it's in affected_tickers, the title/summary contains it, or it's in the JSONB signals array
        WHERE t.ticker = ANY(sa.affected_tickers)
           OR (sa.title || ' ' || sa.summary) ILIKE '%' || t.ticker || '%'
           OR sa.signals @> jsonb_build_array(jsonb_build_object('ticker', t.ticker))
           OR sa.signals @> jsonb_build_array(jsonb_build_object('ticker', lower(t.ticker)))
        GROUP BY t.ticker
    )
    SELECT
        t.ticker,
        COALESCE(e.events, 0),
        COALESCE(sc.signals, 0),
        COALESCE(r.rss, 0),
        COALESCE(sent.sentinel_total, 0),
        COALESCE(sent.sentinel_high_impact, 0),
        COALESCE(oc.wins, 0),
        COALESCE(oc.total_outcomes, 0)
    FROM TickerList t
    LEFT JOIN EventCounts e ON e.ticker = t.ticker
    LEFT JOIN SignalCounts sc ON sc.ticker = t.ticker
    LEFT JOIN RssCounts r ON r.ticker = t.ticker
    LEFT JOIN SentinelCounts sent ON sent.ticker = t.ticker
    LEFT JOIN OutcomeCounts oc ON oc.ticker = t.ticker;
END;
$$ LANGUAGE plpgsql;
