# Base44 Dev Environment — Junior Math Tutor

## Stack
- **Frontend**: Vite + React (root `client/`), dev server on port 5173 (mapped to host 3000).
- **Backend**: Express + tRPC, dev entry `server/standalone.ts` (tsx watch), internal port 3001.
- **Database / Auth / Storage**: Supabase (external hosted project). Not run locally.
- **AI**: Google Gemini (`@google/genai`), key `GEMINI_API_KEY`.

## Run
```
docker compose -f docker-compose.base44.yml up -d
```
- `setup` service installs pnpm deps into a shared named volume (`app_node_modules`), then exits.
- `api` and `web` start after `setup` completes successfully.
- Vite proxies `/api` → `http://${TUTOR_API_HOST}:${TUTOR_API_PORT}` (defaults `127.0.0.1:3001`; compose sets `TUTOR_API_HOST=api`).

## Secrets (external, user-supplied)
Delivered to `/run/base44/app.env`, listed as the LAST `env_file` entry so they override the
placeholders in `.env.base44-defaults`.
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` — frontend crashes at module load without these (required at boot).
- `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_URL` — server-side Supabase (tutor features error without).
- `GEMINI_API_KEY` — AI tutor.

Without real secrets the stack still boots (placeholders), but auth/tutor calls fail at runtime.

## Config tweaks made for containerized dev
- `vite.config.ts`: proxy target host is configurable via `TUTOR_API_HOST` (default `127.0.0.1`, unchanged for local dev); `allowedHosts: true` so the dynamic preview hostname is accepted.
- `server/standalone.ts`: bind address configurable via `API_BIND_HOST` (default `127.0.0.1`); compose sets `0.0.0.0` so the `web` container can reach it.

## Verify
- `docker compose -f docker-compose.base44.yml ps` — `web` healthy, `api` up.
- `curl -sf -H "Host: external-preview.example.com" http://localhost:3000/` returns the app HTML.
- Frontend live-reloads on edits; backend live-reloads via `tsx watch`.

## Other
- pnpm is the package manager (`packageManager: pnpm@10.4.1`); `wouter` has a local patch in `patches/`.
- Supabase SQL migrations live in `supabase/migrations/` (applied to the hosted project, not run here).
