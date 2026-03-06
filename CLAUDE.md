# CLAUDE.md — Sentinel Project Instructions

## Git Workflow

- **Always rebase onto the latest `origin/main` before pushing a feature branch.** This prevents the branch from being both behind and ahead of main, which causes merge issues.
  ```bash
  git fetch origin main
  git rebase origin/main
  ```
- After rebasing, force-push the feature branch: `git push --force-with-lease`
- Use descriptive commit messages with conventional prefixes: `feat:`, `fix:`, `docs:`, `chore:`

## Project Overview

Sentinel is an AI-powered trading intelligence platform built with:
- **Frontend:** React 19 + TypeScript + Tailwind CSS + Vite
- **Backend:** Supabase (Postgres + Edge Functions + Auth + Realtime)
- **AI:** Google Gemini (via proxy Edge Function)
- **State:** Zustand stores

## Key Directories

- `src/components/shared/` — Reusable UI primitives (Badge, Sparkline, LoadingState, etc.)
- `src/components/analysis/` — Modular signal analysis components
- `src/components/sentinel/` — News intelligence UI components
- `src/components/dashboard/` — Dashboard widgets
- `src/services/` — Core services (scanner, agents, Gemini, RSS, etc.)
- `src/hooks/` — React hooks
- `src/types/` — TypeScript type definitions
- `supabase/functions/` — Edge Functions (Deno)
- `supabase/migrations/` — Database schema migrations

## Build & Deploy

- Build: `npm run build` (Vite)
- TypeScript check: `npx tsc --noEmit`
- Deployed on Vercel — strict TypeScript is enforced at build time
- Always run `npx tsc --noEmit` before pushing to catch strict null check errors

## Important Patterns

- All Gemini calls go through `supabase/functions/proxy-gemini/` Edge Function
- RSS feeds are defined in `src/config/rssFeeds.ts` (42 feeds)
- Constants and budget defaults in `src/config/constants.ts`
- Sentinel color palette uses `sentinel-*` Tailwind classes (sentinel-100 through sentinel-950)

## Gemini API Constraints

- **Model split:** `gemini-3-flash-preview` for reasoning/analysis, `gemini-2.0-flash` for grounded search calls. The proxy (`proxy-gemini/index.ts`) auto-switches based on `requireGroundedSearch`.
- **responseSchema + Google Search are incompatible.** The Gemini API rejects requests that combine controlled generation (`responseSchema`) with the Search tool. The proxy skips `responseSchema` when grounded search is enabled.
- **Supabase Edge Function timeout is ~60s.** The proxy uses a 45s `AbortController` to fail gracefully before the gateway kills the request (which strips CORS headers).
- **Default model is set in two places:** `src/config/constants.ts` (`GEMINI_MODEL`) and the `model` default in `proxy-gemini/index.ts`. Keep them in sync.
