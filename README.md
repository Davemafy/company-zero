# Company Zero

**Connect capabilities. Define an outcome. Company Zero builds, operates, evaluates, and restructures the organization required to achieve it.**

Company Zero optimizes the organization around agents rather than optimizing a single agent. A model may propose structure, but execution evidence and hard promotion gates decide whether the structure survives.

## Product

Open `/` after deployment.

The product has seven connected surfaces:

- **Command** — outcome, economics, incident, and organization health
- **Work** — persistent operating ledger
- **Organization** — promoted executable structure and constitution
- **Experiments** — incumbent vs shadow challenger evaluation
- **Capabilities** — typed capability registry
- **Memory** — retained structural lessons and version history
- **Controls** — autonomy boundaries, revision safety, and kill switch

The production path has no built-in business domain. It accepts generic HTTP, MCP-manifest, and human-review providers and synthesizes from their capability semantics. Historical demo fixtures remain isolated under the legacy benchmark files and are not used by the product runtime.

## Core mechanism

`outcome → organization → execution → evidence → diagnosis → challenger → shadow evaluation → promotion → memory`

The critical boundary is:

> **The model proposes. The runtime proves. The governor promotes.**

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

Optional TensorMux and Neatlogs variables are documented in `.env.example` and `docs/DEPLOYMENT.md`.

## Verify

```bash
npm run verify
```

Verification covers syntax, adversarial mechanism checks, product lifecycle tests, all three environment adapters, capability discovery, shadow evaluation, promotion gates, stale-revision rejection, institutional memory, and the 220-case benchmark suite.

## Architecture

- `platform/kernel.mjs` — product environment/capability/promotion kernel
- `engine.js` — organization synthesis, diagnosis, governance, mutation validation
- `lib/runtime-core.mjs` — authoritative reference execution/evaluation
- `product-api.mjs` — programmatic lifecycle object
- `api/` — Vercel server functions
- `product-v5.js` — product client
- `main.js` — evidence console client
- `tests/` — mechanism and product verification
- `reports/benchmark-report.json` — generated benchmark evidence
