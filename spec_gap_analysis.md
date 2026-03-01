# Sentinel Spec Gap Analysis

> Audit of `sentinel-spec.md` requirements vs. the implemented codebase.

## Context

The consolidated plan states:

> *"The Sentinel RSS Intelligence Feed spec (sentinel-spec.md) remains standalone — it defines the **news aggregation subsystem** that integrates at Stage 5 via Patch 8."*

The current build followed the **Consolidated Plan** (trading signal engine with AI agents). The spec describes a **separate, complementary system**: a real-time RSS news intelligence feed with Gemini-powered article processing. Only the RSS *caching* layer (Patch 8) was built as the scanner's input source; the spec's full news intelligence UI and backend were **not** implemented.

---

## ✅ What IS Implemented (from the spec)

| Spec Requirement | Status | Location |
|---|---|---|
| 42 RSS feed definitions | ✅ Implemented (different set) | `src/config/rssFeeds.ts` — 42 feeds across 11 categories |
| RSS fetch + parse + cache to Supabase | ✅ Implemented | `src/services/rssReader.ts` → `rss_cache` table |
| Category color map | ✅ Partial | `src/config/constants.ts` (CATEGORY_COLORS exists, different set) |
| Supabase + Edge Functions stack | ✅ Implemented | 3 Edge Functions deployed |
| Gemini API integration | ✅ Implemented | Via `proxy-gemini` Edge Function |
| RLS policies | ✅ Implemented | On all 11 tables |

---

## ❌ What is NOT Implemented (from the spec)

### Backend — The `sentinel` Edge Function (Spec §5)

The spec calls for a **single monolithic Edge Function** (`/api/sentinel`) that:

| Requirement | Status |
|---|---|
| Fetches all 42 RSS feeds in parallel with `Promise.allSettled()` | ❌ Not built |
| Parses XML → normalized `RawArticle[]` | ❌ Not built (client-side `rssReader.ts` does a simpler version) |
| Deduplicates by URL + Jaccard title similarity (>85%) | ❌ Not built |
| Checks `sentinel_articles` table for already-processed articles | ❌ Not built |
| Sends NEW articles in ONE batched Gemini call for AI processing | ❌ Not built |
| Stores `ProcessedArticle` results in `sentinel_articles` | ❌ Not built |
| Returns top 50 articles + daily briefing + meta stats | ❌ Not built |
| Google News feed special URL extraction | ❌ Not built |
| URL normalization (strip UTM params) | ❌ Not built |
| Cache-Control headers (`max-age=60, s-maxage=300`) | ❌ Not built |

### Database — Missing Tables (Spec §4)

| Table | Status |
|---|---|
| `sentinel_articles` (processed article cache with Gemini output) | ❌ Not created |
| `sentinel_briefings` (daily briefing cache) | ❌ Not created |
| Indexes: `idx_sentinel_pub_date`, `idx_sentinel_category`, etc. | ❌ Not created |

### Types — Missing Type Definitions (Spec §3)

| Type | Status |
|---|---|
| `Feed`, `FeedCategory` (spec's 13-category taxonomy) | ❌ Not defined |
| `RawArticle` | ❌ Not defined |
| `ProcessedArticle` (with Gemini-generated fields) | ❌ Not defined |
| `ArticleCategory` (11 categories: `ai_ml`, `crypto_web3`, etc.) | ❌ Not defined |
| `TradingSignal` (spec's article-level signal, different from agent signals) | ❌ Not defined |
| `SentinelResponse` (articles + briefing + meta) | ❌ Not defined |
| `DailyBriefing` (topStories, marketMood, trendingTopics, signalCount) | ❌ Not defined |

### Frontend — Missing Components (Spec §7)

| Component | Status |
|---|---|
| `SentinelPanel.tsx` — Main container with briefing bar, filters, feed, sidebar | ❌ Not built |
| `BriefingBar.tsx` — Market mood badge, top stories carousel, signal counter | ❌ Not built |
| `ArticleCard.tsx` — Individual article cards with sentiment/category/impact badges | ❌ Not built |
| `FilterBar.tsx` — Category pills, sentiment toggle, impact filter, search, sort | ❌ Not built |
| `SignalsSidebar.tsx` — Aggregated trading signals grouped by ticker | ❌ Not built |
| `SentinelSkeleton.tsx` — Loading state | ❌ Not built |
| `useSentinel.ts` — 60-second polling hook | ❌ Not built |

### Gemini Prompt — Batch Article Processing (Spec §6)

| Requirement | Status |
|---|---|
| `buildPrompt()` — single batched prompt for all new articles | ❌ Not built |
| Returns per-article: summary, category, sentiment, sentimentScore, impact, signals, entities | ❌ Not built |
| Returns `briefing`: topStories, marketMood, trendingTopics, signalCount | ❌ Not built |
| Temperature 0.1 for consistent structured output | ❌ Not configured |
| Structured JSON output mode (`responseMimeType: 'application/json'`) | ❌ Not used |

### Error Handling (Spec §12)

| Requirement | Status |
|---|---|
| All feeds fail → return cached articles from last 24h | ❌ Not built |
| Gemini fails → store raw articles with fallback defaults | ❌ Not built |
| Gemini returns invalid JSON → retry once, then fallback | ❌ Not built |
| Google News rate limiting (1s spacing, skip on 429) | ❌ Not built |
| `ON CONFLICT (link) DO NOTHING` for race conditions | ❌ Not built |
| >80 articles → split into 2 Gemini calls of 40 | ❌ Not built |

---

## Also Missing from the Consolidated Plan

Beyond the spec, several features from the **Consolidated Plan** itself are also stubs or missing:

| Feature | Source | Status |
|---|---|---|
| Dashboard components (`SignalCard`, `SignalFeed`, `MarketPulse`, etc.) | Stage 7 | ⚠️ Built inline (not modular) |
| Dashboard Portfolio Overview | Patch 5 | ✅ Implemented |
| Analysis components (`BiasBreakdown`, `EventTimeline`, `PositionSizeCard`, `FundamentalSnapshot`, etc.) | Stage 8 | ❌ Missing/very basic |
| Shared components (`Badge`, `Sparkline`, `LoadingState`, etc.) | Stage 1 | ❌ Missing |
| Budget Widget | Patch 2 | ❌ Missing |
| Weekly Performance Digest | Patch 4 | ❌ Missing |
| Calendar heatmap in Journal | Stage 9 | ✅ Implemented |
| Journal export as markdown | Stage 9 | ✅ Implemented |
| Smart Scan Prioritization | Stage 5 | ❌ Missing |
| `performanceStats.ts` (Feedback Loop) | Stage 5 | ❌ Stub only |

---

## Summary

The current app is a **functional foundation** implementing the Consolidated Plan's core pipeline (Stages 1–6 + page shells for 7–10). The `sentinel-spec.md`'s news intelligence subsystem is an **entirely separate feature layer** that has not been started.

### To fully integrate the spec, you would need:
1. **New Edge Function** — `supabase/functions/sentinel/index.ts`
2. **New migration** — `sentinel_articles` + `sentinel_briefings` tables
3. **New types** — `ProcessedArticle`, `DailyBriefing`, `SentinelResponse`, etc.
4. **6 new React components** — `SentinelPanel`, `BriefingBar`, `ArticleCard`, `FilterBar`, `SignalsSidebar`, `SentinelSkeleton`
5. **New hook** — `useSentinel.ts`
6. **New Gemini prompt** — `buildPrompt()` for batch article processing
7. **Error handling** — all fallback/retry logic from Spec §12
