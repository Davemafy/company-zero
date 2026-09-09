# Durable runtime

The Vercel application validates and persists jobs, then returns `202`. It never executes an organization from the submission request.

Experiment creation follows the same boundary: the API persists the diagnosis, candidates and an empty-result experiment, enqueues a dedicated orchestration job, and returns `202`. Candidate results do not exist until that job is claimed by the external worker. The synchronous public `/experiments/:id/run` route has been removed.

Postgres owns queue state. `db/002_durable_runtime.sql` adds the queue, transitions, worker heartbeats, idempotency, approvals and budget-ledger tables. `cz_claim_work` uses `FOR UPDATE SKIP LOCKED`, an expiring lease and an atomic update, so concurrent workers cannot claim the same item. Expired claims become eligible for recovery. Attempts are bounded and exhausted work moves to `dead_letter`.

Run the independent worker on a long-lived Node host:

```sh
npm run worker
```

Deploy the web application to Vercel and the worker to a long-running service such as Render, Fly.io, Railway, ECS or a VM. Both use the same Supabase project. More worker replicas can be added safely because claiming is atomic.

Required production variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Worker tuning variables:

```text
WORKER_ID
WORKER_LEASE_SECONDS
WORKER_POLL_MS
```

Apply migrations in order: `db/schema.sql`, `db/002_durable_runtime.sql`, `db/003_control_plane.sql`, then `db/004_outcome_control.sql`, then `db/005_deliverable_artifacts.sql`.

Current explicit limitations: replay cases are executed inside the claimed experiment orchestration job rather than as separately leased child queue items. Automatic Governor scheduling, live MCP transport, resumable approval checkpoints, lease renewal during long calls and atomic SQL promotion remain unimplemented. These are not silently replaced with success.
