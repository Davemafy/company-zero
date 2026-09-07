# Company Zero completion verification

## Architecture

Browser → Vercel UI/API → Supabase/PostgreSQL durable control plane → persistent worker → TensorMux → declared real capability providers → independent external evidence → evaluator → Governor → organization evolution.

## Root causes closed in this build

1. Capability sufficiency was categorical rather than semantic. Observe/change/verify bindings now require overlap with declared state domains, observations, changes, or metric identities. An unrelated change capability cannot satisfy a mission merely because it has `operationKind: change`.
2. Operation execution used `find()` by capability ID while iterating roles, so the same capability could not execute twice in one plan. Production plans now execute their persisted ordered steps, with a durable `stepIndex` checkpoint and a unique invocation key per step.
3. The runtime lacked a bounded general-purpose write provider for a controlled production proof. A GitHub repository adapter now supports one-file commits against a runtime-configured repository, with approval, attribution, idempotent no-op recovery, and uncertain-side-effect handling.
4. Independent post-change verification was not available as a generic built-in adapter. An opt-in public HTTP probe can measure public response status, bytes, content hash, and request latency independently of the action provider.
5. Experiment aggregation stopped at `awaiting_decision`. Eligible candidates are now promoted automatically through the existing atomic promotion gate; no candidate is promoted without positive quality delta, complete evidence, no uncertainty, policy pass, and non-increasing cost.
6. A promoted experiment tied to an operating session now schedules a durable activated replan so subsequent mission work continues from evidence rather than requiring manual queue intervention.
7. Legacy Studio/TensorMux paths had two pre-existing failures. TensorMux strict-JSON completion and internal Studio provider support were restored, and Studio artifacts are persisted as durable artifacts.

## Local verification

`npm run verify`: PASS.

The configured test suite includes the original control-plane/runtime tests plus:

- semantic capability sufficiency
- repeated baseline/action/after plan execution
- independent external outcome verification
- Governor `OUTCOME_ACHIEVED`
- automatic experiment promotion
- post-promotion execution
- GitHub idempotent retry/no duplicate side effect
- Studio TensorMux and project-deliverable paths

`npm run test:integration`: SKIPPED because PostgreSQL/Supabase test credentials were not available in this environment. The suite correctly reports SKIPPED rather than PASS.

## Production verification

A production verifier is included at `scripts/production-golden-path.mjs` and exposed as `npm run verify:production`. It starts one fresh mission through the public API, polls the durable session, optionally approves controlled writes only when `CZ_GOLDEN_AUTO_APPROVE=true` is explicitly set, collects evidence/control-plane records, checks duplicate side effects, and writes JSON + Markdown reports under `reports/`.

This environment does not have the user's production Supabase credentials, GitHub repository credentials, or authenticated deployment control for Vercel/Railway, so a fresh production run could not be executed here.

## Required production configuration for the controlled web/repository proof

- existing Supabase, Railway, TensorMux, Neatlogs, Scrapy Cloud configuration
- `GITHUB_TOKEN`
- `GITHUB_REPOSITORY=owner/repository`
- optional `GITHUB_BRANCH=main`
- `PUBLIC_HTTP_PROBE_ENABLED=true`
- deploy the same verified commit to Vercel and Railway
- set `COMPANY_ZERO_BASE_URL` locally when running the production verifier

## Verdict

**COMPANY ZERO END-TO-END: FAIL (production proof not executable from this environment).**

The code path is locally closed and test-proven, but the requested definition of done explicitly requires a fresh real production lifecycle. That claim must not be fabricated without deploying this exact build and capturing the resulting external evidence.
