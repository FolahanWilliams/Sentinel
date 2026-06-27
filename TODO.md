# TODO — Sentinel

Active priorities, deferred follow-ups, known bugs. Recently-completed capped at ~7 days.

## Deferred (needs its own session)

### Unify the downstream signal gauntlet (the drift-class fix) — HIGH leverage, HIGH risk

**Why it matters.** There are two scan entry points — `runScan` (RSS full scan) and
`runSingleTickerScan` (discovery / single-ticker). Each re-implements the entire
post-primary-agent "gauntlet" independently, and they have already drifted: the empty-gauntlet
bug (PRs #181/#182) existed precisely because the discovery path was a degraded clone. Even
after #181/#182, the discovery path still runs only a *subset* of the full scan's gates.

**The parity gap (full scan has, single-ticker is missing):** behavioral layer (Other-Mind HARD
gate, narrative, cohort), toxic-combination detector, pre-mortem, DQI gate (HARD), conflict
detector (HARD), correlation guard (HARD), price-correlation matrix, signal-freshness/decay gate,
options-flow adjust, peer-strength adjust, fear/greed contrarian, retail-vs-news, cross-source
validator, source-diversity cap, beneficial-pattern detector, fundamentals penalty, market-regime
penalty, sector-rotation overlay, backtest-validation suppress gate, RPD pattern match,
multi-timeframe (×2), R/R gate, news-freshness penalty, ATR dynamic stop, weighted-ROI projections,
SMA-200 crisis guard, portfolio guardrails, A/B assignment, AgentContextBus cascading context,
and the cumulative penalty/boost cap tracking (`applyBoundedAdjustment`). Net: discovery signals
get materially LESS scrutiny than RSS signals — the opposite of "best setups, highest conviction."

**Why it's deferred (the risk).** The full-scan downstream is ~46 ordered stages across ~1200
lines (`scanner.ts` ~1227→2524), deeply nested inside the `for (const ev of events)` loop. It
closes over ~30 loop-local variables (perfContext, regimeResult, fearGreedScore, marketContext,
abAssignments, agentCtx, cumulativePenalty/cumulativeBoost, tickersToScan, fundamentalsData,
divergenceResult, optionsFlowResult, peerStrengthResult, earningsGuardResult, rotationSnapshot,
signalTypeThresholds, adaptiveMinConfidence, autoLearnWeights, …). Every reject is a bare
`continue` (15 of them) that would have to become a structured early-return. It also has live
side effects — `AlpacaService.submitBracketOrder` auto-executes real bracket orders when
`calibratedConfidence >= 85`. A blind extraction risks breaking the *working* RSS scanner on
**real capital**, and this environment can't runtime-exercise the live Gemini/Supabase/Alpaca
path, so behavior can't be verified here.

**The plan when picked up.**
1. Extract the downstream into a shared `runSignalGauntlet(ctx)` module that takes a single
   context object bundling all closed-over state (with optional fields the single-ticker path
   can omit; each stage no-ops or fetches-on-demand when its input is absent).
2. Convert every `continue` to `return { rejected, stage, reason }`.
3. Migrate the full scan to call it FIRST (faithful relocation = behavior preserved by
   construction), verify with a regression run on the last 30 days of historical signals
   (per CLAUDE.md AI-pipeline discipline) + a code-review pass, THEN wire the single-ticker path.
4. Keep auto-execution OUT of the shared core, or gate it explicitly per entry point.
5. Blueprint: full ordered stage map (stage → service → inputs → reject condition → confidence
   mutation) was produced in the session that shipped #181–#183; regenerate via an Explore pass
   over `runScan` lines ~1227–2524 if not saved.

Founder explicitly approved the unification but chose to defer it to a dedicated session given the
size/risk. Treat as the next big project, not a drive-by.

## Recently completed

- **#181** — discovery scan routes by catalyst direction (up→Bullish Catalyst, down→Overreaction);
  real grounded-search context fed to agents; tightened discovery selection; dislocation gate.
- **#182** — corroborate discovery dislocations against the real price tape (1d + ~5d), feed the
  agent the measured magnitude not the model's claim; `RED_TEAM_BLOCK_SAFETY_THRESHOLD` → constants.
