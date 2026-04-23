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
npm run pack                                    # 构建并打包
scp tesk-deploy.tar.gz root@server:/tmp/        # 上传
ssh root@server                                 # 解压并启动
cd /www/wwwroot/tesk-backend && tar -xzf /tmp/tesk-deploy.tar.gz
npm install --production && npx prisma generate
pm2 start ecosystem.config.cjs && pm2 save
```

## Architecture

### Multi-Process Architecture (PM2)

Production uses 4 process types controlled by `PROCESS_TYPE` env var:
- `tesk-api` (1 instance) — Fastify HTTP server, handles API requests
- `tesk-worker` (10 instances) — BullMQ Model worker + webhook worker, processes model tasks
- `tesk-app-worker` (2 instances) — Dedicated BullMQ App worker, processes app tasks with upstream key concurrency control
- `tesk-timeout` (1 instance) — Periodic timeout checker, marks stuck tasks as FAILED

All processes connect to the same Redis and MySQL. Workers share the BullMQ queue automatically.
Model worker concurrency: configurable via `WORKER_CONCURRENCY` (default 20). Total = instances × concurrency.
App worker concurrency: configurable via `APP_WORKER_CONCURRENCY` (default 4). Total should match upstream key pool size (2 instances × 4 = 8 keys).
`PROCESS_TYPE=all` starts everything in one process (backward compatible, used by `npm run dev`).

### Task Lifecycle
1. Client calls `POST /api/v1/jobs/createTask` with Bearer token (ApiKey table)
2. `taskService` creates a `TaskJob` row (PENDING) and enqueues to BullMQ
3. Worker picks up job → resolves handler → sets state to RUNNING
4. Handler executes business logic (may call external APIs, poll for results)
5. On completion: update DB (SUCCESS/FAILED), enqueue webhook to `webhook-delivery` queue
6. Webhook worker delivers callback to `callBackUrl` (3 retries)

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
- Worker concurrency: Model worker via `WORKER_CONCURRENCY` (default 20), App worker via `APP_WORKER_CONCURRENCY` (default 4)
- Model tasks: simple retry (3 attempts, exponential backoff 5s), then fail
- App tasks: dedicated `task-processing-app` queue, 5 attempts fixed 3s backoff, upstream key borrowing with 429 cooldown
- Upstream key concurrency: `UpstreamKeyService` uses Redis Lua scripts for atomic borrow/return, prevents over-concurrency across multiple worker processes
- Webhook delivery: async via dedicated BullMQ queue `webhook-delivery`, 3 retries at 10s/30s/60s delays
- Timeout checker: marks RUNNING tasks exceeding 30 minutes as FAILED (exactly 1 instance across all processes)
- Global HTTP connection pool: `undici.Agent` via `setGlobalDispatcher` for all outbound fetch calls
- All upstream fetch calls use `fetchWithTimeout()` with AbortController timeout protection
- Prisma connection pool: configurable via `DATABASE_POOL_LIMIT` (default 30)
- Redis connections: separate connections for BullMQ (`redisBullMQ`) and application-level operations (`redis`)
- Frontend is served at `/admin/` via `@fastify/static` with SPA fallback
- Environment config centralized in `src/config/env.ts`

## Required Environment Variables

```
DATABASE_URL       # MySQL connection string
REDIS_URL          # Redis connection string
PORT               # Server port (default 4000)
ADMIN_API_KEY      # Admin auth key
ADMIN_USER         # Admin login username (default admin)
ADMIN_PASS         # Admin login password (default admin123)
UPSTREAM_CONFIG    # JSON array for upstream API key concurrency management
RUNNINGHUB_API_KEY # Optional, for RunningHub handler
GPTIMAGE2_API_KEY  # Optional, for GPT image handlers
GEMINI_API_KEY     # Optional, for Gemini image handlers
PUBLIC_URL         # Optional, public URL for callbacks
S3_ENDPOINT        # Optional, S3-compatible storage endpoint
S3_REGION          # Optional, S3 region (default auto)
S3_ACCESS_KEY      # Optional, S3 access key
S3_SECRET_KEY      # Optional, S3 secret key
S3_BUCKET          # Optional, S3 bucket name
```

## Optional Tuning Variables

```
WORKER_CONCURRENCY      # Model Worker parallel jobs per process (default 20)
APP_WORKER_CONCURRENCY  # App Worker parallel jobs per process (default 4)
PROCESS_TYPE            # Process mode: all|api|worker|app-worker|timeout (default all)
DATABASE_POOL_LIMIT     # Prisma connection pool size (default 30)
```
