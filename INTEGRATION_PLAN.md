# Sentinel Cross-Feature Integration Plan — Full Implementation

## Overview

Eight feature workstreams implemented in 5 sequential batches. Each batch ends with a `npx tsc --noEmit` + `npm run build` verification gate. Features are ordered by dependency (foundational infrastructure first, then features that build on it).

---

## Batch 1: Foundation Infrastructure (Command Palette + Global Ticker Search + Cross-Page Deep Links)

These three are tightly coupled — the command palette IS the global search, and it needs deep links to navigate to.

### 1A. Enhanced Global Command Palette
**File: `src/components/shared/CommandPalette.tsx`** (existing — extend)

**Current state:** Basic ⌘K palette with static page commands + simple ticker search via ScannerService.

**Changes:**
1. **Add command categories with section headers:**
   - "Pages" — existing nav items (Dashboard, Scanner, Positions, etc.)
   - "Tickers" — live fuzzy search results from watchlist + recent tickers
   - "Actions" — Quick actions (New Position, Run Scan, Toggle Alerts)
   - "Recent" — Last 5 visited tickers (stored in localStorage)

2. **Improve ticker search:**
   - Query `watchlist` table for user's tickers first (instant, local)
   - Debounced (300ms) search via `ScannerService.searchTickers()` for external tickers
   - Show mini-context per ticker result: last price, daily change %, active signal count
   - Fetch mini-context from `MarketDataService.getQuote()` for top 5 results

3. **Add action commands:**
   - "Create Position for {ticker}" → navigates to `/positions?ticker={ticker}&prefill=true`
   - "Scan {ticker}" → navigates to `/?tab=intelligence&scan={ticker}`
   - "Analyze {ticker}" → navigates to `/analysis/{ticker}`
   - "Research {ticker}" → navigates to `/research/{ticker}`
   - "Add to Watchlist" → calls `useWatchlistStore.addTicker()`
   - "View News for {ticker}" → navigates to `/?tab=intelligence&q={ticker}`

4. **Keyboard shortcuts beyond ⌘K:**
   - Register global keydown listener in `AppLayout`
   - `G then D` → Dashboard, `G then P` → Positions, `G then S` → Scanner, `G then W` → Watchlist, `G then I` → Intelligence, `G then R` → Risk, `G then J` → Journal
   - `N` → New position (opens `/positions?prefill=true`)
   - `Escape` → Close any open drawer/modal

5. **UI enhancements:**
   - Group results by category with gray section headers
   - Show keyboard shortcut hints on right side of each result
   - Highlight matched characters in fuzzy search
   - Show "No results" state with suggestion to try different query
   - Footer: "↑↓ Navigate • Enter Select • Esc Close"

**New file: `src/hooks/useRecentTickers.ts`**
- localStorage-backed hook for recent ticker history
- `addRecent(ticker)` — pushes to front, dedupes, max 10
- `getRecent()` — returns list
- Called from Analysis page, Research page, Scanner drawer on mount

**New file: `src/hooks/useKeyboardShortcuts.ts`**
- Global keyboard shortcut registry
- Chord support (G then D = two keystrokes within 500ms)
- Registered in `AppLayout`, cleaned up on unmount
- Disabled when input/textarea is focused

### 1B. Cross-Page Deep Links
**Files to modify:**
- `src/components/dashboard/SignalsSection.tsx` — ticker clicks → `/analysis/{ticker}`
- `src/components/dashboard/WatchlistSection.tsx` — ticker clicks → `/analysis/{ticker}`
- `src/components/sentinel/ArticleCard.tsx` — entity tag clicks → `/analysis/{ticker}`
- `src/components/dashboard/DashboardConvergence.tsx` — convergence ticker → `/analysis/{ticker}`
- `src/components/dashboard/HighConvictionSetups.tsx` — signal ticker → `/analysis/{ticker}`
- `src/components/dashboard/UnifiedPortfolioView.tsx` — position ticker → `/analysis/{ticker}`
- `src/pages/Positions.tsx` — position row ticker → `/analysis/{ticker}`
- `src/pages/Journal.tsx` — journal entry ticker → `/analysis/{ticker}`

**Pattern:** Create a shared `TickerLink` component:

**New file: `src/components/shared/TickerLink.tsx`**
- Renders a clickable ticker badge that navigates to `/analysis/{ticker}`
- Props: `ticker`, `className?`, `showQuote?` (shows live price on hover)
- Uses react-router's `useNavigate`
- Adds ticker to recentTickers on click
- Styled as inline monospace text with hover underline and subtle background

**Deep link URL parameters to support:**
- `/positions?ticker=AAPL&entry=150&side=long&shares=100&signal_id=xxx` — pre-fill position form
- `/analysis/{ticker}?from=signal&signal_id=xxx` — show originating signal context
- `/?tab=intelligence&q={ticker}` — filter news by ticker
- `/?tab=intelligence&scan={ticker}` — open scanner drawer for ticker
- `/?tab=signals&ticker={ticker}` — filter signals by ticker

### Batch 1 Verification
```bash
npx tsc --noEmit
npm run build
```
Fix any type errors. Test in browser: ⌘K opens palette, search tickers, navigate via deep links, keyboard shortcuts work.

---

## Batch 2: Portfolio-Aware News Highlighting + News-to-Portfolio Connection

These are two sides of the same coin — news knowing about portfolio, portfolio knowing about news.

### 2A. Portfolio-Aware News Highlighting
**File: `src/components/sentinel/SentinelPanel.tsx`** (modify)

**Changes:**
1. **Import `usePortfolio()` hook** at top of SentinelPanel
2. **Extract open position tickers** into a `Set<string>`:
   ```ts
   const portfolioTickers = useMemo(() =>
     new Set(openPositions.map(p => p.ticker)), [openPositions]);
   ```
3. **Add "My Portfolio" filter toggle** to FilterBar:
   - New button in FilterBar: "Portfolio" pill (like existing "High Impact" toggle)
   - When active, filters articles to only those where `article.entities` or `article.signals[].ticker` intersects `portfolioTickers`

4. **Highlight portfolio-relevant articles:**
   - In `ArticleCard`, check if any `article.entities` match `portfolioTickers`
   - If match: add left border accent (e.g., `border-l-4 border-emerald-500`)
   - Show small badge: "In Portfolio" next to impact badge
   - Show position context: "You hold 100 shares LONG" tooltip on hover

**File: `src/components/sentinel/ArticleCard.tsx`** (modify)

**Changes:**
1. Accept new prop: `portfolioPositions: Position[]` (or just `portfolioTickers: Set<string>`)
2. Check `article.entities` against portfolio tickers
3. If match found:
   - Render portfolio badge with position side (LONG/SHORT)
   - If article sentiment opposes position side (bearish article + long position), show amber warning: "Sentiment conflicts with your LONG position"
   - If article sentiment aligns, show green confirmation: "Aligns with your LONG position"

**File: `src/components/sentinel/FilterBar.tsx`** (modify)

**Changes:**
1. Add `portfolioFilter` boolean prop + `onPortfolioFilterChange` callback
2. Render "Portfolio" toggle button alongside existing filters
3. Style: filled when active, outlined when inactive (matching existing filter style)

### 2B. News-to-Portfolio Connection (Sentiment Divergence Warnings)

**New file: `src/services/sentimentDivergence.ts`**
```ts
// Compares news sentiment against open position bias
// Input: ProcessedArticle[], Position[]
// Output: SentimentDivergence[] {
//   ticker: string,
//   positionSide: 'long' | 'short',
//   articleSentiment: 'bullish' | 'bearish',
//   articleTitle: string,
//   articleId: string,
//   severity: 'warning' | 'critical',
//   message: string
// }
//
// Logic:
// - For each open position, find articles mentioning that ticker
// - If article.sentiment === 'bearish' && position.side === 'long' → warning
// - If article.sentiment === 'bullish' && position.side === 'short' → warning
// - If article.impact === 'high' → escalate to critical
// - Deduplicate by ticker (show most impactful article per ticker)
```

**File: `src/components/dashboard/UnifiedPortfolioView.tsx`** (modify)

**Changes:**
1. Import `useSentinel()` to get current articles
2. Run `checkSentimentDivergence(articles, openPositions)` in useMemo
3. If divergences found, render warning banner above positions table:
   - "News Alert: 2 positions have conflicting sentiment"
   - Expandable list showing each divergence with article link
   - Click article → navigate to `/?tab=intelligence&q={ticker}`

**File: `src/pages/Positions.tsx`** (modify)

**Changes:**
1. Import `useSentinel()` and `checkSentimentDivergence()`
2. Per-row sentiment indicator:
   - In position table row, if ticker has conflicting news → show amber dot
   - Tooltip on hover: "Recent bearish news detected — click to view"
   - Click navigates to intelligence tab filtered by that ticker

### Batch 2 Verification
```bash
npx tsc --noEmit
npm run build
```
Test: Open SentinelPanel with positions open, verify portfolio articles highlighted, sentiment warnings appear on conflicting news.

---

## Batch 3: Market Regime Indicator (UI) + Scanner-to-Positions Pipeline

### 3A. Market Regime Indicator (Dashboard Display)

**Current state:** `MarketRegimeFilter` service exists, detects regime (`bull`/`neutral`/`correction`/`crisis`), used internally by scanner for confidence adjustment. **No UI exposure.**

**New file: `src/components/shared/MarketRegimeIndicator.tsx`**
```tsx
// Displays current market regime as a badge/pill in the header
// Uses MarketRegimeFilter.detect() (cached 2hr)
//
// Visual states:
// - bull: green badge "Bull Market" + trending-up icon
// - neutral: gray badge "Neutral" + minus icon
// - correction: amber badge "Correction" + trending-down icon
// - crisis: red badge "Crisis" + alert-triangle icon
//
// Expandable tooltip/popover on click:
// - VIX level
// - SPY vs 200-SMA relationship
// - Regime confidence penalty applied to signals
// - "Last checked: X minutes ago"
//
// Props: compact? (for header), expanded? (for dashboard)
```

**File: `src/components/layout/Header.tsx`** (modify)
- Add `<MarketRegimeIndicator compact />` next to the market status dot
- Only show on desktop (hidden on mobile to save space)

**File: `src/components/dashboard/MarketSnapshot.tsx`** (modify)
- Add expanded regime indicator to the market snapshot section
- Show regime alongside existing fear/greed and sector data

**New hook: `src/hooks/useMarketRegime.ts`**
```ts
// Wrapper hook around MarketRegimeFilter.detect()
// Returns: { regime, vixLevel, spyVsSma, penalty, loading, error, lastChecked }
// Caches result in state, refreshes every 2 hours
// Handles loading/error states gracefully
```

### 3B. Scanner-to-Positions Full Pipeline

**Goal:** From any signal card, one click creates a pre-filled position with proper sizing.

**File: `src/components/dashboard/SignalsSection.tsx`** (modify)

**Changes:**
1. Add "Open Position" button to each signal card
2. On click:
   - Extract: ticker, entry_price (current price), signal.metadata for stop/target
   - Calculate position size via `PortfolioAwareSizer.calculateSize()`
   - Navigate to `/positions?ticker={ticker}&entry={price}&side={side}&shares={shares}&signal_id={signal.id}&stop={stop}&target={target}`

**File: `src/components/analysis/PositionSizeCard.tsx`** (modify)

**Changes:**
1. Add "Create Position" CTA button at bottom of card
2. On click: navigate to `/positions` with pre-filled params from the calculated sizing
3. Import and use `PortfolioAwareSizer` instead of basic `PositionSizer`:
   - Show if size was reduced due to exposure limits
   - Display reason: "Reduced from 5% to 3% — sector exposure at 22% (limit 25%)"

**File: `src/pages/Positions.tsx`** (modify)

**Changes:**
1. Read URL params on mount: `ticker`, `entry`, `side`, `shares`, `signal_id`, `stop`, `target`
2. If params present, pre-fill the position creation form
3. Show banner: "Creating position from Signal" with link back to signal
4. After position created with signal_id, show linkage in position row:
   - "Source: AI Signal (82% confidence)" badge
   - Click navigates to `/analysis/{ticker}?signal_id={id}`
5. On position close, if `signal_id` exists:
   - Update `signal_outcomes` table with realized P&L
   - Show outcome summary: "Signal accuracy: Target hit / Stop hit / Manual close"

**File: `src/components/dashboard/HighConvictionSetups.tsx`** (modify)
- Add same "Open Position" button as SignalsSection
- Pre-fills position form with signal data

### Batch 3 Verification
```bash
npx tsc --noEmit
npm run build
```
Test: Market regime shows in header, click "Open Position" on signal → lands on Positions page with form pre-filled, create position → signal_id linked.

---

## Batch 4: Exposure Monitor Scheduling + Notification Wiring

### 4A. Exposure Monitor Scheduling

**Current state:** ExposureMonitor runs on 5-minute intervals in AppLayout (hardcoded). BrowserNotificationService has trigger types defined but only partially connected.

**File: `src/services/exposureMonitor.ts`** (modify)

**Changes:**
1. **Add configurable check interval:**
   - Read from localStorage: `exposure_check_interval_ms` (default 300000 = 5min)
   - Expose `setCheckInterval(ms)` and `getCheckInterval()` methods

2. **Add drawdown monitoring:**
   - Track portfolio peak value in localStorage
   - Calculate current drawdown: `(peak - current) / peak`
   - If drawdown exceeds threshold (configurable, default 5%), fire `notifyDrawdown()`
   - Drawdown thresholds: 5% warning, 10% critical, 20% emergency

3. **Add price alert checking:**
   - On each interval, fetch open positions' current prices
   - Check each position against its stop_loss and target_price (from signal metadata or position fields)
   - If price crosses stop → `notifyStopHit()`
   - If price crosses target → `notifyTargetHit()`

4. **Improve breach detection:**
   - Current breach check is basic — enhance with severity levels:
     - "Approaching" (within 5% of limit)
     - "Breached" (over limit)
     - "Critical" (10%+ over limit)

**New file: `src/components/settings/ExposureSettings.tsx`**
```tsx
// Settings panel for exposure monitoring configuration
// - Check interval dropdown (1min, 5min, 15min, 30min)
// - Drawdown alert thresholds (warning %, critical %)
// - Sector exposure limit override per sector
// - Enable/disable individual monitors
// - Test notification button
```

**File: `src/pages/Settings.tsx`** (modify)
- Add ExposureSettings section to Settings page

### 4B. Notification System Wiring

**File: `src/components/layout/AppLayout.tsx`** (modify)

**Changes:**
1. **Wire ExposureMonitor scheduling:**
   - Make interval configurable (read from localStorage/settings)
   - Verify visibility API pause works (already implemented)

2. **Wire signal notifications:**
   - In `useRealtimeSignals()` callback (already fires on new signals):
     - Call `BrowserNotificationService.notifyNewSignal()` for each new signal
     - Call `notifyHighConfidenceSignal()` if confidence > 85

3. **Wire convergence notifications:**
   - When `DashboardConvergence` detects new convergence:
     - Call `notifyConvergence(ticker, level, signalCount)`

**File: `src/hooks/useRealtimeSignals.ts`** (modify)
- After receiving new signal via Supabase Realtime subscription:
  - Check `BrowserNotificationService.getPreferences()` for enabled triggers
  - Fire appropriate notification

**File: `src/components/notifications/NotificationCenter.tsx`** (modify)
- Ensure notification preferences UI toggles match all 8 trigger types
- Add "Test" button per trigger type (sends a sample notification)
- Show notification history with clickable items (navigate to relevant page)

### Batch 4 Verification
```bash
npx tsc --noEmit
npm run build
```
Test: Enable notifications → run scanner → receive browser notification for new signal. Check exposure monitor fires on interval. Test drawdown alert by adjusting threshold.

---

## Batch 5: Final Integration + Polish

### 5A. Integration Smoke Tests

**Manual test checklist (verify in browser):**

1. **Command Palette Flow:**
   - ⌘K → type ticker → see results with price/signal info
   - Select "Analyze AAPL" → lands on `/analysis/AAPL`
   - Select "Create Position for AAPL" → lands on `/positions?ticker=AAPL&prefill=true`
   - Recent tickers appear at top of palette

2. **Cross-Page Deep Link Flow:**
   - Dashboard signal card → click ticker → `/analysis/{ticker}`
   - Intelligence article → click entity tag → `/analysis/{ticker}`
   - Position row → click ticker → `/analysis/{ticker}`
   - Analysis page → "Open Position" → `/positions?ticker=...&signal_id=...`

3. **Portfolio-Aware News Flow:**
   - Open positions exist → Intelligence tab shows portfolio filter
   - Articles mentioning portfolio tickers have green left border
   - Sentiment conflict shows amber warning on article
   - UnifiedPortfolioView shows divergence banner if conflicts exist

4. **Market Regime Flow:**
   - Header shows regime badge (bull/neutral/correction/crisis)
   - Click regime badge → popover with VIX/SPY details
   - MarketSnapshot shows expanded regime info

5. **Scanner-to-Position Flow:**
   - Signal card → "Open Position" → Position form pre-filled
   - Position created with signal_id link
   - Position row shows "Source: AI Signal" badge
   - Closing position updates signal_outcomes

6. **Exposure Monitor Flow:**
   - Settings → configure check interval and thresholds
   - Monitor runs on schedule, detects breaches
   - Browser notification fires for exposure breach
   - Browser notification fires for stop/target hit
   - Drawdown alert fires when portfolio drops below threshold

7. **Notification Flow:**
   - New signal → browser notification (if enabled)
   - High-confidence signal → notification with thesis
   - Convergence detected → notification
   - All notifications clickable → navigate to relevant page

### 5B. Polish & Edge Cases

1. **Loading states:** All new data fetches have skeleton/spinner states
2. **Error boundaries:** New components wrapped in error boundaries
3. **Mobile responsive:** Command palette full-width on mobile, regime indicator hidden
4. **Empty states:** Graceful handling when no portfolio, no signals, no articles
5. **Performance:** Memoize expensive computations (sentiment divergence, portfolio filtering)
6. **Accessibility:** Keyboard navigation in command palette, ARIA labels on badges

---

## File Change Summary

### New Files (7)
| File | Purpose |
|------|---------|
| `src/components/shared/TickerLink.tsx` | Reusable clickable ticker badge with navigation |
| `src/components/shared/MarketRegimeIndicator.tsx` | Market regime badge (compact + expanded) |
| `src/hooks/useRecentTickers.ts` | localStorage-backed recent ticker history |
| `src/hooks/useKeyboardShortcuts.ts` | Global keyboard shortcut registry |
| `src/hooks/useMarketRegime.ts` | Hook wrapper for MarketRegimeFilter service |
| `src/services/sentimentDivergence.ts` | News sentiment vs position bias checker |
| `src/components/settings/ExposureSettings.tsx` | Exposure monitor configuration UI |

### Modified Files (18)
| File | Changes |
|------|---------|
| `src/components/shared/CommandPalette.tsx` | Categories, ticker search, actions, recent |
| `src/components/layout/Header.tsx` | Add MarketRegimeIndicator |
| `src/components/layout/AppLayout.tsx` | Keyboard shortcuts, notification wiring, exposure scheduling |
| `src/components/sentinel/SentinelPanel.tsx` | Portfolio filter, portfolio-aware highlighting |
| `src/components/sentinel/ArticleCard.tsx` | Portfolio badge, sentiment conflict warning |
| `src/components/sentinel/FilterBar.tsx` | Portfolio filter toggle |
| `src/components/dashboard/SignalsSection.tsx` | "Open Position" button, TickerLink |
| `src/components/dashboard/WatchlistSection.tsx` | TickerLink for ticker navigation |
| `src/components/dashboard/HighConvictionSetups.tsx` | "Open Position" button |
| `src/components/dashboard/UnifiedPortfolioView.tsx` | Sentiment divergence banner, TickerLink |
| `src/components/dashboard/DashboardConvergence.tsx` | TickerLink, notification wiring |
| `src/components/dashboard/MarketSnapshot.tsx` | Expanded regime indicator |
| `src/components/analysis/PositionSizeCard.tsx` | PortfolioAwareSizer, "Create Position" CTA |
| `src/pages/Positions.tsx` | URL param pre-fill, signal linkage, sentiment dots |
| `src/pages/Settings.tsx` | ExposureSettings section |
| `src/services/exposureMonitor.ts` | Configurable interval, drawdown, price alerts |
| `src/hooks/useRealtimeSignals.ts` | Notification firing on new signals |
| `src/components/notifications/NotificationCenter.tsx` | Full trigger type coverage, test buttons |

---

## Dependency Order

```
Batch 1 (Foundation)
├── useRecentTickers.ts (no deps)
├── useKeyboardShortcuts.ts (no deps)
├── TickerLink.tsx (uses useNavigate, useRecentTickers)
├── CommandPalette.tsx enhancement (uses useRecentTickers, TickerLink)
├── Cross-page deep links (uses TickerLink)
└── AppLayout keyboard shortcut registration

Batch 2 (News ↔ Portfolio)
├── sentimentDivergence.ts (uses types only)
├── SentinelPanel + ArticleCard + FilterBar (uses usePortfolio)
├── UnifiedPortfolioView (uses useSentinel + sentimentDivergence)
└── Positions.tsx sentiment indicators

Batch 3 (Regime + Signal Pipeline)
├── useMarketRegime.ts (uses MarketRegimeFilter)
├── MarketRegimeIndicator.tsx (uses useMarketRegime)
├── Header + MarketSnapshot (uses MarketRegimeIndicator)
├── SignalsSection + HighConvictionSetups (uses PortfolioAwareSizer)
├── PositionSizeCard (uses PortfolioAwareSizer)
└── Positions.tsx URL param pre-fill + signal linkage

Batch 4 (Monitoring + Notifications)
├── ExposureMonitor enhancements (no new deps)
├── ExposureSettings.tsx (uses ExposureMonitor)
├── Settings.tsx (uses ExposureSettings)
├── AppLayout notification wiring (uses BrowserNotificationService)
├── useRealtimeSignals notification firing
└── NotificationCenter enhancements

Batch 5 (Polish)
└── Integration testing, edge cases, mobile, accessibility
```

---

## Risk Mitigations

1. **Circular imports:** sentimentDivergence.ts imports only types, not components
2. **Performance:** All cross-data computations in `useMemo` with proper deps
3. **Supabase rate limits:** ExposureMonitor batches position price fetches
4. **localStorage bloat:** Recent tickers capped at 10, notification history at 50
5. **Type safety:** All new interfaces in existing type files or co-located
6. **Build stability:** `npx tsc --noEmit` after every batch
