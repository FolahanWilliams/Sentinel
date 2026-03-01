-- ======================================================================================
-- SENTINEL: Core Initial Schema
-- ======================================================================================
-- Contains all 11 tables from the Sentinel Consolidated Plan (Stages 2 + Patches)
-- ======================================================================================

-- 1. Watchlist (Tickers actively tracked)
CREATE TABLE public.watchlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(10) NOT NULL UNIQUE,
    company_name VARCHAR(255) NOT NULL,
    sector VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Market Events (News/Events detected for tickers)
CREATE TABLE public.market_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(10) NOT NULL REFERENCES public.watchlist(ticker) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    headline TEXT NOT NULL,
    description TEXT,
    severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 10),
    source_urls TEXT[] NOT NULL DEFAULT '{}',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_date TIMESTAMPTZ,
    price_at_detection DECIMAL(10, 4),
    price_change_pct DECIMAL(10, 4),
    volume_multiplier DECIMAL(10, 4),
    is_overreaction_candidate BOOLEAN NOT NULL DEFAULT false,
    raw_data JSONB,
    source_type VARCHAR(50) NOT NULL DEFAULT 'rss'
);

-- 3. Signals (AI-Generated Trading Intelligence)
CREATE TABLE public.signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker VARCHAR(10) NOT NULL REFERENCES public.watchlist(ticker) ON DELETE CASCADE,
    signal_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
    risk_level VARCHAR(20) NOT NULL,
    bias_type VARCHAR(50) NOT NULL,
    secondary_biases TEXT[] NOT NULL DEFAULT '{}',
    bias_explanation TEXT,
    thesis TEXT,
    counter_argument TEXT,
    suggested_entry_low DECIMAL(10, 4),
    suggested_entry_high DECIMAL(10, 4),
    stop_loss DECIMAL(10, 4),
    target_price DECIMAL(10, 4),
    expected_timeframe_days INTEGER,
    historical_win_rate DECIMAL(5, 2),
    historical_avg_return DECIMAL(10, 4),
    historical_matches_count INTEGER,
    correction_probability DECIMAL(5, 2),
    sources TEXT[] NOT NULL DEFAULT '{}',
    agent_outputs JSONB,
    user_notes TEXT,
    is_paper BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Signal Outcomes (Performance Tracking - Patch 3)
CREATE TABLE public.signal_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES public.signals(id) ON DELETE CASCADE,
    ticker VARCHAR(10) NOT NULL,
    entry_price DECIMAL(10, 4) NOT NULL,
    price_at_1d DECIMAL(10, 4),
    price_at_5d DECIMAL(10, 4),
    price_at_10d DECIMAL(10, 4),
    price_at_30d DECIMAL(10, 4),
    return_at_1d DECIMAL(10, 4),
    return_at_5d DECIMAL(10, 4),
    return_at_10d DECIMAL(10, 4),
    return_at_30d DECIMAL(10, 4),
    outcome VARCHAR(20) NOT NULL DEFAULT 'pending', -- win, loss, breakeven
    hit_stop_loss BOOLEAN NOT NULL DEFAULT false,
    hit_target BOOLEAN NOT NULL DEFAULT false,
    max_drawdown DECIMAL(10, 4),
    max_gain DECIMAL(10, 4),
    tracked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 5. Scan Logs (Scanner execution history)
CREATE TABLE public.scan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    tickers_scanned INTEGER NOT NULL DEFAULT 0,
    events_detected INTEGER NOT NULL DEFAULT 0,
    signals_generated INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL,
    estimated_cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. App Settings (Global configuration)
CREATE TABLE public.app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. API Usage (Cost tracking - Patch 2)
CREATE TABLE public.api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,     -- e.g., 'gemini-3-flash', 'polygon'
    endpoint VARCHAR(100) NOT NULL,
    agent_name VARCHAR(100),           -- optional: which agent made the call
    ticker VARCHAR(10),                -- optional: contextual ticker
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    grounded_search_used BOOLEAN NOT NULL DEFAULT false,
    estimated_cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0,
    latency_ms INTEGER,
    success BOOLEAN NOT NULL DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Portfolio Config (Sizing defaults - Patch 5)
CREATE TABLE public.portfolio_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_capital DECIMAL(15, 2) NOT NULL DEFAULT 10000.00,
    max_position_pct DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
    max_total_exposure_pct DECIMAL(5, 2) NOT NULL DEFAULT 50.00,
    max_sector_exposure_pct DECIMAL(5, 2) NOT NULL DEFAULT 25.00,
    max_concurrent_positions INTEGER NOT NULL DEFAULT 5,
    risk_per_trade_pct DECIMAL(5, 2) NOT NULL DEFAULT 2.00,
    kelly_fraction DECIMAL(5, 2) NOT NULL DEFAULT 0.25,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure only one active portfolio config
CREATE UNIQUE INDEX single_portfolio_config ON public.portfolio_config((1));

-- 9. Positions (Active/historical trades - Patch 5)
CREATE TABLE public.positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID REFERENCES public.signals(id) ON DELETE SET NULL,
    ticker VARCHAR(10) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open', -- open, closed
    side VARCHAR(10) NOT NULL DEFAULT 'long',   -- long, short
    entry_price DECIMAL(10, 4),
    exit_price DECIMAL(10, 4),
    shares DECIMAL(15, 4),
    position_size_usd DECIMAL(15, 2),
    position_pct DECIMAL(5, 2),
    realized_pnl DECIMAL(15, 2),
    realized_pnl_pct DECIMAL(10, 4),
    opened_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    close_reason VARCHAR(50), -- target, stop_loss, manual, time_expiry
    notes TEXT
);

-- 10. Journal Entries (Trader notebook - Patch 7)
CREATE TABLE public.journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID REFERENCES public.signals(id) ON DELETE SET NULL,
    ticker VARCHAR(10),
    entry_type VARCHAR(50) NOT NULL, -- thesis, learning, mistake, general
    content TEXT NOT NULL,
    mood VARCHAR(50),
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. RSS Cache (Intelligence fast-path - Patch 8)
CREATE TABLE public.rss_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feed_name VARCHAR(100) NOT NULL,
    feed_category VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    link TEXT NOT NULL UNIQUE,
    published_at TIMESTAMPTZ,
    description TEXT,
    tickers_mentioned TEXT[] NOT NULL DEFAULT '{}',
    keywords TEXT[] NOT NULL DEFAULT '{}',
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- ======================================================================================
-- Triggers for `updated_at`
-- ======================================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_watchlist_modtime
    BEFORE UPDATE ON public.watchlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_signals_modtime
    BEFORE UPDATE ON public.signals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_app_settings_modtime
    BEFORE UPDATE ON public.app_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolio_modtime
    BEFORE UPDATE ON public.portfolio_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ======================================================================================
-- Row Level Security (RLS)
-- Our serverless API/client calls go through Edge Functions.
-- Direct client access is entirely disabled to respect the isolated Edge Function model.
-- ======================================================================================

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rss_cache ENABLE ROW LEVEL SECURITY;

-- Note: We only allow the `service_role` key (used in edge functions) to bypass RLS.
-- `anon` requests from the web clien will be explicitly rejected by default since there
-- are no anon bypass policies created here.
