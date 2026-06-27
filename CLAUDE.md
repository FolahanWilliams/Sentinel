# CLAUDE.md — Sentinel

## What This Project Is

Sentinel is an autonomous market intelligence engine that runs every signal through a 5-agent AI reasoning pipeline (Overreaction → Contagion → Catalyst → Earnings Guard → Red Team), self-critiques each thesis, and learns from outcomes via isotonic-regression confidence calibration (PAVA in `dynamicCalibrator.ts` — primary; static empirical buckets in `confidenceCalibrator.ts` — fallback). The deeper purpose: Sentinel is the live, transparent, auditable proving ground for a reasoning-audit framework whose enterprise application lives elsewhere. Trading is the controlled, fast-feedback domain where the mechanism is demonstrated; the engine itself is domain-agnostic.

## Confidentiality Locks (non-negotiable)

- Never reference Decision Intel in any Sentinel commit, code comment, docstring, README, marketing surface, or external communication. The DI GitHub repo is strictly confidential. The cross-validation narrative is an INVESTOR-CONVERSATION asset, not a public asset.
- The public Sentinel surface is the Sentinel domain only.
- When the founder mentions "the engine" or "the framework" in context of cross-validation, do not name DI in code/commits — keep the language generic ("reasoning audit framework", "the underlying engine").
- Audit trail JSON, post-mortem outputs, and signal artefacts must never leak DI-specific vocabulary (DPR, DQI as branded term, R²F, 22-bias taxonomy). Sentinel uses its own vocabulary: Signal Quality Index (SQI), audit trail, bias classification, noise score.

## The 8 META Rules (always read first)

1. **Empathic mode FIRST on public surfaces.** Before any design / copy / pitch decision, write 2-3 sentences from the actual user's POV: who they are, what they just did, what they're trying to learn, what closes the tab, what makes them lean forward. Persona audits are verification, not design input.

2. **Boil the ocean on planned work.** When the founder approves planned / Tier-N work ("proceed with X", "ship the deep version", "implement this list"), default to the category-grade version of every approved item — never the lean cut. No workarounds, no dangling threads, no "good enough." Override anti-scope-creep ONLY when scope is explicitly approved.

3. **Cascade by default on every cut / rename / refactor.** Every cut ships with the deep consumer sweep IN THE SAME COMMIT — chat-coaching prompts, CLAUDE.md prose, edge function callers, type unions, RAG injection, post-mortem schema, dashboard renderers, redirects. Half-shipped cuts force the founder to spot gaps and re-prompt.

4. **Pre-execution discipline check on every todo item.** Audit / brainstorm / recommendation lists are INPUTS, not orders. Before each list item, re-check against the rules codified earlier in the same session. Trigger words that demand a re-check: "named", "public", "marketing", "trading account", "confidential", "DI".

5. **Search canonical before extracting a helper.** Grep `src/utils/` + `src/services/` + `src/config/constants.ts` BEFORE writing any small utility (formatPrice, calculateRR, severityColor, gradeFromScore). Drift in duplicated helpers is a real bug class.

6. **Fire-and-forget exceptions need inline comments.** Silent `.catch(() => null)` / `.catch(() => {})` blocks that ARE legitimate (localStorage / sessionStorage / JSON.parse / cache-cleanup / SSE-malformed / edge-function transient errors) must say so inline. The comment IS the audit trail. Legitimate exception classes: in-memory cache cleanup, schema-drift tolerance (when commented as such), `req.json().catch(() => null)` body parsing, idempotency-check fallback on transient Supabase errors.

7. **Auto-update wrong / stale docs without asking.** When CLAUDE.md, comments, or docs prove incorrect, fix in the same turn — don't ask permission. The founder's leverage is in shipping; doc maintenance shouldn't add a round-trip.

8. **Verify BEHAVIOR, not just structure.** `tsc --noEmit` + "wiring looks right" + green lint proves code is well-formed, never that it runs correctly. On any runtime-critical change (the agent pipeline / calibration math / signal scoring / edge function): exercise the path, or — when you can't — owe a worst-case-runtime trace (grep the critical path for unbounded I/O, retry storms, model fallback chains). Removing a fallback / retry / fake / default / swallowed-error obligates answering "what did this mask, and is it now exposed?" before shipping. Applies to verification tooling itself: prove every new lint/guard fires on the bug AND is silent on correct code — "0 findings" alone is false confidence.

## Working-Style Rules

- **Git Workflow — rebase before push.** Always rebase onto the latest `origin/main` before pushing a feature branch. Prevents the branch from being both behind and ahead of main:
  ```bash
  git fetch origin main
  git rebase origin/main
  ```
  After rebasing, force-push with `git push --force-with-lease` (never bare `--force`). Conventional commit prefixes: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Standing autonomy for `git add` (explicit filenames only) / `git push` / `npx tsc --noEmit` / `node` / `echo`. No per-invocation ask. Gates-green-per-commit. Destructive ops (`git reset --hard`, `git push --force`, `rm -rf`) still need an ask.
- Prefer `npx tsc -b --noEmit` over `npm run build` during dev — fast type-check, no full Vite bundle. Full build only as pre-push gate. **Use `tsc -b`, NOT bare `tsc --noEmit`:** this repo uses TypeScript project references (`tsconfig.app.json`), and bare `tsc --noEmit` checks only the root config — it silently SKIPS `src/` and reports a false green. CI runs `tsc -b` (via `npm run build`), so a bare-`tsc` "pass" can still fail CI with real `src/` type errors. (Cost this session: a Vercel build failure on type errors a bare `tsc --noEmit` reported clean.)
- Never use Bash for file-read ops (`cat`/`head`/`tail`/`grep` on files Claude could use Read/Glob for). Bash for terminal-state operations only.
- Batch large file writes. If a generation is >800 lines, split into sequential Write/Edit chunks.
- Stage explicit filenames (`git add path/to/file.ts`), never `git add -A` or `git add -u`. The repo accumulates local dev-tool files (`.claude/`, `.mcp.json`, local notes) that should not be swept in.
- Lint + Prettier sweeps are holistic — run on whole repo by default, fix pre-existing issues in the same session unless explicitly scoped narrow.
- No destructive local commands without asking — no `rm -rf node_modules`, no killing dev server mid-debug, no cache wipes on the user's machine.
- Push back on sub-optimal strategy BEFORE executing, not at the end when asked "what do you truly think." If a request would compromise the cross-validation narrative or the audit trail, flag it before touching code.
- Choose best for use case, not simplest infrastructure. Quality / iteration speed / skill-reuse FIRST; infrastructure simplicity LAST.

## Product / Positioning Context

- **Sentinel is the proving ground, not the destination.** Every product decision should ask: does this strengthen the audit trail, the live performance record, or the demonstrable mechanism? Polish that doesn't sharpen the proof is lower priority.
- **The audit trail is the moat.** Every signal must persist: timestamp, ticker, entry, exit, agent reasoning, bias flags + severity, noise score, SQI, projected RR, actual P&L, post-mortem narrative. NEVER ship a code path that drops or compresses any of these fields silently.
- **Live trading only — never claim backtested results as proof.** The audit trail's value depends on being out-of-sample. Backtests live in the backtesting page; they are NEVER mixed into the live-performance dashboard or narrative claims.
- **Three-layer narrative discipline** (when writing investor-facing or landing copy):
  1. The Universal Problem (cognitive failure modes under uncertainty — domain-agnostic)
  2. The Proof (live trading audit trail with verifiable metrics)
  3. The Application (the engine deployed in a new domain — KEPT GENERIC on public surfaces)
- **Calibration honesty.** Confidence scores must be calibrated against observed win rates (isotonic regression / PAVA via `DynamicCalibrator`, static-bucket fallback). Never expose raw model confidence as "calibrated" on user-facing surfaces. When a calibration bucket has N<5 samples, label it `unlocks_at_N` or `too_few_samples`, never fabricate.
- **No backtested-result drift into live-claim copy.** Any time a metric appears on a marketing surface, audit it against the actual signal database — never quote a number that hasn't been live-verified.

## Tech Stack

- **Frontend:** React 19 + TypeScript 5+ + Tailwind CSS 4 + Vite 6
- **State:** Zustand (NOT Redux / Jotai)
- **Backend:** Supabase (Postgres + Edge Functions + Auth + Realtime)
- **AI:** Google Gemini via `proxy-gemini` edge function (rate-limited, model-switching) — `gemini-3-flash-preview` for analysis, `gemini-2.0-flash` for grounded search
- **Charts:** TradingView widgets + Lightweight Charts + Recharts
- **Animations:** Framer Motion
- **Deployment:** Vercel (frontend) + Supabase Edge (backend)
- **Email:** Resend
- **Notifications:** Browser push + email
- **Sentinel color palette** uses `sentinel-*` Tailwind classes (`sentinel-100` through `sentinel-950`).

## Build & Test Commands

```bash
npm install
npm run dev          # Vite dev server on :5173
npm run build        # tsc --noEmit (implicit via vite) + production build
npx tsc --noEmit     # Fast type-check (preferred during dev)
npm run preview      # Preview production build
supabase functions deploy <name>    # Deploy a single edge function
supabase functions logs <name>      # Tail edge function logs (manual)
```

**Pre-commit discipline:** `npx tsc -b --noEmit` must be clean (use `-b` — bare `tsc --noEmit` skips `src/` under project references and gives a false green). Add lint scripts as ratchets when they earn their keep (silent-catches, count-drift, canonical-imports — see "Lint Ratchets" below).

**Pre-push discipline:** full `npm run build` must pass. Vercel CI catches frontend build errors; Supabase edge function deploys are independent and must be tested separately (`supabase functions invoke <name>` against local then prod).

## Project Structure (canonical reference)

```text
src/
├── components/         # UI components (analysis, dashboard, scanner, sentinel, signals, shared, landing, learning)
├── config/             # constants.ts (all thresholds), rssFeeds.ts (42 feeds), supabase.ts
├── hooks/              # React hooks
├── pages/              # 18 route pages (Landing = public home, Showcase = public /about, Learning = analyst toolkit)
├── services/           # 80+ specialized services
├── stores/             # Zustand state
├── types/              # TypeScript type definitions
└── utils/              # Formatting, validation, calculations

supabase/
├── functions/          # 16 edge functions
└── migrations/         # Database schema
```

When adding a new service: put it in `src/services/`, export typed functions, NEVER duplicate logic already in `src/services/` — search first.

**Public surface (landing / showcase).** The unauthenticated branch of `App.tsx` has its own `BrowserRouter`: `/` → `Landing` (home cover page), `/about` → `Showcase` (the shareable "the build" project page, lazy-loaded). Both render from the SAME shared sections in `src/components/landing/`, and all copy/agent/stat data lives in the canonical `src/components/landing/landingContent.ts` — edit facts there ONCE so the two surfaces can't drift. Stat counts are computed from canonical exports (`BIAS_TYPES`, `RSS_FEEDS`) rather than hardcoded. The page frames Sentinel as an operationalization of decision-science principles (Kahneman/Klein/Tetlock/intel tradecraft) mapped to real mechanisms — keep `PRINCIPLES` claims verifiable against `src/services`. Visualizations are pure SVG + framer-motion (no chart dep on the landing bundle); every animation has a reduced-motion fallback. Confidentiality holds here: market-intelligence framing only, the "applied elsewhere" angle stays generic (`ApplicationSection`), and no fabricated performance numbers — only architecture/mechanism counts that are verifiable from the codebase.

## Critical Conventions

### Configuration & Constants

- `src/config/constants.ts` is the SSOT for thresholds, defaults, guardrail parameters, calibration buckets. NEVER hardcode a threshold inline; import from constants. When a threshold changes, edit `constants.ts` only.
- Edge function secrets vs client env vars are separate planes. `VITE_*` vars ship in the client bundle; secrets live in Supabase Function secrets. Never cross — a Gemini API key in `VITE_*` is a leak.
- RSS feeds are defined in `src/config/rssFeeds.ts` (42 feeds).
- **Reading `import.meta.env` — NEVER optional-chain between `import.meta` and `.env`.** Vite only inlines the exact token `import.meta.env`; the optional-chained `import.meta?.env` is NOT replaced and resolves to `undefined` at runtime, so every `VITE_` var reads empty in the production bundle even though Vite inlined the values into an object elsewhere. Use `(import.meta as any).env?.[key]` — the `?.` goes AFTER `.env`, never before it. This exact bug white-screened production for a whole session ("supabaseUrl is required"). **Corollary lesson:** a value being PRESENT in the bundle (grep finds it) ≠ runtime-ACCESSIBLE — inspect the *compiled* expression in the deployed bundle, don't just grep for the string.
- **`createClient` must never throw at import.** `config/supabase.ts` uses placeholder URL/key fallbacks and exports `isSupabaseConfigured`; `main.tsx` renders a clear config-error screen when unconfigured instead of a blank page. Still fail-closed (App never renders without real creds) — just not a silent white screen.
- **The public Landing page is feature-gated.** `App.tsx` serves `Landing` (`/`) + `Showcase` (`/about`) to logged-out visitors ONLY when `FEATURE_VERTICAL === 'investment'` (from `VITE_FEATURE_VERTICAL`); otherwise logged-out users get `AuthGate`. To show the landing cover page in prod, set `VITE_FEATURE_VERTICAL=investment` in Vercel (All Environments). `FEATURE_VERTICAL` reads `import.meta.env` too, so it was also dark until the inlining fix above.

### Deployment & CI reality (hard-won)

- **Frontend (Vercel):** auto-deploys on push. Production = merge-to-`main` deploys; per-commit branch previews build but are throwaway (they ERROR'd all session until the build went green). Vercel builds with **pnpm** (`pnpm-lock.yaml` is committed alongside `package-lock.json`) — keep both in sync or the deploy drifts from local/CI (which use npm). Prod alias: `sentinel-nine-sable.vercel.app` (also `sentinel-folahanw`). Vercel project `prj_1WaW9zPV3TOqwKhz0jdXPTnF9NYw`, team `team_WUcGYJAL2wxKr98ewSO8ujEY`.
- **CI** (`.github/workflows/ci.yml`): lint → `tsc --noEmit` → build on PR/push to main. `npm run lint` must be clean (0 errors). `promptSanitizer.ts` carries a deliberate `// eslint-disable-next-line no-control-regex` (it intentionally strips control chars).
- **Backend (Supabase)** (`.github/workflows/supabase-migrations.yml`): deploys migrations + edge functions on push to `main` touching `supabase/**`. `supabase db push` uses `SUPABASE_DB_PASSWORD` in the step env (wired into both the repair and push steps; the secret is set). Background: without it the CLI falls back to creating the `cli_login_postgres` role and fails with "permission denied to alter role". All functions deploy with `--no-verify-jwt` (they authenticate internally).
- **MCP write-ops are approval-gated in web/remote sessions.** `restore_project`, `apply_migration`, `deploy_edge_function`, `execute_sql`, etc. fail with "MCP tool call requires approval" and can't be bypassed — so DB/edge deploys go through the GitHub Actions workflow (or the founder's local CLI), NOT MCP. MCP **read** tools work and are the fastest diagnosis path: Vercel `get_deployment` / `get_deployment_build_logs` / `list_deployments`, Supabase `get_logs` / `list_migrations`.
- **Diagnose prod-only issues against the deployed bundle** (`curl https://<prod>/assets/index-*.js`), not a local build — local can't reproduce build-env/inlining differences.
- **Web-session containers can reset local git state between turns.** The branch repeatedly showed up both behind and ahead of origin. Always `git fetch origin <branch> && git rebase origin/<branch>` immediately before pushing (the CLAUDE.md rebase-before-push rule, but the divergence here was container state, not real upstream commits).

### Database (Supabase / Postgres)

- Always wrap Supabase queries in try-catch; check for transient failures and degrade gracefully (cached value, empty array, null).
- When mutating tables, prefer `upsert` with idempotency keys (signal_id + timestamp) over insert + dedup logic.
- **Migration discipline:** any schema change ships with a migration file in `supabase/migrations/`; the file name must include a UTC timestamp prefix and a descriptive slug. Never edit a deployed migration — write a new one.
- **`@schema-drift-tolerant` comment marker:** when a `.catch(() => null)` or fallback branch is intentionally tolerating schema drift (table not yet migrated, column added in a later migration than the code path), prefix the inline comment with `@schema-drift-tolerant`. Lets future audits grep `rg "@schema-drift-tolerant"` to skip intentionally-silent catches.

### Backtest / simulation quarantine (live-data integrity — the moat)

Non-live rows live in the SAME `signals` / `signal_outcomes` tables as real out-of-sample outcomes, tagged with the canonical `is_simulated` boolean (`true` = strategy backtest OR Training Dojo simulation; `false` = live). One predicate: `is_simulated = false` means live.

- **Every live calibration / performance / learning READ of `signal_outcomes` MUST filter `.eq('is_simulated', false)`.** Omitting it re-poisons the confidence calibration curve and the live performance record — backtest/sim contaminating live is a direct moat-integrity bug. The `lint:live-outcomes` ratchet enforces this.
- **Every non-live WRITER must set `is_simulated: true`** (`strategyOutcomeWriter` for backtests, `historicalSimulation` for Training Dojo). Live writers leave the default `false`.
- **`BacktestValidator` is the ONE intentional consumer of backtest rows** (it validates live signals against TA-only history) and is on the ratchet ALLOWLIST. `Backtest.tsx` / `TrainingDojo.tsx` are the inverse display surfaces (they render non-live data) and are also exempt.
- Per-signal reads (`.eq('signal_id', …)`) need no filter — they target a single signal, not an aggregate.

### Security

- Never write a local `safeCompare` implementation — use a single canonical timing-safe comparison utility. Drift here is a real bug class (auth bypass).
- Document encryption (if added): use AES-256-GCM via a key version stamp.
- Edge functions: validate inputs at the boundary; never trust client payloads for trading-impact decisions.

### Components & Patterns

- Lazy-load heavy chart components with `React.lazy` + `Suspense`.
- Use `ErrorBoundary` wrapper on every page-level component.
- Use `createLogger('ContextName')` for structured logging in services and edge functions.
- Standardized response shapes: every service function returns `{ data, error }` or throws — pick one per module, stay consistent.
- Unused imports cause Vite build warnings; treat as errors. Clean up imports after refactoring.

### Fire-and-forget error handling (cross-reference META rule #6)

Never swallow errors with `.catch(() => {})` on operations that affect signal delivery, audit trail writes, post-mortem persistence, or learning-feedback adjustments. Use `.catch(err => log.warn('specific context:', err))` at minimum. Silent catches ARE acceptable for: in-memory cache cleanup, schema-drift tolerance (commented), `req.json().catch(() => null)` body parsing.

## AI Pipeline Discipline

- **The 5-agent pipeline is the core IP.** Changes to pipeline ORDER, AGENT PROMPTS, or SCHEMA require:
  1. A regression run on the last 30 days of historical signals (re-score, diff distribution)
  2. Founder explicit approval
  3. A CLAUDE.md session-lock documenting the change + the regression evidence
- **Adding a new agent is a cascade** — pipeline orchestrator, agent prompts file, schema types (`src/types/`), RAG injection for lessons, post-mortem outputs, dashboard renderer that surfaces the new agent's reasoning. Same commit.
- **Two scan entry points, ONE routing contract.** The RSS full scan (`runScan`) and the discovery/single-ticker scan (`runSingleTickerScan`) MUST route by catalyst direction identically: `up` → Bullish Catalyst agent, `down` → Overreaction agent (both are LONG setups, so downstream TA/confluence direction stays `'long'`). The single-ticker path was historically overreaction-only, which silently rejected every bullish/neutral discovered ticker at "Overreaction" ("the move looks rational"). `runDiscoveryScan` passes `discoveryContext` (`reason`/`catalyst`/`direction`/`expectedMovePct`) into `runSingleTickerScan` — never re-derive a thin event there. A pre-agent **dislocation + corroboration gate** (`DISCOVERY_FLAT_MOVE_PCT` in `constants.ts`) skips flat tickers with no directional catalyst, AND rejects a discovered catalyst whose claimed direction the real price tape contradicts on BOTH the 1-day and ~5-day windows (the model's self-reported move can be hallucinated — measure it via `MarketDataService.getHistoricalPriceAtDate` and feed the agent the measured magnitude, not the claim). Agents must receive real context (market mood, regime, sector, TA, the grounded-search news body) — a bare `Event Type: X | Severity: Y` stub is what makes a thesis thin enough for the Red Team to nuke.
- **Confidence calibration math** (isotonic regression / PAVA in `dynamicCalibrator.ts`, static buckets in `confidenceCalibrator.ts` as fallback): never silently change buckets, weights, or remapping. Bumping calibration means re-running on the historical sample + persisting the new calibration version alongside scores so old signals stay interpretable.
- **Methodology versioning:** stamp every signal with the calibration version that produced its confidence score. A future audit asking "which version produced this score?" should resolve from the signal record, not from inferring git history.
- **The Self-Critique pass is load-bearing** — never bypass it for performance. If latency is a concern, run it async and reconcile, never skip it.
- **The Red Team agent must not be downgraded to "advisory"** — fatal flaws kill the signal entirely. This is the structural difference between Sentinel and a normal signal generator.

### Gemini API Operational Constraints (hard-won)

- **Model split:** `gemini-3-flash-preview` for reasoning/analysis, `gemini-2.0-flash` for grounded search calls. The proxy ([supabase/functions/proxy-gemini/index.ts](supabase/functions/proxy-gemini/index.ts)) auto-switches based on `requireGroundedSearch`.
- **`responseSchema` + Google Search are incompatible.** The Gemini API rejects requests that combine controlled generation (`responseSchema`) with the Search tool. The proxy skips `responseSchema` when grounded search is enabled.
- **Supabase Edge Function timeout is ~60s.** The proxy uses a 45s `AbortController` to fail gracefully before the gateway kills the request (which would strip CORS headers).
- **Default model is set in two places:** [src/config/constants.ts](src/config/constants.ts) (`GEMINI_MODEL`) and the `model` default in `proxy-gemini/index.ts`. Keep them in sync. (Candidate for the canonical-imports lint ratchet.)

## Audit Trail Discipline (the moat)

Every signal write must persist these fields. Schema and code paths MUST enforce non-null where applicable:

- `signal_id` (UUID), `timestamp_utc`, `ticker`, `signal_type`
- `entry_price`, `entry_timestamp`
- `exit_price`, `exit_timestamp` (null until closed)
- `agent_reasoning_chain` (full text per agent — never truncated for storage)
- `bias_flags` (array: `{bias, severity, passage_ref}`)
- `noise_score` (jury variance)
- `sqi` (Signal Quality Index 0-100)
- `confidence_raw` (model output), `confidence_calibrated` (post-isotonic)
- `confidence_calibration_version`
- `projected_rr`, `actual_rr`
- `post_mortem_narrative` (null until 1d/5d/10d/30d windows close)
- `outcome_1d`, `outcome_5d`, `outcome_10d`, `outcome_30d` (P&L at each window)

A migration that drops or compresses any of these fields is a moat-degrading bug. Block it.

## Drift-Prevention Discipline

When a constant or algorithm has a canonical source, every consumer MUST import from it. Re-implementing the same logic in another file IS the drift-class bug — even if it's correct today, it'll diverge silently when one copy gets updated.

**Common drift candidates to watch:**

- Score → grade mappings (e.g., SQI thresholds for High/Med/Low conviction tiers)
- Calibration bucket boundaries
- RR calculation formulas
- ATR / Kelly fraction math
- Sector exposure limits
- Confidence threshold for alert dispatch
- Red Team hard-block safety threshold (`RED_TEAM_BLOCK_SAFETY_THRESHOLD` — in `constants.ts`, not inline in scanner)
- RSS feed list
- Gemini default model (lives in two places: `constants.ts` and `proxy-gemini/index.ts`)
- Per-position currency normalization — every cross-position total MUST go through `toUSD`/`nativeToUSD` (see below)

**Forward-looking rule:** when adding a small utility (`formatPrice`, `scoreToTier`, `riskColor`), grep `src/utils/` + `src/services/` + `src/config/constants.ts` for an existing equivalent before writing a new one.

### Currency normalization (money math — two bug classes that have bitten)

The portfolio mixes currencies (GBP via `.L` LSE tickers, USD otherwise).

1. **`.L` prices are pence (GBX) at the source but pounds by the time they reach app logic.** The quote layer — both `MarketDataService` and `quotePoller` — divides `.L` quotes ÷100 to pounds, and entry prices are stored in pounds. So `LSE_QUOTES_IN_PENCE = false` in `portfolio.ts` (no further /100). Add a new quote path → normalize `.L` ÷100 there too, or you reintroduce a 100× error. **Normalize on the RESOLVED symbol, not the requested one.** `proxy-market-data` resolves a bare ticker (e.g. `VOD`) to its real listing (`VOD.L`) and returns the pence price keyed under the *bare* symbol with the real one in a separate `resolvedTicker` field. The quote path normalizes client-side, so every `.L` check must read `(quote.resolvedTicker ?? requestedTicker).endsWith('.L')` — checking the requested symbol skips the ÷100 and leaves a 100× price (poisons P&L, makes every stop read instantly "hit"). Keep `.L` normalization in ONE layer per path (quote path = client-side in `MarketDataService`/`quotePoller`; historical-bars path = server-side in `proxy-market-data`) — never both, or you double-divide.
2. **Never sum per-position value/P&L/exposure across positions in native currency** — a `.L` (GBP) amount added to a USD amount is meaningless. Route every per-position amount through the canonical helpers in `src/utils/portfolio.ts` (`toUSD` / `nativeToUSD` / `calcUnrealizedPnlUSD` / `getPositionExposureUSD` / `realizedPnlUSD`) before aggregating. React surfaces get rates from `useForex()`; non-React services from `getForexRates()` (`src/services/forexRates.ts`, base USD, shares the session cache). Per-ROW display stays native (the position's currency symbol); only TOTALS convert to USD.

## Lint Ratchets (build these as the codebase grows)

These are not all required day-1. Add when they earn their keep:

- **Silent-catch ratchet** (`scripts/lint-silent-catches.mjs`) — **LIVE, baseline 24.** Runs in CI (`ci.yml`) and via `npm run lint:silent-catches`. Scans `src/` + `supabase/functions/` for `.catch(arg => null/undefined/{}/[]/false/true/0/'')` and fails when the count exceeds the baseline. Adding a new silent catch requires (a) replacing an existing one, (b) upgrading to `log.warn`, OR (c) bumping `BASELINE` with an inline comment naming the exception class. Trajectory: ratchet 24 → down (the current 24 are mostly fire-and-forget browser-notification / best-effort client outcome+exposure triggers + 1 `req.json()` body parse).
- **Live-outcomes ratchet** (`scripts/lint-live-outcomes.mjs`) — **LIVE.** Runs in CI (`ci.yml`) and via `npm run lint:live-outcomes`. Fails when any `signal_outcomes` READ lacks `.eq('is_simulated', false)` (the live-only filter), so backtest/simulation data can't re-contaminate the calibration curve or live performance record. Exempt: writes, per-signal reads (`.eq('signal_id', …)`), and the non-live surfaces in the script's `ALLOWLIST` (`backtestValidator`, `Backtest.tsx`, `TrainingDojo.tsx`). A new live aggregate read over outcomes → add the filter or CI fails.
- **Count-drift ratchet** (`scripts/lint-counts.mjs`): scans for hardcoded literals matching counts of agents / feeds / pages / bias types — fails when exceeds baseline. Prefer interpolation from canonical exports (e.g., `${AGENTS.length}`).
- **Canonical-imports lint** (`scripts/lint-canonical-imports.mjs`): blocks new local re-implementations of canonical helpers. Inline `// canonical-exception — <reason>` opt-out.
- **Doc-sync lint** (`scripts/lint-doc-sync.mjs`): cross-checks prose numbers in CLAUDE.md against lint baselines; tolerance ±2.

Each ratchet bump requires (i) edit the const, (ii) inline comment naming the exception class, (iii) update the trajectory line in CLAUDE.md within the same commit.

## Decision-Making with the Founder

**Standing directive (founder preference): bias hard toward proactive + autonomous.** Default to ACTING, not asking. When the founder hands a set of issues ("proceed with the most important ones", "fix the bugs"), pick the highest-leverage items, ship the deep version, and report after — don't present menus or ask which to start. Fold in adjacent low-risk fixes in the same area rather than deferring them. Only stop to ask when genuinely blocked on a founder-only decision — the explicit "Ask before" list below (schema deploys, pricing, agent-prompt/calibration-math changes, confidentiality-lock surfaces, deleting routes/services). Writing a migration FILE on a feature branch is autonomous (it only deploys on merge-to-main, which the founder controls); irreversibly applying one is not. Surface deferred work as a short "next" line, not a blocking question.

### Default to autonomous

- File refactors that preserve behavior
- Lint fixes, test additions, docs updates, dead-code removal
- Adding a new service to `src/services/` that composes existing helpers
- Frontend polish that doesn't change a metric definition

### Ask before

- Schema changes (add/drop column, change type)
- Pricing / plan / paywall changes
- Deleting any route, component, edge function, or service (external links may exist)
- End-user copy changes on dashboard / signal cards / alerts
- Agent prompt overhauls
- Calibration math changes (isotonic regression fit, bucket count, blend ratios)
- Edge function rate-limit / budget-cap changes
- RSS feed list changes
- Any change that touches a confidentiality lock surface (audit trail JSON shape, public-claim copy)

### Proactive-surfacing rule

"Ask first" does NOT mean "default skip." When working on a non-trivial ship, actively scan for high-leverage improvements in the pipeline / calibration / scoring / audit trail that would deepen the build, then PROACTIVELY surface them with: (a) the specific change, (b) why it's high-leverage, (c) cost estimate (LOC + complexity), (d) risk assessment, (e) clear recommendation. The founder decides; you then ship the deep version. Pre-shrinking by silently classifying improvements as "out of scope" burns the founder's leverage.

## Debugging Discipline (the 5 rules)

1. A working fix is not reverted without a NEW failing test that proves it wasn't the cause. "It used to work without this" is a guess, not evidence.
2. **Bisect before theorize.** `git bisect` against a reproducible failure is faster than any theory.
3. **Reproduce locally before pushing.** Each Vercel deploy attempt is 5-15 minutes. Local repro in 1-2 minutes beats it every time.
4. **Commit messages record evidence + uncertainty, not conclusions.** Banned phrasings: "THE actual bug", "definitively the culprit", "real root cause". Use: "tried X, build now fails at Y instead of Z" / "X eliminates the failure — keeping unless disproved."
5. **Don't accumulate scaffolding without removing on disproof.** When a hypothesis is disproved, delete its scaffolding (env vars, scripts, config flags) in the same commit as the disproof, or document as deliberately-kept-for-X with a date.

## Session Workflow

1. **Read `TODO.md` first.** Known bugs, active priorities, pending tasks. Update as work completes.
2. **Start small.** One focused task per session beats a mega-batch.
3. **Build-check before pushing.** `npx tsc -b --noEmit` is the minimum gate (`-b` is mandatory — bare `tsc --noEmit` skips `src/` under project references).
4. **Commit after each logical unit.** Don't batch 12 changes into one commit.
5. **Don't rediscover — read CLAUDE.md.** Conventions here have been learned the hard way.
6. **Keep CLAUDE.md current — proactively, not at session end.** Whenever a change introduces a new convention, renames a field, adds a critical file, changes a workflow pattern, or discovers a gotcha that cost time — update CLAUDE.md in the same commit. Don't wait. Don't ask permission.

## Tone and Style

- Output text to communicate with the user. Most tool calls are invisible.
- Match response to task: simple question gets direct answer, no headers.
- End-of-turn summary: 1-2 sentences. What changed, what's next.
- Default to no code comments. Only add when the WHY is non-obvious — a hidden constraint, a subtle invariant, a workaround for a specific bug. If removing the comment wouldn't confuse a future reader, don't write it.
- Don't narrate internal deliberation. State results and decisions directly.
- Never reference the current task / fix / PR in code comments ("added for Y flow", "fixes #123") — those belong in commit messages and rot in code.
- No emojis unless the user explicitly asks.
- Use markdown links `[filename.ts](src/filename.ts)` for code refs in IDE context.

## Founder Context

- Solo developer. Building Sentinel alongside a separate enterprise product.
- Multiple Claude Code sessions per day; context between sessions matters.
- Does NOT run `npm run build` locally for every change — relies on `npx tsc --noEmit` + Vercel CI. Claude is the local build check.
- Trading via junior ISA (legally registered, real capital). The audit trail starts on day one — never compromise it.
- No team — every CLAUDE.md update saves a future session's onboarding time.

## Forward-Looking Discipline

- Update this CLAUDE.md in the same commit as the change it documents.
- Don't ask permission to fix stale prose / wrong dates / outdated counts.
- When a session lesson costs >30 min to learn, encode it here so the next session starts with it.
- The 8 META rules at the top are the load-bearing core — when a new pattern emerges that belongs at that level, propose it explicitly so the founder can decide.

**Recommended companion files:**

- `TODO.md` — active priorities, deferred follow-ups, known bugs, recently-completed (capped at ~7 days)
- `MEMORY.md` (in `~/.claude/projects/<sentinel-path>/memory/`) — auto-loaded; CRITICAL META rules at top, then topic-grouped feedback files
- `docs/audit-trail-schema.md` — canonical reference for every signal field, source-of-truth when schema changes
