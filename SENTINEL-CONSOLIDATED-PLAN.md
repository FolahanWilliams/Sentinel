# SENTINEL — Consolidated Build Plan v2.0
## Original 10 Stages + All Addendum v1.1 Patches (Merged)

> **Purpose:** Single-source-of-truth build document merging the original prompt plan with all 8 addendum patches. Feed each stage sequentially into your AI coding environment.
>
> **AI Model:** All references use **Gemini 3 Flash** unless otherwise noted.
>
> **Stack:** React + TypeScript + Vite + Tailwind CSS + Supabase (Edge Functions + Postgres) + Gemini 3 Flash
>
> **Deployment:** Vercel
>
> **Separate Document:** The Sentinel RSS Intelligence Feed spec (`sentinel-spec.md`) remains standalone — it defines the news aggregation subsystem that integrates at Stage 5 via Patch 8.

---

# HOW TO USE THIS DOCUMENT

This document contains **12 staged prompts** (original 10 + 2 new stages from addendum). Each stage builds on the previous one and includes the relevant patches merged inline.

**Workflow:**
1. Read the stage overview
2. Copy the prompt into your AI coding environment
3. Review and refine the output
4. Test that stage before proceeding
5. Carry forward context into subsequent stages

**Customization notes** are marked with `[CUSTOMIZE]`.

---
---

# STAGE 1: PROJECT SCAFFOLDING, SECURITY & PASSWORD GATE
### Original Stage 1 + Patch 1 (Security)

## Overview
Sets up the project structure, dependencies, environment variables, foundational architecture, **password gate**, and **API key proxying via Supabase Edge Functions**. After this stage you have a running (empty) app with routing, theme, security layers, and all tooling configured.

## Prompt

```
You are an expert full-stack developer. I need you to scaffold a complete React + TypeScript project for a personal trading intelligence web app called "Sentinel."

## Project Requirements

**Core Stack:**
- React 18+ with TypeScript (strict mode)
- Vite as the build tool
- Tailwind CSS v4 for styling
- Supabase (JS client v2) for database, real-time subscriptions, and edge functions
- Google Gemini API (@google/generative-ai SDK) for all AI — use **Gemini 3 Flash** as the default model everywhere
- React Router v6 for client-side routing
- Zustand for lightweight state management
- Recharts for data visualization / charting
- date-fns for date utilities
- Lucide React for icons

**Project Structure — generate all files:**

```
sentinel/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── vite-env.d.ts
│   ├── config/
│   │   ├── env.ts
│   │   ├── constants.ts
│   │   ├── supabase.ts
│   │   └── rssFeeds.ts              # [FROM PATCH 8] Curated RSS feed definitions
│   ├── types/
│   │   ├── index.ts
│   │   ├── market.ts
│   │   ├── signals.ts
│   │   ├── events.ts
│   │   ├── agents.ts
│   │   └── database.ts
│   ├── hooks/
│   │   ├── useSupabaseRealtime.ts
│   │   ├── useSignals.ts
│   │   ├── useWatchlist.ts
│   │   ├── useMarketData.ts
│   │   └── useNotifications.ts
│   ├── services/
│   │   ├── gemini.ts
│   │   ├── marketData.ts
│   │   ├── rssReader.ts              # [FROM PATCH 8] RSS feed reader service
│   │   ├── outcomeTracker.ts         # [FROM PATCH 3] Automated outcome tracking
│   │   ├── performanceStats.ts       # [FROM PATCH 4] Feedback loop service
│   │   ├── positionSizer.ts          # [FROM PATCH 5] Position sizing engine
│   │   ├── agents/
│   │   │   ├── orchestrator.ts
│   │   │   ├── eventDetector.ts
│   │   │   ├── biasClassifier.ts
│   │   │   ├── sanityChecker.ts
│   │   │   └── historicalMatcher.ts
│   │   ├── notifications.ts
│   │   └── scanner.ts
│   ├── components/
│   │   ├── auth/
│   │   │   └── PasswordGate.tsx      # [FROM PATCH 1] Password protection
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── AppLayout.tsx
│   │   ├── dashboard/
│   │   │   ├── SignalCard.tsx
│   │   │   ├── SignalFeed.tsx
│   │   │   ├── MarketPulse.tsx
│   │   │   ├── ActiveAlerts.tsx
│   │   │   ├── StatsOverview.tsx
│   │   │   └── PortfolioOverview.tsx  # [FROM PATCH 5] Portfolio summary
│   │   ├── analysis/
│   │   │   ├── StockAnalysis.tsx
│   │   │   ├── BiasBreakdown.tsx
│   │   │   ├── EventTimeline.tsx
│   │   │   ├── HistoricalPrecedent.tsx
│   │   │   ├── AgentReasoning.tsx
│   │   │   ├── FundamentalSnapshot.tsx
│   │   │   ├── PositionSizeCard.tsx   # [FROM PATCH 5] Position sizing UI
│   │   │   └── SignalJournal.tsx      # [FROM PATCH 7] Journal component
│   │   ├── watchlist/
│   │   │   ├── WatchlistManager.tsx
│   │   │   └── WatchlistItem.tsx
│   │   ├── backtest/
│   │   │   ├── BacktestDashboard.tsx
│   │   │   ├── BiasPerformance.tsx
│   │   │   └── OutcomeTracker.tsx
│   │   └── shared/
│   │       ├── Badge.tsx
│   │       ├── Sparkline.tsx
│   │       ├── LoadingState.tsx
│   │       ├── EmptyState.tsx
│   │       └── ConfidenceMeter.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Analysis.tsx
│   │   ├── Watchlist.tsx
│   │   ├── Backtest.tsx
│   │   ├── Settings.tsx
│   │   ├── Scanner.tsx
│   │   └── Journal.tsx               # [FROM PATCH 7] Dedicated journal page
│   ├── stores/
│   │   ├── signalStore.ts
│   │   ├── watchlistStore.ts
│   │   └── settingsStore.ts
│   └── utils/
│       ├── formatters.ts
│       ├── biasHelpers.ts
│       ├── marketUtils.ts
│       ├── auth.ts                    # [FROM PATCH 1] Password hashing & session
│       ├── costEstimator.ts           # [FROM PATCH 2] API cost estimation
│       └── responseValidator.ts       # [FROM PATCH 6] Hallucination guardrails
├── supabase/
│   ├── migrations/
│   └── functions/
│       ├── proxy-gemini/
│       │   └── index.ts               # [FROM PATCH 1] Gemini API proxy
│       ├── proxy-market-data/
│       │   └── index.ts               # [FROM PATCH 1] Market data API proxy
│       └── send-alert-email/
│           └── index.ts
├── .env.example
├── .env.local
├── .gitignore
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── vercel.json
```

## [PATCH 1] Password Gate

Create a client-side password gate that protects the entire app.

**`src/components/auth/PasswordGate.tsx`:**
- Full-screen dark-themed login page
- Single password input + "Enter Sentinel" button
- Password stored as hashed value in env var: `VITE_APP_PASSWORD_HASH` (SHA-256)
- On submit, hash entered password client-side and compare
- Valid session stored in localStorage with 7-day expiry
- "Lock" button in header to manually log out
- Wrong password: red shake animation + "Incorrect password"

**`src/utils/auth.ts`:**
- hashPassword(), validateSession(), createSession(), destroySession()

**Wrap in App.tsx:**
```typescript
function App() {
  const isAuthenticated = validateSession();
  if (!isAuthenticated) return <PasswordGate />;
  return <AppLayout>...</AppLayout>;
}
```

## [PATCH 1] API Key Proxying via Supabase Edge Functions

Move ALL external API calls server-side so keys never reach the browser.

**`supabase/functions/proxy-gemini/index.ts`:**
- Accepts: { model, prompt, useGroundedSearch, responseSchema }
- Calls Gemini API using server-side `GEMINI_API_KEY`
- Default model: **gemini-3-flash**
- Logs token usage to `api_usage` table
- Rate limits: max 30 calls per minute per client
- Validates Authorization header for Supabase JWT

**`supabase/functions/proxy-market-data/index.ts`:**
- Accepts: { action, ticker, params }
- Calls Polygon.io using server-side `MARKET_DATA_API_KEY`
- Rate limits: max 5 calls per minute
- Caches responses in Supabase

**Client-side `.env.local` — only these remain:**
```
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_APP_PASSWORD_HASH=sha256_hash_of_your_password
```

**Server-side (Supabase Dashboard → Edge Function Secrets):**
```
GEMINI_API_KEY=your_gemini_api_key
MARKET_DATA_API_KEY=your_polygon_or_alphavantage_key
MARKET_DATA_PROVIDER=polygon
NOTIFICATION_EMAIL=your_email@example.com
RESEND_API_KEY=your_resend_key
```

**Design System (dark trading terminal theme):**
- Background: #0a0a0f | Surface: #12121a | Surface elevated: #1a1a2e
- Border: #2a2a3e | Text primary: #e8e8f0 | Text secondary: #8888a0
- Green (bullish): #00d4aa | Red (bearish): #ff4757 | Blue (info): #4a9eff
- Amber (warning): #ffb347 | Purple (bias): #a855f7
- Font: Inter (body) + JetBrains Mono (numbers/code)

**Routing:**
- `/` → Dashboard | `/analysis/:ticker` → Analysis | `/watchlist` → Watchlist
- `/backtest` → Backtest | `/scanner` → Scanner | `/settings` → Settings
- `/journal` → Journal [FROM PATCH 7]

Generate every file with TypeScript types, imports, and placeholder implementations. Service files include function signatures with JSDoc and `// TODO: Implement in Stage X`.
```

---
---

# STAGE 2: DATABASE SCHEMA & CONFIGURATION
### Original Stage 2 + Patch 2 (Cost Tracking) + Patch 5 (Portfolio tables) + Patch 7 (Journal table) + Patch 8 (RSS Cache)

## Overview
Creates the complete database schema including all original tables PLUS: `api_usage` (Patch 2), `portfolio_config` and `positions` (Patch 5), `journal_entries` (Patch 7), and `rss_cache` (Patch 8).

## Prompt

```
You are a Supabase and PostgreSQL expert. Create the complete database schema for "Sentinel."

## Tables to Create

### 1. `watchlist` — Tracked tickers and sector assignments
(Same as original — see original Stage 2 for full schema)

### 2. `market_events` — Raw detected events
(Same as original)

### 3. `signals` — AI-processed trading signals
(Same as original)

### 4. `signal_outcomes` — Tracks what happened after each signal
(Same as original)

### 5. `scan_logs` — Operational pipeline logs
(Same as original)

### 6. `app_settings` — Key-value configuration store
(Same as original)

### 7. `api_usage` — [FROM PATCH 2] API cost tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK, default gen_random_uuid() | Unique ID |
| provider | text | NOT NULL | 'gemini_flash', 'gemini_pro', 'polygon', 'alphavantage' |
| endpoint | text | NOT NULL | Specific endpoint/model called |
| agent_name | text | | Which agent made this call |
| ticker | text | | Which ticker this call was for |
| input_tokens | integer | default 0 | Tokens sent |
| output_tokens | integer | default 0 | Tokens received |
| grounded_search_used | boolean | default false | Whether Grounded Search was used |
| estimated_cost_usd | numeric(10,6) | default 0 | Estimated cost in USD |
| latency_ms | integer | | How long the call took |
| success | boolean | default true | Whether the call succeeded |
| error_message | text | | Error details if failed |
| created_at | timestamptz | default now() | |

Indexes: `api_usage(provider, created_at DESC)`, `api_usage(created_at DESC)`, `api_usage(agent_name, created_at DESC)`

### 8. `portfolio_config` — [FROM PATCH 5] Portfolio settings

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK | |
| total_capital | numeric(14,2) | NOT NULL | Total trading capital |
| max_position_pct | numeric(5,2) | default 10.00 | Max % in single position |
| max_total_exposure_pct | numeric(5,2) | default 50.00 | Max % deployed at once |
| max_sector_exposure_pct | numeric(5,2) | default 25.00 | Max % in one sector |
| max_concurrent_positions | integer | default 5 | Max open positions |
| risk_per_trade_pct | numeric(5,2) | default 2.00 | Max % risked per trade |
| kelly_fraction | numeric(5,2) | default 0.25 | Quarter Kelly for safety |
| updated_at | timestamptz | default now() | |

### 9. `positions` — [FROM PATCH 5] Position tracking

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK | |
| signal_id | uuid | FK → signals.id | Originating signal |
| ticker | text | NOT NULL | |
| status | text | default 'planned' | 'planned', 'open', 'closed' |
| side | text | NOT NULL | 'long' or 'short' |
| entry_price | numeric(12,4) | | Actual entry |
| exit_price | numeric(12,4) | | Actual exit |
| shares | integer | | Number of shares |
| position_size_usd | numeric(12,2) | | Dollar amount |
| position_pct | numeric(5,2) | | % of portfolio |
| realized_pnl | numeric(12,2) | | P&L in USD |
| realized_pnl_pct | numeric(8,4) | | P&L as % |
| opened_at | timestamptz | | |
| closed_at | timestamptz | | |
| close_reason | text | | 'target_hit', 'stopped_out', 'manual', 'expired' |
| notes | text | | |

### 10. `journal_entries` — [FROM PATCH 7] Signal journal

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK | |
| signal_id | uuid | FK → signals.id, nullable | Associated signal |
| ticker | text | | Relevant ticker |
| entry_type | text | NOT NULL | 'thesis', 'observation', 'lesson', 'mistake', 'win_analysis', 'market_note' |
| content | text | NOT NULL | The journal entry |
| mood | text | | 'confident', 'uncertain', 'fearful', 'greedy', 'calm', 'excited' |
| tags | text[] | default '{}' | Custom tags |
| created_at | timestamptz | default now() | |

### 11. `rss_cache` — [FROM PATCH 8] Cached RSS articles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | uuid | PK | |
| feed_name | text | NOT NULL | |
| feed_category | text | NOT NULL | |
| title | text | NOT NULL | |
| link | text | NOT NULL UNIQUE | Deduplicate by URL |
| published_at | timestamptz | | |
| description | text | | |
| tickers_mentioned | text[] | default '{}' | Extracted ticker symbols |
| keywords | text[] | default '{}' | Extracted keywords |
| fetched_at | timestamptz | default now() | |
| expires_at | timestamptz | default (now() + interval '24 hours') | |

Indexes: GIN on `tickers_mentioned`, GIN on `keywords`, `expires_at`

## Seed Data for `app_settings`

Include all original seed data PLUS these additions from patches:
- `daily_budget_usd`: 2.00 [PATCH 2]
- `monthly_budget_usd`: 30.00 [PATCH 2]
- `budget_alert_threshold_pct`: 80 [PATCH 2]
- `pause_on_budget_exceeded`: true [PATCH 2]
- `auto_calibrate_weights`: true [PATCH 4]
- `rss_enabled`: true [PATCH 8]
- `rss_fetch_interval_minutes`: 10 [PATCH 8]
- `rss_max_article_age_hours`: 24 [PATCH 8]
- `rss_relevance_threshold`: 0.3 [PATCH 8]

Generate complete SQL migration files and TypeScript types matching the schema.
```

---
---

# STAGE 3: GEMINI API CLIENT & PROMPT TEMPLATES
### Original Stage 3 + Patch 6 (Hallucination Guardrails)

## Overview
Builds the Gemini API client configured for **Gemini 3 Flash** as the default model, all prompt templates, and hallucination prevention guardrails.

## Prompt

```
Build the complete Gemini integration layer for Sentinel.

## CRITICAL: Model Configuration
- Default model everywhere: **gemini-3-flash**
- Use gemini-3-flash for ALL agents: event detection, bias classification, sanity checking, historical matching, and signal synthesis
- Enable Google Search grounding tool when real-time web data is needed (Event Detector, Sanity Checker, Historical Matcher)
- Use standard generation (no search) for agents that just need reasoning (Bias Classifier, Signal Synthesizer)

## `src/services/gemini.ts` — Core Client

The client calls the proxy Edge Function (from Stage 1), NOT the Gemini API directly:
```typescript
const response = await supabase.functions.invoke('proxy-gemini', {
  body: { model: 'gemini-3-flash', prompt, useGroundedSearch, responseSchema }
});
```

Support: structured JSON output, streaming, retry with backoff, token tracking, rate limiting.

## `src/services/gemini-prompts.ts` — Prompt Templates

All 5 prompt templates (EVENT_DETECTION, BIAS_CLASSIFICATION, SANITY_CHECK, HISTORICAL_MATCH, SIGNAL_SYNTHESIS) as defined in the original Stage 3.

## [PATCH 6] Hallucination Guardrails — Add to ALL prompts:

"""
CRITICAL — ACCURACY AND HONESTY RULES:
1. If you cannot verify a specific statistic, say "unverified" or "approximate" rather than stating as fact.
2. Never fabricate specific numbers. If found via search, cite the source. If estimating, label it.
3. If search results are sparse or contradictory, say so explicitly.
4. Distinguish between: (a) facts from grounded search, (b) analytical reasoning, (c) speculation. Label each.
5. When describing historical events, include the source URL. If no source, don't describe the event.
"""

## [PATCH 6] Response Validator — `src/utils/responseValidator.ts`

```typescript
export class ResponseValidator {
  validateStatistics(response: any): ValidationResult { }
  validateSourceUrls(response: any, groundingMetadata: any): ValidationResult { }
  flagUngroundedClaims(response: any, groundingMetadata: any): string[] { }
  validateConfidence(response: any): ValidationResult { }
}
```
- Flag win rates above 95% or below 5% as suspicious
- Flag exact historical statistics not backed by a source URL
- Flag confidence scores above 90 when evidence is thin
- Log warnings (don't block)

Generate all files with complete implementations.
```

---
---

# STAGE 4: MARKET DATA INTEGRATION
### Original Stage 4 (unchanged)

## Overview
Builds the market data service layer via the proxy Edge Function. Connects to Polygon.io (primary) or Alpha Vantage (fallback). The client calls `proxy-market-data` Edge Function instead of APIs directly.

## Prompt
(Same as original Stage 4, but update client code to call Edge Function proxy instead of direct API calls)

```
Build the complete market data service for Sentinel.

**IMPORTANT:** All API calls go through the proxy-market-data Edge Function:
```typescript
const response = await supabase.functions.invoke('proxy-market-data', {
  body: { action: 'quote', ticker: 'NVDA' }
});
```

(Full MarketDataService class, provider abstraction, caching, rate limiting, error handling — same as original Stage 4)
```

---
---

# STAGE 5: AI AGENT PIPELINE, ORCHESTRATOR & INTEGRATIONS
### Original Stage 5 + Patch 3 (Outcome Tracking) + Patch 4 (Feedback Loop) + Patch 8 (RSS Intelligence)

## Overview
Builds the complete multi-agent system with three critical additions: automated outcome tracking, internal feedback loop, and RSS-first event detection.

## Prompt

```
Build the complete agent pipeline for Sentinel using **Gemini 3 Flash** for all agents.

## Agent Pipeline Architecture

```
Input: Ticker + Watchlist Config
    ↓
[0] RSS Cache Check (NEW — Patch 8)
    → Check rss_cache for recent articles mentioning this ticker
    ↓
[1] Event Detector Agent (Gemini 3 Flash + optional Grounded Search)
    → If RSS articles found: pass as context, skip Grounded Search (saves money)
    → If no RSS articles: use Grounded Search fallback
    ↓
[2] Bias Classifier Agent (Gemini 3 Flash)
    → Analyzes event for cognitive biases
    ↓
[3] Sanity Checker Agent (Gemini 3 Flash + Grounded Search)
    → Validates fundamentals, has VETO power
    ↓
[4] Historical Matcher Agent (Gemini 3 Flash + Grounded Search)
    → First checks Sentinel's OWN signal_outcomes data [PATCH 4]
    → If 5+ internal matches: use those, SKIP Grounded Search
    → If <5 internal matches: supplement with Grounded Search
    ↓
[5] Signal Synthesizer (Gemini 3 Flash)
    → Combines all outputs, includes internal performance context [PATCH 4]
    ↓
[6] Store in Supabase + Trigger Notifications + Initialize Outcome [PATCH 3]
```

## [PATCH 8] RSS-First Event Detection

Update Event Detector to check RSS cache BEFORE Grounded Search:
- If `rssReader.findArticlesForTicker()` returns results → pass as context to regular Gemini call (cheap)
- If no RSS results → fallback to Grounded Search (expensive)
- Expected savings: 40-60% fewer Grounded Search calls
- Track source ('rss' vs 'grounded_search') in api_usage table

## [PATCH 3] Automated Outcome Tracking

Build `src/services/outcomeTracker.ts`:
- After orchestrator `persistSignal()`, call `outcomeTracker.initializeOutcome(signal)`
- On each scan cycle, after main pipeline, call `outcomeTracker.trackOutcomes()`
- Updates price_at_1d/5d/10d/30d fields as days elapse
- Determines outcome: 'win', 'loss', 'breakeven', 'pending'
- Detects stop loss / target hits
- Auto-expires signals after 30 days
- Handles market holidays, stock splits, delisted stocks

## [PATCH 4] Feedback Loop

Build `src/services/performanceStats.ts`:
- getWinRateByBias(), getWinRateBySector(), getConfidenceCalibration()
- getTopPerformingPatterns(), buildPerformanceContext()
- Inject performance context into Signal Synthesizer prompt
- Update Historical Matcher to check own data first
- Auto-calibrate bias weights every 10 new outcomes
- Generate weekly performance digest for Dashboard

## [PATCH 2] Cost Tracking Integration

Build `src/utils/costEstimator.ts`:
- Gemini 3 Flash pricing rates [CUSTOMIZE — check current pricing]
- getDailySpend(), getMonthlySpend(), getRemainingBudget(), isBudgetExceeded()
- Scanner checks budget before each cycle; if exceeded: pause + notify

## [PATCH 2] Smart Scan Prioritization

Not all tickers need the same scan frequency:
- **HIGH** (every cycle): unusual pre-market volume, active signal, recent event, >3% price move
- **MEDIUM** (every 2nd cycle): volatile sector news, earnings within 7 days
- **LOW** (every 3rd cycle): no unusual activity, no catalysts, stable price
- Reduces API calls by 40-60%

## RSS Feed Refresh Timer

Start RSS feed refresh on app load, refresh every 10 minutes:
```typescript
import { rssReader } from '@/services/rssReader';
rssReader.refreshFeeds(); // immediate
setInterval(() => rssReader.refreshFeeds(), 10 * 60 * 1000);
```

Generate ALL agent files, orchestrator, scanner, outcome tracker, performance stats, cost estimator, and RSS reader with complete implementations.
```

---
---

# STAGE 6: NOTIFICATION SYSTEM
### Original Stage 6 (unchanged)

## Overview
Browser push notifications + email via Supabase Edge Functions.

(Same as original Stage 6 prompt — no patches modify this stage)

---
---

# STAGE 7: DASHBOARD UI & SIGNAL FEED
### Original Stage 7 + Portfolio Overview (Patch 5) + Budget Widget (Patch 2)

## Overview
Main dashboard with signal feed, market pulse, active alerts, stats overview, **portfolio overview panel** (Patch 5), and **API budget widget** (Patch 2).

## Prompt

```
Build the Dashboard page for Sentinel.

(Include all original Stage 7 components)

## [PATCH 5] Portfolio Overview Panel — `src/components/dashboard/PortfolioOverview.tsx`

Add a portfolio summary panel showing:
- Total capital, current exposure %, open positions count
- List of open positions with ticker, side, P&L
- Unrealized + realized P&L
- Sector exposure breakdown
- "Manage →" link to settings

## [PATCH 2] Budget Widget (shown on Dashboard or Scanner page)

API Budget panel showing:
- Today's spend / daily budget with progress bar
- Month's spend / monthly budget with progress bar
- Call counts by provider
- Avg cost per scan cycle
- Estimated daily cost at current rate

## [PATCH 4] Weekly Performance Digest

Show a weekly digest card on the Dashboard:
- Signals generated, win rate, best/worst signal
- Top/worst performing bias type
- Improvement suggestions

Generate all components with complete implementations.
```

---
---

# STAGE 8: DEEP ANALYSIS PAGE & JOURNAL
### Original Stage 8 + Patch 5 (Position Sizing) + Patch 7 (Signal Journal)

## Overview
Per-ticker analysis page with all original panels PLUS position sizing card and structured journal.

## Prompt

```
Build the Analysis page for Sentinel at /analysis/:ticker.

(Include all original Stage 8 components: price chart, signal summary, bias breakdown, event timeline, historical precedents, agent reasoning, fundamental snapshot)

## [PATCH 5] Position Size Card — `src/components/analysis/PositionSizeCard.tsx`

Show suggested position size calculated via three methods (most conservative wins):
1. Fixed percentage of capital
2. Risk-based (stop loss distance)
3. Kelly criterion (if 10+ historical samples)

Display: suggested shares, size in USD, % of portfolio, methodology breakdown, risk metrics, current portfolio exposure, and action buttons: [Log Position as Planned] [Adjust Capital →]

## [PATCH 7] Signal Journal — `src/components/analysis/SignalJournal.tsx`

Replace simple "Personal Notes" textarea with structured journal:
- Entry types: thesis, observation, lesson, mistake, win_analysis, market_note
- Mood tracking: confident, uncertain, fearful, greedy, calm, excited
- Tag system for filtering
- Chronological display tied to each signal
- Quick entry form with type/mood selectors

Generate all components with complete implementations.
```

---
---

# STAGE 9: REMAINING PAGES
### Original Stage 9 + Patch 2 (Scanner Budget Widget) + Patch 7 (Journal Page)

## Overview
Builds Watchlist, Scanner (with budget widget), Backtest, Settings (with portfolio config), and dedicated Journal page.

## Prompt

```
Build the remaining pages for Sentinel.

## Page 1: Watchlist (same as original Stage 9)

## Page 2: Scanner Control (original + Patch 2 Budget Widget)
Include the API Budget widget panel on the Scanner page showing daily/monthly spend, call counts, and budget controls.

## Page 3: Backtest Dashboard (same as original Stage 9)

## Page 4: Settings (original + Patch 5 Portfolio Settings)
Add a section for portfolio configuration:
- Total capital, max position %, max exposure %, max sector %, risk per trade %
- Kelly fraction slider (0.1 to 0.5, with explanation)
- Max concurrent positions

## Page 5: Journal — `src/pages/Journal.tsx` [FROM PATCH 7]
Full-page view of all journal entries with:
- Search bar (full-text across all entries)
- Filter by: entry type, mood, tags, date range, ticker
- Calendar heatmap showing journaling frequency
- "Insights" panel: pattern matching mood vs. outcome data
- Export journal as markdown

Generate all pages with complete implementations.
```

---
---

# STAGE 10: DEPLOYMENT, OPTIMIZATION & POLISH
### Original Stage 10 (updated)

## Overview
Vercel deployment, code splitting, error boundaries, PWA, final polish.

(Same as original Stage 10, with these updates:)
- All Gemini model references → **gemini-3-flash**
- Environment variables list updated to match Patch 1 security model (no VITE_GEMINI_API_KEY etc.)
- Additional route for `/journal` page in code splitting

---
---

# LAUNCH CHECKLIST v2.0

## Pre-Build Setup
- [ ] Create Supabase project
- [ ] Enable Supabase Edge Functions
- [ ] Get Gemini API key (for Gemini 3 Flash)
- [ ] Get Polygon.io API key
- [ ] Create Vercel account
- [ ] Choose app password and generate SHA-256 hash

## Build Order
1. [ ] Stage 1: Scaffolding + security (password gate + API proxies)
2. [ ] Stage 2: Database schema (ALL tables including api_usage, portfolio, journal, rss_cache)
3. [ ] Stage 3: Gemini client + hallucination guardrails (Gemini 3 Flash)
4. [ ] Stage 4: Market data integration (via edge function proxy)
5. [ ] Stage 5: Agent pipeline + outcome tracking + feedback loop + RSS intelligence
6. [ ] Stage 6: Notification system
7. [ ] Stage 7: Dashboard UI + portfolio overview + budget widget
8. [ ] Stage 8: Analysis page + position sizing + journal
9. [ ] Stage 9: Remaining pages (watchlist, scanner, backtest, settings, journal)
10. [ ] Stage 10: Deployment, optimization, polish

## Pre-Launch Testing
- [ ] Password gate works
- [ ] Edge functions proxy API calls (no keys in browser)
- [ ] Scanner runs full cycle on 5 test tickers
- [ ] Signals generated and stored in Supabase
- [ ] Browser + email notifications fire
- [ ] Outcome tracker creates initial records
- [ ] Dashboard displays signals in real-time
- [ ] Analysis page loads full agent reasoning
- [ ] Watchlist CRUD works
- [ ] Portfolio config saves, position sizer calculates correctly
- [ ] Journal entries save and display
- [ ] Budget tracker logs API usage
- [ ] RSS feeds fetch and cache correctly
- [ ] Run 3-5 days in paper mode

## Post-Launch (First 2 Weeks)
- [ ] Monitor daily API spend
- [ ] Review first 20 signals for quality
- [ ] Journal reactions to each signal
- [ ] Check outcome tracking at 1d and 5d marks
- [ ] Tune confidence/price drop thresholds

## Ongoing (Monthly)
- [ ] Review backtest dashboard
- [ ] Check confidence calibration
- [ ] Let auto-calibration adjust bias weights
- [ ] Prune inactive watchlist tickers
- [ ] Review journal for decision-making patterns
- [ ] Evaluate API costs

---

# APPENDIX A: COGNITIVE BIASES REFERENCE
(Same as original — see original prompt plan Appendix A)

# APPENDIX B: KOTEGAWA-STYLE PATTERN REFERENCE
(Same as original — see original prompt plan Appendix B)

# APPENDIX C: GEMINI 3 FLASH — IMPLEMENTATION NOTES

```typescript
// Enabling Grounded Search with Gemini 3 Flash:
const model = genAI.getGenerativeModel({
  model: "gemini-3-flash",
  tools: [{ googleSearch: {} }],
});

// Accessing Grounding Metadata:
const sources = response.candidates[0]
  .groundingMetadata
  ?.groundingChunks
  ?.map(chunk => ({
    url: chunk.web?.uri,
    title: chunk.web?.title
  }));
```

**Cost Consideration:** Grounded Search costs more than standard generation. Use it only for agents needing real-time web data, and leverage the RSS cache (Patch 8) to minimize these calls.

---

*End of Sentinel Consolidated Plan v2.0*
*Sentinel-Spec (RSS Intelligence Feed) remains a separate document.*
