# Sentinel

**AI-Powered Trading Intelligence Platform**

Sentinel is an autonomous market intelligence engine that continuously monitors news, sentiment, and market data to surface high-conviction trading opportunities before the crowd. Built on a multi-agent AI reasoning architecture, it doesn't just alert you to moves — it explains *why* they're happening, challenges its own thesis, and learns from every outcome.

> **Built for an edge.** Sentinel combines real-time data ingestion, behavioral finance models, and a self-improving AI pipeline to identify mispriced assets with institutional-grade rigor — at a fraction of the cost.

---

## Why Sentinel

Traditional screening tools tell you *what* moved. Sentinel tells you **why it moved, whether the market overreacted, and what to do about it** — with confidence scores calibrated against its own track record.

**For investors evaluating this project:** Sentinel demonstrates end-to-end product thinking — from data ingestion and AI orchestration to portfolio-aware risk management and closed-loop learning. It's a single-developer build that ships the kind of intelligence pipeline typically found inside quantitative hedge funds.

---

## Core Intelligence Engine

### Multi-Agent Reasoning Pipeline

Sentinel runs every potential signal through a 5-agent AI pipeline, each with specialized prompts, schemas, and temperature tuning:

| Agent | Role |
|-------|------|
| **Overreaction Detector** | Identifies irrational price drops driven by behavioral bias (anchoring, herding, loss aversion) |
| **Contagion Analyzer** | Detects when a sector-wide selloff unfairly drags down fundamentally strong names |
| **Bullish Catalyst Agent** | Spots asymmetric upside from catalysts the market hasn't fully priced in |
| **Earnings Guard** | Flags upcoming earnings as a risk factor and adjusts confidence accordingly |
| **Red Team (Sanity Check)** | Adversarial agent that challenges every thesis before it reaches the dashboard |

### Self-Critique & Adversarial Validation

Every signal passes through a **Think → Critique → Decide** loop:
- The originating agent generates a thesis with confidence score
- A **Self-Critique module** stress-tests the reasoning for logical flaws, circular arguments, and overconfidence
- Critical flaws automatically reduce confidence; fatal flaws kill the signal entirely

### Self-Learning Feedback Loop

Sentinel gets smarter over time through two closed-loop learning systems:

- **Reflection Agent** — Analyzes historical outcomes to generate "Lessons Learned" rules (e.g., *"Biotech overreaction signals with severity < 5 win only 30% — lower confidence by 15"*). These rules are injected into future agent prompts via RAG.
- **Auto-Learning Service** — Performs post-mortem analysis on every completed trade, measuring which pipeline steps (sentiment divergence, multi-timeframe, earnings guard) contributed to wins vs. losses, then dynamically adjusts step weights.

### Dynamic Confidence Calibration

Raw AI confidence scores are remapped to actual observed win rates using **isotonic regression (PAVA algorithm)**. This means a signal showing "78% confidence" genuinely reflects a ~78% historical win rate — not just model optimism.

---

## Signal Processing Pipeline

```
42 RSS Feeds + Reddit + Google News
              ↓
   Event Extraction & Severity Scoring
              ↓
   Market Data Enrichment (price, volume, 52w range, sector)
              ↓
   Sentiment-Price Divergence Detection
         (Panic Exhaustion / Euphoria Climax)
              ↓
   Multi-Agent Analysis (Overreaction + Contagion + Catalyst)
              ↓
   Technical Analysis Alignment (multi-timeframe)
              ↓
   Red Team Sanity Check → Self-Critique Pass
              ↓
   Earnings Guard + Conflict Detection + Correlation Guard
              ↓
   Conviction Guardrails (Buffett/Lynch quality gates)
              ↓
   Dynamic Confidence Calibration (isotonic regression)
              ↓
   Semantic Deduplication → Signal Stored
              ↓
   Smart Alerts Dispatched → Outcome Tracking Begins
              ↓
   Post-Mortem → Reflection Agent → Weight Adjustment
         (feedback loop closes)
```

---

## Platform Features

### Real-Time Market Dashboard
- Live market snapshot: indices, VIX, crypto, commodities, treasury yields, forex
- **Fear & Greed gauge** with AI-generated market mood briefings
- **Market regime detection** (bull / neutral / correction / crisis) with automatic confidence penalties during high-volatility environments
- Sector heatmaps and rotation analysis
- Upcoming events calendar (earnings, economic data, Fed meetings)

### Signal Intelligence
- AI-generated signal cards with full reasoning chain, bias classification, and risk/reward visualization
- **Agent Reasoning Surface** — inspect exactly how each agent scored a signal
- Signal comparison view for evaluating competing theses
- Historical precedent matching
- Signal decay engine that reduces confidence over time as setups age

### Portfolio Management
- Position tracking with real-time unrealized P&L
- Sector exposure monitoring with concentration limits
- **Portfolio-aware position sizing** — Kelly criterion + ATR-based stops, constrained by portfolio exposure
- **Conviction guardrails** inspired by Buffett (margin of safety) and Lynch (category-based limits on cyclicals, low-moat stocks)
- Portfolio simulation engine for paper trading
- Brokerage CSV import support

### Backtesting & Validation
- Walk-forward backtesting engine
- Monte Carlo simulation for drawdown analysis
- Confidence calibration charts (predicted vs. actual win rates)
- Strategy performance visualization

### Advanced Risk Management
- **Correlation Guard** — blocks correlated positions that would amplify drawdowns
- **Conflict Detector** — flags contradictory signals on the same ticker
- **Market Regime Filter** — penalizes signals during crisis/high-vol periods
- **Exposure Monitor** — enforces max sector, max portfolio, and max concurrent position limits
- ATR-based stop losses with Kelly fraction sizing (quarter-Kelly default)

### Sentiment & News Intelligence
- 42 curated RSS feeds across financial news, macro, and sector sources
- Reddit sentiment analysis (retail vs. institutional narrative detection)
- **Sentiment-Price Divergence Detector** — identifies "Panic Exhaustion" (price falling + sentiment improving) and "Euphoria Climax" (price rising + sentiment deteriorating) patterns
- **Cross-Source Validation** — requires multiple independent sources to confirm a thesis
- Semantic deduplication to prevent duplicate signals from the same event
- Ticker-specific news feed with AI-enriched context

### Outcome Tracking & Learning
- Automated win/loss tracking at **1-day, 5-day, 10-day, and 30-day** intervals
- AI-generated **outcome narratives** explaining what happened and why
- **Post-mortem analysis** with Buffett/Lynch lesson extraction
- Performance leaderboard and strategy-level statistics
- Weighted ROI calculations across bias types and sectors

### Trade Journal
- Manual trade logging with mood tracking, tags, and signal linkage
- Replay trades with annotated chart overlays

### Smart Alerts
- Multi-channel: email (Resend) + browser push notifications
- Gated by confidence threshold + TA alignment + confluence score
- Configurable per-signal-type notification preferences

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19 + TypeScript + Tailwind CSS 4 + Vite 6 |
| **Backend** | Supabase (Postgres + Edge Functions + Auth + Realtime) |
| **AI Reasoning** | Google Gemini (`gemini-3-flash-preview` for analysis, `gemini-2.0-flash` for grounded search) |
| **Charts** | TradingView widgets + Lightweight Charts + Recharts |
| **State** | Zustand |
| **Animations** | Framer Motion |
| **Deployment** | Vercel |

### Architecture Highlights
- **13 Edge Functions** handling AI proxy, market data aggregation, RSS parsing, Reddit sentiment, crypto/forex/treasury/macro data, and email alerts
- **48+ specialized services** — from scanner orchestration and agent pipelines to isotonic regression calibrators and correlation matrices
- **Intelligent caching** at every layer (quotes: 60s, fundamentals: 6h, AI content: 30m, regime: 2h) to minimize API costs
- **Budget controls** with daily/monthly Gemini API spend limits and 80% threshold alerts
- **Strict TypeScript** with enforced `tsc --noEmit` before every deploy

---

## Project Structure

```
src/
├── components/
│   ├── analysis/      # Agent reasoning, bias breakdown, risk/reward charts
│   ├── dashboard/     # Market snapshot, portfolio, signals, watchlist, heatmaps
│   ├── scanner/       # Scanner controls & activity logs
│   ├── sentinel/      # News intelligence, convergence alerts, briefings
│   ├── signals/       # Signal filtering & display
│   └── shared/        # Reusable primitives (Badge, Sparkline, LoadingState)
├── config/
│   ├── constants.ts   # All thresholds, defaults, and guardrail parameters
│   ├── rssFeeds.ts    # 42 RSS feed definitions
│   └── supabase.ts    # Supabase client initialization
├── hooks/             # React hooks (market data, signals, settings)
├── pages/             # 15 route pages (Dashboard, Scanner, Analysis, Journal, etc.)
├── services/          # 48+ specialized services (see below)
├── stores/            # Zustand state management
├── types/             # TypeScript type definitions
└── utils/             # Formatting, validation, calculations

supabase/
├── functions/
│   ├── proxy-gemini/        # AI reasoning gateway (rate-limited, model-switching)
│   ├── proxy-market-data/   # Market data aggregation
│   ├── proxy-rss/           # RSS feed parser
│   ├── proxy-reddit/        # Reddit sentiment extraction
│   ├── proxy-crypto/        # Cryptocurrency data
│   ├── proxy-forex/         # Foreign exchange rates
│   ├── proxy-treasury/      # Treasury yield data
│   ├── proxy-economic/      # Economic indicators
│   ├── proxy-macro/         # Macro data aggregation
│   ├── proxy-fear-greed/    # Fear & Greed Index
│   ├── post-mortem/         # AI-powered trade post-mortems
│   ├── sentinel/            # Main scanner execution loop
│   └── send-alert-email/    # Email alerts via Resend
└── migrations/              # Database schema
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase project ([supabase.com](https://supabase.com))
- Google Gemini API key
- Market data API key (Polygon.io or Alpha Vantage)

### Environment Variables

Create a `.env.local` file:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_APP_PASSWORD_HASH=sha256_hash_of_your_password
```

Set these as Supabase Edge Function secrets:

```
GEMINI_API_KEY=your_gemini_api_key
MARKET_DATA_API_KEY=your_polygon_or_alphavantage_key
MARKET_DATA_PROVIDER=polygon
NOTIFICATION_EMAIL=your_email@example.com
RESEND_API_KEY=your_resend_key
```

### Install & Run

```bash
npm install
npm run dev        # Start dev server on :5173
```

### Build

```bash
npm run build      # TypeScript check + Vite production build
npx tsc --noEmit   # Type check only (run before pushing)
npm run preview    # Preview production build locally
```

---

## License

Private — all rights reserved.
