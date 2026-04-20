# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Tesk-Backend is a distributed async task processing system with an integrated admin dashboard. Clients submit tasks (model inference or app processing) via API; tasks are queued in BullMQ/Redis and executed by pluggable handler workers. Results are returned via webhook callbacks.

## Commands

### Backend
```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm run start        # Run production build
npm run init-db      # Sync Prisma schema to MySQL (prisma db push)
```

### Admin Frontend
```bash
cd admin && npm run dev     # Vite dev server on :5173, proxies /api to :4000
cd admin && npm run build   # Build to admin/dist/
cd admin && npm run lint    # ESLint
```

### Production Deploy
```bash
cd admin && npm run build && cd ..
rm -rf public && ln -s admin/dist public   # Link frontend build to static dir
npm run build && npm run start
```

## Architecture

### Task Lifecycle
1. Client calls `POST /api/v1/jobs/createTask` with Bearer token (ApiKey table)
2. `taskService` creates a `TaskJob` row (PENDING) and enqueues to BullMQ
3. Worker picks up job → resolves handler → sets state to RUNNING
4. Handler executes business logic (may call external APIs, poll for results)
5. On completion: update DB (SUCCESS/FAILED), fire webhook to `callBackUrl`

### Handler Registration (Two-Layer)

**Static layer** — `src/workers/registry.ts` maps handler names to implementations:
```
availableHandlers = { "defaultModelHandler": ..., "runningHubHandler": ..., }
```

**Dynamic layer** — Database tables `ModelStrategy` / `AppStrategy` map model names or appIds to handler names. At runtime, `getTaskHandlerDynamic()` looks up the DB, then resolves the handler from the static map.

Adding a new handler requires: (1) create file in `handlers/models/` or `handlers/apps/`, (2) import and register in `registry.ts`, (3) add to `AVAILABLE_HANDLERS` in `admin/src/pages/StrategyManage.tsx`, (4) bind via Admin UI.

### Dual Auth
- **Public API** (`/api/v1/jobs/*`): Bearer token validated against `ApiKey` table, rate-limited 10 req/sec per key
- **Admin API** (`/api/v1/admin/*`): Bearer token matched against `ADMIN_API_KEY` env var

### Tech Stack
- **Backend**: Fastify 5, TypeScript (ES2022, ESM), BullMQ, Prisma ORM (MySQL), ioredis
- **Frontend**: React 19, Vite 8, Tailwind CSS 4, Axios
- **Infra**: Node.js 20+, MySQL, Redis

### Key Patterns
- All routes are in `src/routes/` — `jobs.ts` for public API, `admin.ts` for management
- Business logic lives in `src/services/` — `taskService`, `webhook`, `timeoutChecker`
- Worker concurrency: 3 parallel jobs, BullMQ retry: 3 attempts with exponential backoff
- Webhook retries: 3 attempts at 10s/30s/60s delays
- Timeout checker: marks RUNNING tasks exceeding 30 minutes as FAILED
- Frontend is served at `/admin/` via `@fastify/static` with SPA fallback
- Environment config centralized in `src/config/env.ts`

## Required Environment Variables

```
DATABASE_URL       # MySQL connection string
REDIS_URL          # Redis connection string
PORT               # Server port (default 4000)
ADMIN_API_KEY      # Admin auth key
RUNNINGHUB_API_KEY # Optional, for RunningHub handler
```
