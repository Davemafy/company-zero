# Company Zero

**Say what you want to happen. Company Zero chooses a strategy, builds the organization required, operates through real capabilities, and measures whether the world actually changed.**

Company Zero optimizes the organization around agents rather than optimizing a single agent. A model may propose structure, but execution evidence and hard promotion gates decide whether the structure survives.

## Product

Open `/` after deployment. The first screen is the universal natural-language outcome composer—not infrastructure setup.

The primary hierarchy is Outcome → Current work → Company. The existing control plane remains as advanced inspection:

- **Outcome** — target, grounded progress, current strategy, blockers and conversation
- **Work** — persistent operating ledger
- **Organization** — promoted executable structure and constitution
- **Experiments** — incumbent vs shadow challenger evaluation
- **Capabilities** — typed capability registry
- **Memory** — retained structural lessons and version history
- **Controls** — autonomy boundaries, revision safety, and kill switch

The production path has no built-in business domain or intent taxonomy. It accepts generic HTTP, MCP-manifest, and human-review providers and synthesizes from their capability semantics. HTTP providers may expose a real `/.well-known/company-zero-capabilities` manifest. Missing access produces `awaiting_capabilities`; unsafe input mapping produces `awaiting_operation_plan`; neither condition creates simulated work.

## Core mechanism

`outcome → world model → strategies → organization → execution → outcome observation → diagnosis → challengers → same-workload evaluation → promotion → memory`

The critical boundary is:

> **The model proposes. The runtime executes. The evaluator judges. The Governor promotes.**

## Evidence

The hackathon/evidence console is available at `/evidence.html`. It includes benchmark results, runtime traces, restructuring evidence, and the AO evidence ledger. AO session history must be genuine and is never fabricated by the application.

## Vercel

This repository is Vercel-native. Production operation requires Supabase; the API deliberately returns `durable_storage_not_configured` instead of silently falling back to ephemeral server memory. Apply `db/schema.sql`, then configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

The Vercel API accepts and persists work. A separate durable worker claims it from Postgres, so the browser and submission request may disconnect immediately. See `docs/DURABLE_RUNTIME.md` and apply both SQL migrations before production use.

The runtime provides:

- operational product at `/`
- Vercel functions under `/api`
- provider status at `/api/health`
- no Netlify configuration or compatibility layer

Run locally with:

```bash
npm i -g vercel
vercel dev
```

Production worker, TensorMux, Zyte and Neatlogs setup is documented in `.env.example` and `docs/PRODUCTION_INFRASTRUCTURE.md`.

The evidence boundary, provenance classes, outcome rules, and live-test limitations are documented in `docs/LEGITIMACY.md`.

## Verify

```bash
npm run verify
```

Verification covers syntax, durable runtime invariants, capability security, resumable approval, transactional budget, concurrent experiment work, atomic promotion, the autonomous learning lifecycle, arbitrary-goal compilation, honest capability blocking, outcome verification, conversational corrections, portable persistent-worker lifecycle, and bounded Zyte provenance.

## Architecture

- `lib/universal.mjs` — goal, world, strategy, session and conversation orchestration
- `lib/outcome-verifier.mjs` — independent mission-level change verification
- `lib/platform-v1.mjs` — canonical organization and execution engine
- `lib/queue.mjs`, `lib/control-plane.mjs` — durable work, leases, budget and promotion authority
- `lib/worker-runtime.mjs`, `worker/runner.mjs` — vendor-neutral persistent worker lifecycle (Railway is the current production host; `Procfile` remains optional portability support)
- `lib/zyte.mjs` — bounded generic external web observation adapter
- `lib/governor-service.mjs`, `lib/experiment-service.mjs` — evidence-driven restructuring
- `api/v1.mjs` — universal and control-plane API
- `system.js`, `system.css` — progressive operating interface
- `tests/` — mechanism, lifecycle and universality verification


## Scrapy Cloud student-pack observation

The preferred no-card web-observation path is now Scrapy Cloud. A deployable generic observer lives in `scrapy/`, while `lib/scrapy-cloud.mjs` integrates the Scrapy Cloud Jobs and Items APIs into Company Zero's generic capability/evidence pipeline. See `docs/SCRAPY_CLOUD.md`. The existing paid Zyte API adapter remains optional.


### TensorMux timeout

Set `TENSORMUX_TIMEOUT_MS=60000` on Vercel and Railway. The runtime clamps this to 5–180 seconds and defaults to 60 seconds.
