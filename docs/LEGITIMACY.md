# Legitimacy boundary

Company Zero distinguishes four claim classes:

- `USER_CLAIM` — supplied by a user; useful context, never external proof.
- `EXTERNAL_OBSERVATION` — extracted through a declared measurement mapping from a schema-valid capability response and linked to its invocation trace.
- `MODEL_INFERENCE` / `MODEL_PROPOSAL` — a hypothesis or plan, never a world fact.
- `UNKNOWN` — unresolved and displayed as such.

## What may count as progress

Outcome success requires two distinct externally grounded observations for each target metric: a baseline/before observation and a later observation. A provider returning an arbitrary `metrics` object is insufficient. The capability must declare the metric path and the resulting observation must retain the capability, trace, invocation, external reference when available, timestamp, confidence, and attribution reference when available.

Execution success and outcome success remain independent. A completed HTTP request can coexist with `insufficient_observation` or `not_achieved`.

## What the runtime blocks

- Universal work whose goal does not match the active mission.
- A stale strategy selection.
- Capability IDs outside the pinned organization revision.
- Operation arguments that do not satisfy the capability input schema.
- Operations for which neither TensorMux nor a declared mission-envelope adapter can produce a validated plan.
- Outcome claims based only on user reports, model prose, undeclared provider fields, or one observation.
- Sensitive effects without the existing durable approval checkpoint.
- Calls that exceed the transactional budget reservation.

## Capability discovery

An HTTP provider may expose `/.well-known/company-zero-capabilities`. Company Zero fetches, bounds, validates, persists, and records evidence for that external discovery response. Deployment-level provider definitions can therefore contain a base URL without an inline manifest.

Inline manifests remain an Advanced/Developer declaration and are labelled **declared**, not proven usable. MCP sources currently require a Company Zero adapter or a supplied manifest; the core does not pretend that an unavailable MCP transport was inspected.

Zyte is a verified adapter contract, not a vertical mode. Its normalized page observation becomes a trace-linked world fact after an authenticated, schema-valid invocation. It does not become an outcome measurement unless an explicit metric mapping exists and the independent baseline/after rules also pass.

## Honest local verification boundary

The acceptance suite uses loopback HTTP protocol fixtures to prove invocation, schema, approval, evidence, spoof resistance, and domain-independent control flow. Those fixtures are not evidence of a real third-party business outcome.

Live PostgreSQL verification requires:

```text
TEST_DATABASE_URL=postgresql://... npm run test:integration
```

Live integration verification requires real values in `.env` followed by:

```text
npm run test:integrations
```

Required live variables depend on the integrations being verified and include `TENSORMUX_BASE_URL`, `TENSORMUX_API_KEY`, `NEATLOGS_INGEST_URL`, and `NEATLOGS_WRITE_KEY`. Production durability additionally requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a continuously running worker.

When credentials are absent, these checks must report `SKIPPED` or `BLOCKED`; they must never be converted into a pass.
