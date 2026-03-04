# Sentinel Codebase Audit — Implementation Phases

> Reference: [`CODEBASE_AUDIT.md`](./CODEBASE_AUDIT.md)
> Date: 2026-03-04
> Branch: `claude/codebase-audit-Uq4Xa`

This document breaks the audit findings into 6 implementation phases, ordered by severity and dependency. Each phase references specific audit IDs from `CODEBASE_AUDIT.md`.

---

## Phase 1: Critical Security (Audit: C1–C8)

**Goal:** Eliminate all attack vectors that allow unauthenticated access, data exfiltration, SSRF, and XSS.

| # | Fix | Audit Ref | Files |
|---|-----|-----------|-------|
| 1.1 | **Lock down RLS policies** — Drop all anonymous `USING(true)` policies; replace with `auth.uid() IS NOT NULL` for authenticated role only | C1 | New migration `20260304_*_fix_rls_policies.sql` |
| 1.2 | **Add real JWT verification** to all Edge Functions using `supabase.auth.getUser()` | C3, C4 | All 5 Edge Functions |
| 1.3 | **Remove `--no-verify-jwt`** from CI deploy script | C5 | `.github/workflows/supabase-migrations.yml` |
| 1.4 | **Add URL allowlist + scheme validation** to proxy-rss to prevent SSRF | C2 | `supabase/functions/proxy-rss/index.ts` |
| 1.5 | **Sanitize HTML** in send-alert-email — escape all interpolated values | C6 | `supabase/functions/send-alert-email/index.ts` |
| 1.6 | **Move API keys** from URL query params to request headers | C7 | `proxy-gemini/index.ts`, `sentinel/index.ts` |
| 1.7 | **Add model name allowlist** in proxy-gemini | C8 | `supabase/functions/proxy-gemini/index.ts` |
| 1.8 | **Add auth to sentinel Edge Function** | C3 | `supabase/functions/sentinel/index.ts` |

---

## Phase 2: Edge Function Hardening (Audit: M1, M3, M10, M11, M12, M13, m15–m18)

**Goal:** Make Edge Functions production-grade with proper error handling, input validation, and response consistency.

| # | Fix | Audit Ref | Files |
|---|-----|-----------|-------|
| 2.1 | **Fix fire-and-forget** usage logging — `await` the insert | M3 (from detailed audit) | `proxy-gemini/index.ts` |
| 2.2 | **Validate `tickerParam`** input in proxy-market-data | m15 | `proxy-market-data/index.ts` |
| 2.3 | **Fix zero-value quote** on total failure — return `success: false` | M12 | `proxy-market-data/index.ts` |
| 2.4 | **Fix provider attribution** — log actual provider (Yahoo vs Alpha Vantage) | M10 | `proxy-market-data/index.ts` |
| 2.5 | **Normalize error responses** — use proper HTTP status codes (500 for server errors, 502 for upstream) | m17 | All Edge Functions |
| 2.6 | **Sanitize error messages** — don't leak internals to clients | m18 | All Edge Functions |
| 2.7 | **Normalize upstream status codes** in proxy-rss | m15 (proxy-rss) | `proxy-rss/index.ts` |
| 2.8 | **Add input validation** to send-alert-email | m27 | `send-alert-email/index.ts` |
| 2.9 | **Handle DB insert errors** in sentinel function | M13 | `sentinel/index.ts` |
| 2.10 | **Optimize sentinel cache query** — `select('link')` instead of `select('*')` | m22 | `sentinel/index.ts` |
| 2.11 | **Wrap news_sentiment response** in consistent `{ success, data }` format | M11 | `proxy-market-data/index.ts` |

---

## Phase 3: Frontend Architecture (Audit: C13, C15, C16, m6, M8)

**Goal:** Prevent white-screen crashes, fix routing gaps, and improve core React patterns.

| # | Fix | Audit Ref | Files |
|---|-----|-----------|-------|
| 3.1 | **Add React Error Boundary** wrapping the route tree | C13 | New `src/components/shared/ErrorBoundary.tsx`, update `App.tsx` |
| 3.2 | **Add 404 catch-all route** | C15 | `src/App.tsx` |
| 3.3 | **Add `/analysis` base route** (redirect to dashboard or show ticker picker) | C16 | `src/App.tsx` |
| 3.4 | **Memoize ChatContext** value object and `openChatWithTicker` | m6 | `src/contexts/ChatContext.tsx` |
| 3.5 | **Fail-closed env validation** — throw in production if Supabase vars are missing | M8 | `src/config/env.ts` |

---

## Phase 4: Data Integrity & Business Logic (Audit: C9, C12, m1, m2, M17, m7, M7, M10)

**Goal:** Fix validators, remove fabricated fallback data, fix duplicate dispatches, and correct cost tracking.

| # | Fix | Audit Ref | Files |
|---|-----|-----------|-------|
| 4.1 | **Fix response validator** — support short trades (stop_loss > target_price when side=short) | m1 | `src/utils/responseValidator.ts` |
| 4.2 | **Fix `timeframe_days` field name** — use `expected_timeframe_days` to match DB schema | m2 | `src/utils/responseValidator.ts` |
| 4.3 | **Fix costEstimator pricing keys** to match actual logged provider names | m7 | `src/utils/costEstimator.ts` |
| 4.4 | **Fix `formatters.ts` edge cases** — handle zero, future dates, NaN | Minor (m10) | `src/utils/formatters.ts` |
| 4.5 | **Fix `marketUtils` timezone** — use `Intl.DateTimeFormat` with explicit parts | m8 | `src/utils/marketUtils.ts` |

---

## Phase 5: Code Consolidation (Audit: M8 duplicate helpers, m9 triple timeAgo, C14)

**Goal:** Eliminate duplicate code, consolidate helper files, fix type collisions.

| # | Fix | Audit Ref | Files |
|---|-----|-----------|-------|
| 5.1 | **Merge `sentinel-helpers.ts` into `sentinelHelpers.ts`** — single source of truth for sentinel UI helpers | M8 | Delete `sentinel-helpers.ts`, update `sentinelHelpers.ts`, update all imports |
| 5.2 | **Consolidate `timeAgo`** — single implementation in `formatters.ts`, re-export from sentinel helpers | m9, Minor | `formatters.ts`, `sentinelHelpers.ts` |
| 5.3 | **Rename sentinel `TradingSignal`** to `SentinelTradingSignal` to resolve name collision | C14 | `src/types/sentinel.ts`, update imports |
| 5.4 | **Add sentinel types to barrel exports** | Minor | `src/types/index.ts` |

---

## Phase 6: Database & Infrastructure (Audit: M32, M3-vercel, M6, M9, m13, m14)

**Goal:** Add missing indexes, security headers, fix build config, clean up migrations.

| # | Fix | Audit Ref | Files |
|---|-----|-----------|-------|
| 6.1 | **Add database indexes** on frequently queried columns | M32 | New migration `20260304_*_add_indexes.sql` |
| 6.2 | **Add security headers** — CSP, HSTS, Permissions-Policy | M3 | `vercel.json` |
| 6.3 | **Expand `.gitignore`** — cover `.env.production`, `.env.staging`, etc. | M6 | `.gitignore` |
| 6.4 | **Disable production sourcemaps** | M9 | `vite.config.ts` |
| 6.5 | **Remove redundant index** on `sentinel_articles.link` | m13 | New migration |
| 6.6 | **Add ESLint config** and lint step to CI | M4, M5 | `.eslintrc.cjs`, `.github/workflows/ci.yml` |

---

## Phase Dependency Graph

```
Phase 1 (Security)
    ↓
Phase 2 (Edge Function Hardening)  ←── depends on Phase 1 auth patterns
    ↓
Phase 3 (Frontend Architecture)    ←── independent, can parallel with Phase 2
    ↓
Phase 4 (Data Integrity)           ←── independent
    ↓
Phase 5 (Code Consolidation)       ←── should come after Phase 4 (validator fixes)
    ↓
Phase 6 (Database & Infra)         ←── independent, last because lowest risk
```

---

## Out of Scope (Documented but not implemented in this PR)

These items from `CODEBASE_AUDIT.md` require broader architectural decisions or are lower priority:

- **M2**: Full test infrastructure (Vitest + test files) — separate initiative
- **M10–M14**: State management consolidation (Zustand vs hooks) — separate refactor
- **C10**: AI-driven DB writes confirmation modal — UX design decision needed
- **C11**: Position sizing Kelly Criterion fix — needs product input on confidence model
- **M15–M16**: Retry/timeout infrastructure for all services — separate utility PR
- **Accessibility fixes** — separate initiative with design review
- **Dead code cleanup** — separate cleanup PR
