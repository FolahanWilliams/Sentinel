# Sentinel Codebase Audit Report

**Date:** 2026-03-04
**Scope:** Full codebase audit — ~130 TypeScript/TSX files, 5 Edge Functions, 7 migrations
**TypeScript Compilation:** PASSES (`npx tsc --noEmit` — zero errors)

---

## Executive Summary

The Sentinel codebase has a well-organized directory structure and compiles cleanly under strict TypeScript. However, the audit uncovered **16 critical**, **31 major**, and **~60 minor** issues across security, data integrity, architecture, and UX. The most urgent findings are:

1. **Wide-open RLS policies** — every core database table is publicly readable/writable by anonymous users
2. **No authentication on Edge Functions** — proxy-rss and sentinel have zero auth checks; proxy-gemini and proxy-market-data only check header *presence*, not validity
3. **Prompt injection vulnerability** — user-controlled strings interpolated directly into Gemini prompts
4. **Duplicate/unsynchronized state management** — signals, watchlist, and settings each have both a Zustand store AND a hook with independent state
5. **Zero test infrastructure** — no test runner, no test files, no test CI step
6. **AI-driven database writes without user confirmation** — the AnalystChat can insert positions and journal entries based on AI responses

---

## CRITICAL Issues (16)

### Security

#### C1. All RLS Policies Grant Full Anonymous Access
**File:** `supabase/migrations/20260301220000_add_core_rls_policies.sql`

Every core table (`watchlist`, `signals`, `signal_outcomes`, `positions`, `journal_entries`, `portfolio_config`, `app_settings`, etc.) has `USING (true)` / `WITH CHECK (true)` for the anonymous role. The anon key is embedded in the frontend bundle and trivially extractable. **Any unauthenticated user can read, write, and delete all data.**

The later migration `20260301224200_enable_auth_rls.sql` adds `authenticated` policies but **does not remove the anonymous ones**, so both remain active.

#### C2. SSRF Vulnerability in proxy-rss Edge Function
**File:** `supabase/functions/proxy-rss/index.ts:16-27`

The `feedUrl` parameter is taken directly from the request body with zero validation. An attacker can supply internal network addresses (`http://169.254.169.254/...`), `file://` URLs, or localhost probes. No allowlist, scheme validation, or domain restriction exists.

#### C3. No Authentication on proxy-rss and sentinel Edge Functions
**Files:** `supabase/functions/proxy-rss/index.ts`, `supabase/functions/sentinel/index.ts`

These functions perform **no authentication check whatsoever**. Combined with the SSRF above, proxy-rss is an open proxy. The sentinel function triggers expensive Gemini API calls and database writes using the service role key — anyone can exhaust the API budget.

#### C4. Auth Validation Is Cosmetic on proxy-gemini, proxy-market-data, and send-alert-email
**Files:** `supabase/functions/proxy-gemini/index.ts:20-23`, `supabase/functions/proxy-market-data/index.ts:35-38`, `supabase/functions/send-alert-email/index.ts:23-26`

All three functions check only that the `Authorization` header **exists** — they never verify the JWT or validate the token. `Authorization: literally-anything` passes the check.

#### C5. All Edge Functions Deployed with `--no-verify-jwt`
**File:** `.github/workflows/supabase-migrations.yml:68`

The CI deployment script deploys **every** Edge Function with `--no-verify-jwt`, bypassing Supabase's built-in JWT verification. This contradicts `supabase/config.toml` which sets `verify_jwt = true`.

#### C6. XSS via HTML Injection in send-alert-email
**File:** `supabase/functions/send-alert-email/index.ts:39-49`

User-supplied values (`ticker`, `signalType`, `thesis`) are interpolated directly into HTML email bodies without sanitization. The `thesis` field is free-form text originating from AI — a crafted thesis could inject malicious HTML/JavaScript.

#### C7. API Key Exposed in URL Query Parameter
**Files:** `supabase/functions/proxy-gemini/index.ts:82`, `supabase/functions/sentinel/index.ts:239`

The Gemini API key is passed as a URL query parameter (`?key=${GEMINI_API_KEY}`). URLs with query parameters are commonly logged by proxies, CDNs, and load balancers. Should use request headers instead.

#### C8. Model Name Injection in proxy-gemini
**File:** `supabase/functions/proxy-gemini/index.ts:82`

The `model` parameter from the client is interpolated directly into the API URL path with no validation. An attacker could request expensive models or perform path traversal.

### Data Integrity

#### C9. Prompt Injection in All Agent Methods
**File:** `src/services/agents.ts:32-143`

All agent methods directly interpolate user-controlled strings (`eventHeadline`, `eventDesc`, `ticker`, `guidanceDetails`, `originalThesis`) into Gemini prompts without sanitization. Malicious RSS feed titles could override prompt instructions.

#### C10. AI-Driven Database Writes Without User Confirmation
**File:** `src/components/analysis/AnalystChat.tsx:299-343`

The AI response can trigger direct database inserts (`positions`, `journal_entries`) without explicit user confirmation. Hallucinated or misinterpreted responses could create incorrect financial records with no undo mechanism.

#### C11. Position Sizing Uses Confidence Score as Win Rate
**File:** `src/components/analysis/PositionSizeCard.tsx:40-41`

`winRate = confidenceScore / 100` equates AI confidence with actual win probability. A Kelly Criterion calculation using an inflated "win rate" recommends dangerously large position sizes.

#### C12. Hardcoded Fallback Prices Mask Real Failures
**File:** `src/services/scanner.ts:339,350,377`

When market data API fails, the scanner uses a hardcoded price of `$100` and a drop of `-10%`. The overreaction agent then generates buy signals based on **entirely fabricated data**.

### Architecture

#### C13. No Error Boundaries Anywhere in the Application
**Files:** `src/App.tsx`, `src/components/layout/AppLayout.tsx`

No React Error Boundary exists in the component tree. A single unhandled render error crashes the entire application with a white screen.

#### C14. Duplicate `TradingSignal` Type — Name Collision
**Files:** `src/types/signals.ts:103` and `src/types/sentinel.ts:52`

Both files export `TradingSignal` but they are completely different types. The barrel `index.ts` re-exports the signals version while sentinel components import the other. This creates silent type confusion.

#### C15. No Wildcard Route (404 Page)
**File:** `src/App.tsx`

No `<Route path="*" />` catch-all exists. Unmatched URLs render a blank page with no user feedback.

#### C16. Missing `/analysis` Base Route
**File:** `src/App.tsx:67`

Only `/analysis/:ticker` is defined. Navigating to `/analysis` (no ticker) shows a blank screen.

---

## MAJOR Issues (31)

### Security & Infrastructure

| # | Issue | Location |
|---|-------|----------|
| M1 | No rate limiting on any Edge Function | All 5 Edge Functions |
| M2 | No test infrastructure (zero tests, no runner, no CI step) | Project-wide |
| M3 | Missing `Content-Security-Policy` and `Strict-Transport-Security` headers | `vercel.json` |
| M4 | ESLint not run in CI despite being installed | `.github/workflows/ci.yml` |
| M5 | No ESLint config file exists | Project root |
| M6 | `.gitignore` doesn't cover `.env.production`, `.env.staging`, etc. | `.gitignore` |
| M7 | Weak password policy — 6 chars, no complexity requirements | `supabase/config.toml:175-178` |
| M8 | Env var validation silently continues with empty strings | `src/config/env.ts:22-29` |
| M9 | Production sourcemaps expose full source code | `vite.config.ts:22` |

### State Management & Data Flow

| # | Issue | Location |
|---|-------|----------|
| M10 | Duplicate state: `useSignals` hook + `signalStore` + `useRealtimeSignals` + `usePotentialSignals` — none synchronized | Hooks + stores |
| M11 | Duplicate state: `useWatchlist` hook + `watchlistStore` — never synchronized | `src/hooks/useWatchlist.ts`, `src/stores/watchlistStore.ts` |
| M12 | Duplicate state: `useAppSettings` hook + `settingsStore` — never synchronized | `src/hooks/useAppSettings.ts`, `src/stores/settingsStore.ts` |
| M13 | No Zustand store persistence — all settings/state lost on page refresh | All 3 stores |
| M14 | No abort/cancellation on unmount in 10+ hooks | `useMarketData`, `useSignals`, `useWatchlist`, etc. |

### Services & Business Logic

| # | Issue | Location |
|---|-------|----------|
| M15 | No timeout on any external API call (Gemini, market data, RSS) | All service files |
| M16 | No retry logic on any external API call | All service files |
| M17 | Duplicate notification dispatch — users get 2 emails per signal | `src/services/scanner.ts:402-422` |
| M18 | Race condition in outcome tracker — no locking, concurrent instances double-update | `src/services/outcomeTracker.ts:32-116` |
| M19 | N+1 database queries in outcome tracker (3 queries per pending outcome) | `src/services/outcomeTracker.ts:32-116` |
| M20 | `reflectionAgent` filter uses OR instead of AND — returns irrelevant lessons | `src/services/reflectionAgent.ts:198` |
| M21 | Sharpe ratio annualization assumes daily returns but uses per-trade returns | `src/services/backtestEngine.ts:268-272` |
| M22 | `backtestEngine` "best" horizon picks longest, not highest return | `src/services/backtestEngine.ts:96-98` |
| M23 | Unbounded `.in()` queries will fail at scale (URL length limit) | `src/services/performanceStats.ts:53-58` |
| M24 | Scanner error handler updates ALL running scan logs, not just current | `src/services/scanner.ts:573-576` |
| M25 | Memory cache in `marketData.ts` grows without bound | `src/services/marketData.ts:14-21` |

### Components & UX

| # | Issue | Location |
|---|-------|----------|
| M26 | Pervasive `any` types across all pages — TypeScript safety undermined | All page components |
| M27 | Silent error swallowing — data fetch failures show empty states, not errors | `Analysis.tsx`, `Dashboard.tsx`, `Journal.tsx`, `Watchlist.tsx` |
| M28 | Lock button doesn't call `supabase.auth.signOut()` — non-functional | `src/components/layout/Header.tsx:30-33` |
| M29 | Market status permanently shows "Market Closed" | `src/components/layout/Header.tsx:45-49` |
| M30 | PortfolioOverview shows `realized_pnl` for open positions (always 0) | `src/components/dashboard/PortfolioOverview.tsx:151-152` |
| M31 | PositionSizeCard R:R ratio divides by zero when `currentPrice === stopLoss` | `src/components/analysis/PositionSizeCard.tsx:58-60` |

### Database

| # | Issue | Location |
|---|-------|----------|
| M32 | Missing indexes on 11+ frequently queried columns | `supabase/migrations/20260301204003_initial_schema.sql` |
| M33 | `costEstimator` fetches all rows client-side for SUM aggregation | `src/utils/costEstimator.ts:40-63` |

---

## MINOR Issues (~60)

### Duplicate Code & Inconsistency

- **3 duplicate `timeAgo` implementations** — `formatters.ts`, `sentinel-helpers.ts`, `sentinelHelpers.ts`
- **3 duplicate `CATEGORY_COLORS` definitions** — `constants.ts`, `sentinel-helpers.ts`, `sentinelHelpers.ts`
- **Duplicate sentinel helper files** — `sentinel-helpers.ts` vs `sentinelHelpers.ts` with overlapping but different implementations
- **Inconsistent category taxonomies** — `RSSCategory` (11 values), `ArticleCategory` (11 values), `FeedCategory` (13 values) — none map to each other
- **`RSSFeedConfig.category` typed as `string`** instead of using `RSSCategory`
- **Scanner components use hardcoded colors** (`bg-[#111]`, `border-gray-800`) instead of `sentinel-*` design tokens
- **Badge component uses inline styles** while rest of app uses Tailwind
- **Inconsistent naming** — `snake_case` in events.ts, mixed `camelCase`/`snake_case` in market.ts and sentinel.ts

### Type System Gaps

- **Type mismatch: `description` nullability** — `MarketEvent.description` is `string` but DB column is `string | null`
- **Type mismatch: `severity` field** — domain type is `1-10` literal union, DB type is `number`
- **Type mismatch: `source_type`** — domain type is `'rss' | 'grounded_search'`, DB type is `string`
- **Database types use loose `string`** for all enum-like fields (signal_type, status, risk_level, bias_type, etc.)
- **Incomplete barrel exports** — `src/types/index.ts` omits many types; all sentinel types missing
- **`sentinel.ts` types not re-exported** from the barrel at all
- **`Quote.timestamp` typed as `Date`** but database uses `string`

### Hook & State Issues

- **Memory leak: `useToast` setTimeout never cleaned up** on manual dismiss
- **Race condition: `useMarketData` uses `tickers.join(',')` as useCallback dependency** (anti-pattern)
- **Race condition: `usePortfolio` stale closure** reads stale `config` in catch block
- **`useScannerLogs` mounted guard is ineffective** — checked synchronously right after being set to `true`
- **`useNotifications` resets all items to `read: false`** on every fetch, read state never persisted
- **`useDashboardStats` makes 3 sequential queries** on every realtime signal change (should parallelize + debounce)
- **`usePortfolio` re-fetches everything** on any change to positions or portfolio_config (no debounce)
- **`usePortfolio` derived arrays** (`openPositions`, `closedPositions`) computed on every render (should use `useMemo`)
- **`useMarketSnapshot` and `useMarketTrends` call `getCached()` twice** on initialization
- **`useMarketTrends` error handler** reads stale `data` via closure (should use callback form of setState)
- **`useTickerAnalysis` unbounded cache** — module-level Map + sessionStorage grows indefinitely
- **No debouncing on realtime-triggered refetches** — batch operations trigger N full refetches
- **`signalStore.addSignal` grows unboundedly** with no upper limit
- **`settingsStore.updateSetting` allows setting `updateSetting` itself** (key constraint too broad)

### Component Issues

- **Watchlist `toggleActive` click propagation bug** — click toggles AND navigates to analysis
- **AnalystChat session storage stale after ticker change** — old ticker messages persist
- **TradingViewChart doesn't destroy widget instance** — WebSocket/memory leak on ticker change
- **TradingViewChart loads CDN script without SRI** — compromised CDN could inject JS
- **SignalToast timer reset** — new signals restart timers for all existing toasts
- **CalendarHeatmap timezone mismatch** — `toISOString()` is UTC but entries are local time
- **MarketSnapshot sparkline data is synthetic** — fabricated from current price, not real intraday data
- **NewsFeed re-triggers `setLoading(true)`** every 5 minutes even with no changes
- **Journal PnL parsed via regex** from content field — fragile, should use DB columns
- **Positions page accepts 0 shares at $0.00** — no input validation
- **Settings save provides no success/error feedback** — ignores returned error
- **Closed positions truncated to 10** with no pagination or indication
- **`window.confirm()` used for destructive actions** instead of a modal
- **Backtest equity curve SVG has no accessibility** attributes
- **`FundamentalSnapshot` uses industry-agnostic thresholds** (P/E < 20 = "good" for all sectors)
- **`backtestEngine` treats breakeven trades as losses** (`pnlUsd > 0` excludes exact zero)

### Accessibility

- **No `role="dialog"`, `aria-modal`, or focus trap** on any modal (Positions, AnalystChat, OnboardingOverlay)
- **No `aria-live` regions** for toast notifications, loading states, or chat messages
- **No keyboard navigation** for expandable signal rows, calendar heatmap cells, command palette
- **Missing `aria-label`** on scanner buttons, filter buttons, toggle switches
- **`ConfidenceMeter` missing** `role="progressbar"`, `aria-valuenow`
- **`DonutChart` returns `null`** for zero total — no empty state
- **`Sparkline` returns `null`** for single data point — no fallback

### Dead Code

- **`PasswordGate.tsx`** — entirely unused, replaced by `AuthGate`
- **Scanner header buttons** (Play, Pause, Refresh) — render but have no `onClick` handlers
- **`errors` array in `scanner.ts`** — pushed to but never returned or logged
- **`QuickActions` test notification** — uses `window.alert()` stub
- **Multiple unused type definitions** — `FundamentalData`, `MarketDataProvider`, `HistoricalParams`, `ScanLogEntry`

### Other

- **`notifications.ts` imports from a UI component** — circular dependency risk
- **`schemas.ts` uses lowercase type names** but `reflectionAgent.ts` uses uppercase — inconsistency
- **RSS reader always stores `tickers_mentioned: []`** — ticker-based queries on RSS articles never return results
- **Contagion pipeline runs even when sanity check fails** — wastes API calls
- **Single-ticker scan uses lower confidence threshold (50 vs 75)** without user awareness
- **`proxy-market-data` logs provider as 'alpha-vantage'** even when Yahoo Finance fallback was used
- **SEC EDGAR URL has hardcoded `startdt=2025-01-01`** — will return increasingly stale data
- **RSS feed count is 44** but CLAUDE.md says 42

---

## Recommended Priority Actions

### Immediate (Security)

1. **Fix RLS policies** — drop anonymous `USING (true)` policies, require `auth.uid()` on all user-scoped tables
2. **Add real JWT verification** to all Edge Functions (use `supabase.auth.getUser()`)
3. **Remove `--no-verify-jwt`** from CI deployment script
4. **Add URL allowlist** to proxy-rss to prevent SSRF
5. **Sanitize HTML** in send-alert-email (escape all interpolated values)
6. **Move Gemini API key** to request headers instead of URL parameters
7. **Add model allowlist** to proxy-gemini

### Short-term (Data Integrity & Architecture)

8. **Add React Error Boundaries** around route groups
9. **Consolidate state management** — pick hooks OR Zustand stores for each domain (signals, watchlist, settings), not both
10. **Add input sanitization** for Gemini prompts (strip control sequences from user-supplied text)
11. **Remove hardcoded fallback prices** in scanner — fail explicitly when market data is unavailable
12. **Fix duplicate notification dispatch** in scanner
13. **Add 404 route** and `/analysis` base route
14. **Install Vitest** and add critical-path unit tests

### Medium-term (Quality & Reliability)

15. **Add timeouts and retry logic** to all external API calls (shared HTTP utility)
16. **Add CSP, HSTS, and Permissions-Policy** headers to Vercel config
17. **Create ESLint config** and add lint step to CI
18. **Replace `any` types** in page components with proper interfaces
19. **Add database indexes** on frequently queried columns
20. **Consolidate duplicate utility files** (`sentinel-helpers.ts` + `sentinelHelpers.ts` + `formatters.ts`)
21. **Fix accessibility** — add error boundaries, ARIA labels, keyboard navigation, focus traps

---

## Statistics

| Category | Critical | Major | Minor |
|----------|----------|-------|-------|
| Security | 8 | 4 | 3 |
| Data Integrity | 4 | 6 | 4 |
| Architecture | 4 | 5 | 12 |
| State Management | 0 | 5 | 14 |
| Components/UX | 0 | 6 | 16 |
| Types/Config | 0 | 2 | 8 |
| Accessibility | 0 | 0 | 7 |
| Dead Code | 0 | 0 | 5 |
| **Total** | **16** | **31** | **~60** |
