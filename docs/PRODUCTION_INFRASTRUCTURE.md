# Production infrastructure

## Runtime topology

The browser and HTTP API deploy to Vercel. Supabase/PostgreSQL remains the only durable source of truth. A single persistent worker process claims durable queue rows, renews leases while working, invokes TensorMux and authorized capability providers, persists evidence, evaluates outcomes, and hands the result to the Governor. Railway is the current production worker host, but the worker runtime is intentionally vendor-neutral.

No application state is stored on the worker host filesystem. A restart therefore cannot rewrite revision pins, invocation journals, approvals, experiments, budget reservations, or promotion state. An interrupted lease expires and becomes claimable through `cz_claim_work`; a dispatched side effect remains protected by the invocation journal and becomes `uncertain` rather than being blindly replayed.

## Apply the database

Run the migrations in order against the Supabase PostgreSQL database:

```text
db/schema.sql
db/002_durable_runtime.sql
db/003_control_plane.sql
db/004_outcome_control.sql
db/005_deliverable_artifacts.sql
```

Verify them against a separate test database with:

```bash
TEST_DATABASE_URL='postgresql://...' npm run test:integration
```

## Vercel

Deploy the repository to Vercel and configure at least:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TENSORMUX_BASE_URL
TENSORMUX_API_KEY
TENSORMUX_MODEL
```

Optional Vercel variables are `NEATLOGS_WRITE_KEY`, `NEATLOGS_PROJECT`, `NEATLOGS_INGEST_URL`, and `ZYTE_API_KEY`. The service-role key is server-only and must never be exposed through client JavaScript.

## Persistent worker host (Railway in current production)

Railway runs only the long-lived worker. Do not move the Vercel frontend/API or Supabase database into the worker service. The worker does not need a public domain.

### Railway service configuration

Connect the GitHub repository to a Railway service and use the repository root. The package exposes a standard `start` script and Railway may use it automatically. The explicit start command is:

```text
node worker/runner.mjs
```

Set these Railway service variables:

```text
NODE_ENV=production
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
TENSORMUX_BASE_URL=...
TENSORMUX_API_KEY=...
TENSORMUX_MODEL=...
TENSORMUX_RUNTIME_MODEL=...
WORKER_ID=company-zero-railway-1
WORKER_LEASE_SECONDS=60
WORKER_POLL_MS=1000
WORKER_MAX_BACKOFF_MS=30000
```

Add these when the corresponding integrations are used:

```text
ZYTE_API_KEY=...
NEATLOGS_WRITE_KEY=...
NEATLOGS_PROJECT=...
NEATLOGS_INGEST_URL=...
```

Do not store real secrets in the repository.

### Logs and restart behavior

Use Railway's **Deployments → latest deployment → Logs** view to inspect worker startup, polling, retry, shutdown, and error events. Railway may restart the process after deploys or failures; durable state remains in PostgreSQL, so a restart does not become a new source of truth.

On `SIGTERM` or `SIGINT`, the worker stops claiming new work, allows its active tick and lease renewal to finish, writes a final heartbeat, and exits. Transient storage/network failures use bounded exponential backoff. Non-transient configuration or programming errors exit non-zero so the host can restart the process.

### Verify the heartbeat

Worker status is persisted in `cz_worker_heartbeats` and exposed by:

```text
GET /api/v1/runtime/workers
```

A healthy worker must have a recent `heartbeat_at`; the API derives `healthy` from the configured lease window. Do not call the worker live until this has been observed in production.

### Host portability

Railway is a deployment target, not a control-plane dependency. The same worker entrypoint can run on another persistent Node process host by providing the same environment variables and start command. `Procfile` and `app.json` remain only as optional Heroku compatibility artifacts; Heroku is not the primary deployment path.

## TensorMux

TensorMux is the only production model gateway. Goal compilation, strategy search and critique, organization synthesis, operation planning, conversation interpretation, diagnosis, and replanning call its OpenAI-compatible endpoint. Production rejects these operations with a `tensormux_required_*` error when credentials are absent. Deterministic proposal fallbacks exist only in development-memory tests and are labelled `deterministic_development_fallback`.

TensorMux cannot invoke capabilities, classify external evidence, settle budget, approve work, evaluate outcomes, or promote revisions.

## Zyte

When `ZYTE_API_KEY` is set, every new outcome receives a generic read-only `observe_public_webpage` capability. It makes one bounded request to Zyte API's `/v1/extract` endpoint. It accepts only an explicit URL and optional browser rendering flag; it does not crawl recursively.

The adapter enforces target URL validation, schema validation, response limits, timeouts, same-origin link extraction limits, secret redaction, transactional cost reservation, invocation journaling, and trace-linked provenance. It persists a generic `external_observation` and `world_fact`. Because the capability has no outcome measurement mappings by default, webpage content cannot automatically satisfy an outcome contract.

To run the authenticated probe against a harmless public page you control:

```bash
ZYTE_API_KEY='...' ZYTE_TEST_URL='https://YOUR_TEST_PAGE' npm run test:integrations
```

## Neatlogs

Neatlogs receives semantic children linked to persisted outcome contracts, world models, strategies, organization revisions, operation plans, capability traces, external observations, outcome verification, and Governor decisions. A trace ID is stored only when Neatlogs returns one. Missing credentials produce `SKIPPED`, never a fabricated identifier.

## Deferred infrastructure

- **Datadog — DEFERRED.** No runtime sender is claimed. Infrastructure monitoring should be connected through a verified Railway-compatible integration only after the production worker is stable; Neatlogs remains the semantic trace system.
- **Clerk — DEFERRED.** The API has a clean future authentication boundary, but authentication is not being rewritten merely to consume a student benefit.
- **Camber — EXPERIMENTAL/DEFERRED.** No production adapter is claimed. A future adapter may expose bounded compute behind the same generic capability protocol; Camber must not become the organization runtime.
- **Heroku — ALTERNATIVE HOST / DEFERRED.** Compatibility files remain, but it is not the current production target.

## Readiness language

- `PASS`: the check actually executed and met its assertions.
- `FAIL`: the check executed and violated an assertion.
- `READY`: implementation and local acceptance coverage exist, but production execution is not implied.
- `DEPLOYED`: the service has actually been deployed. This alone does not imply a healthy heartbeat.
- `BLOCKED`: a required production dependency prevents execution.
- `SKIPPED`: an optional integration was intentionally not invoked because configuration was absent.
- `NOT PERFORMED`: no deployment or real-world operation was attempted.


### TensorMux timeout

Set `TENSORMUX_TIMEOUT_MS=60000` on Vercel and Railway. The runtime clamps this to 5–180 seconds and defaults to 60 seconds.
