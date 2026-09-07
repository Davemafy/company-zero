# Deployment — Vercel

Company Zero serves the operating interface from `/` and its server functions from `/api`. Deploy the repository root with the Vercel **Other** framework preset; the static product has no build step.

## Required production configuration

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WORKER_TOKEN`

Apply, in order:

1. `db/schema.sql`
2. `db/002_durable_runtime.sql`
3. `db/003_control_plane.sql`

Run at least one long-lived worker with `node worker/runner.mjs`. The API only creates and inspects durable work; the worker claims and executes it with leases and recovery.


## Persistent worker deployment — Railway

Railway is the current production worker host. Create one service from the same repository and run only:

```text
node worker/runner.mjs
```

No public domain is required. Configure the worker variables documented in `docs/PRODUCTION_INFRASTRUCTURE.md`, deploy, inspect the latest deployment logs, then verify `GET /api/v1/runtime/workers` reports a recent heartbeat. The worker runtime is vendor-neutral; Railway is not part of the control-plane contract.

## Reasoning and observability

- `TENSORMUX_BASE_URL`
- `TENSORMUX_API_KEY`
- `TENSORMUX_MODEL`
- `TENSORMUX_RUNTIME_MODEL`
- `NEATLOGS_WRITE_KEY`
- `NEATLOGS_API_KEY`
- `NEATLOGS_PROJECT`
- `NEATLOGS_INGEST_URL`

Production requires TensorMux for every model-dependent reasoning stage. Missing credentials or a failed TensorMux request stops that stage with an explicit error; production never silently substitutes deterministic output. The bounded, labelled deterministic fallback exists only in development-memory mode.

## Deployment-level capabilities

Set `COMPANY_ZERO_PROVIDERS_JSON` to a JSON array of generic HTTP provider definitions. These declarations are registered for each new outcome session. A provider without an inline manifest is externally discovered only when its real `/.well-known/company-zero-capabilities` endpoint responds successfully. Keep credentials in server environment variables and reference them from provider authentication configuration; do not embed secrets in manifests.

Manual provider configuration remains available under **Developer** for advanced use. If no usable capability exists, Company Zero stops at a durable capability-access request instead of simulating work.

## Verification

Run `npm run verify` for the complete in-memory acceptance suite. Run `npm run test:integration` against an isolated PostgreSQL database using `TEST_DATABASE_URL`. The integration command exits successfully with an explicit `SKIPPED` result when test database credentials are absent.

## Primary routes

- `/` — natural-language operating interface and advanced control plane
- `/evidence.html` — benchmark and build evidence console
- `/api/health` — storage, runtime, TensorMux, and Neatlogs status
- `/api/v1/outcomes` — create an operating session from a natural-language goal
- `/api/v1/companies/:id/sessions/:sessionId` — inspect durable session progress
- `/api/v1/companies/:id/sessions/:sessionId/messages` — conversational corrections
- `/api/v1/companies/:id/providers` — advanced generic provider registration
- `/api/v1/worker/tick` — authenticated worker tick

Development-memory mode is useful for local acceptance tests only. Production requires the Postgres-backed store so queue, budget, uniqueness, promotion, approval, and revision invariants remain transactional across processes.
