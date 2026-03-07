# Sentinel

AI-powered trading intelligence platform that monitors market data, news feeds, and sentiment sources to generate high-conviction trading signals using Google Gemini.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS 4 + Vite 6
- **Backend:** Supabase (Postgres + Edge Functions + Auth + Realtime)
- **AI:** Google Gemini (`gemini-3-flash-preview` for reasoning, `gemini-2.0-flash` for grounded search)
- **State:** Zustand
- **Charts:** Recharts + TradingView widgets
- **Deployment:** Vercel

## Features

- **AI Signal Generation** — Overreaction and contagion detection agents with self-critique validation, confidence calibration, and earnings guard
- **Real-Time Dashboard** — Market snapshot (indices, VIX, crypto, commodities), Fear & Greed gauge, AI-generated market briefings
- **Portfolio Management** — Position tracking, unrealized P&L, sector exposure, portfolio simulation
- **Backtesting** — Walk-forward validation, Monte Carlo simulation, confidence calibration charts
- **Outcome Tracking** — Automated win/loss tracking at 1d, 5d, 10d, 30d intervals with AI-generated outcome narratives
- **Market Intelligence** — 42 RSS feeds, Reddit sentiment, ticker-specific news, sector heatmaps
- **Risk Management** — ATR-based stops, Kelly criterion sizing, conflict detection, signal decay engine
- **Trade Journal** — Manual trade logging with mood tracking, tags, and signal linkage
- **Smart Alerts** — Email (via Resend) and browser push notifications gated by confidence + TA alignment + confluence

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

## Project Structure

```
src/
├── components/
│   ├── analysis/      # Signal analysis views (bias weights, events, fundamentals)
│   ├── dashboard/     # Dashboard widgets (signals, portfolio, watchlist, market)
│   ├── scanner/       # Scanner control & activity logs
│   ├── sentinel/      # News intelligence UI
│   └── shared/        # Reusable primitives (Badge, Sparkline, LoadingState)
├── config/
│   ├── constants.ts   # All magic numbers, thresholds, defaults
│   ├── rssFeeds.ts    # 42 RSS feed definitions
│   └── supabase.ts    # Supabase client init
├── hooks/             # React hooks (market data, signals, settings)
├── pages/             # Route pages (Dashboard, Scanner, Research, Journal, etc.)
├── services/          # Core business logic
│   ├── scanner.ts     # Main scan orchestrator
│   ├── agents.ts      # AI agent runners (overreaction, contagion)
│   ├── gemini.ts      # Gemini API wrapper
│   ├── marketData.ts  # Market data service with caching
│   ├── outcomeTracker.ts    # Automated win/loss tracking
│   ├── positionSizer.ts     # Kelly criterion + ATR-based sizing
│   ├── signalDecay.ts       # Time-based confidence decay
│   └── ...            # 30+ specialized services
├── stores/            # Zustand stores
├── types/             # TypeScript type definitions
└── utils/             # Formatting, validation, calculations

supabase/
├── functions/
│   ├── proxy-gemini/       # AI reasoning gateway (rate-limited)
│   ├── proxy-market-data/  # Market data aggregation
│   ├── proxy-rss/          # RSS feed parser
│   ├── proxy-reddit/       # Reddit sentiment
│   ├── sentinel/           # Main scanner loop
│   └── send-alert-email/   # Email alerts via Resend
└── migrations/             # Database schema
```

## Signal Pipeline

```
RSS Feeds / Market Data / Reddit
        ↓
   Event Extraction (severity scoring)
        ↓
   AI Agents (Overreaction + Contagion detection)
        ↓
   Technical Analysis alignment check
        ↓
   Self-Critique pass (confidence adjustment)
        ↓
   Earnings Guard + Conflict Detection
        ↓
   Confidence Calibration (historical win-rate mapping)
        ↓
   Signal stored → Alerts dispatched → Outcome tracking begins
```

## Key Configuration

All thresholds and defaults are centralized in `src/config/constants.ts`:

| Constant | Default | Purpose |
|----------|---------|---------|
| `DEFAULT_MIN_CONFIDENCE` | 60 | Minimum signal confidence to surface |
| `CONFIDENCE_GATE_OVERREACTION` | 75 | Initial gate for overreaction signals |
| `VIX_VOLATILITY_THRESHOLD` | 25 | VIX level that triggers "volatile" mood |
| `DEFAULT_DAILY_BUDGET` | $2.00 | Daily Gemini API spend limit |
| `DEFAULT_STARTING_CAPITAL` | $10,000 | Portfolio simulation default |
| `DEFAULT_RISK_PER_TRADE_PCT` | 2% | Max risk per trade |

## License

Private — all rights reserved.
