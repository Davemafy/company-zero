# Company Zero backend end-to-end build

## Canonical flow

```text
natural-language desire
 -> outcome contract
 -> success conditions
 -> world model
 -> deliverable DAG
 -> strategy search
 -> organization synthesized from deliverables
 -> semantic capability binding
 -> durable operation plan linked to deliverables
 -> Railway worker / leases / checkpoints
 -> real provider invocation
 -> external receipts + independent observations
 -> outcome verification
 -> deterministic evaluation
 -> Governor
 -> keep | replan | rollback | restructure | promote
```

## Added in this build

- First-class success conditions.
- First-class deliverable DAG with cycle/missing-dependency validation.
- Universal deliverable kinds and lifecycle states.
- Semantic observe/act/verify binding per deliverable.
- Model-produced non-side-effecting deliverables with explicit `MODEL_PROPOSAL` status.
- Operation steps linked to deliverable IDs.
- Deliverable evidence lineage populated from real execution traces.
- Runtime event ledger for mission, graph, deliverable, and evaluation events.
- API surfaces for deliverables, graphs, events, and hydrated outcome-control state.
- PageSpeed Insights independent performance measurement provider.
- Vercel deployment READY verification tied to a Git SHA.
- Existing bounded GitHub repository mutation kept as the action boundary.
- PostgreSQL migration/indexes for outcome-control objects.
- Production golden-path verifier strengthened to require the deliverable/evidence spine.

## Real-world web golden path

With scoped credentials/configuration, the intended production path is:

```text
measure_web_performance (baseline)
 -> decide bounded intervention
 -> commit_repository_file (approval-gated)
 -> wait_for_vercel_deployment(gitSha)
 -> measure_web_performance (after)
 -> outcome_verification
 -> Governor
```

The system must not infer outcome success from the GitHub or Vercel receipt. Only the independent after measurement may establish that the metric moved.

## Verification in this environment

`npm run verify`: PASS — all configured tests pass, including new outcome-control architecture, end-to-end deliverable lineage, and PageSpeed/Vercel provider tests.

`npm run test:integration`: SKIPPED — PostgreSQL test credentials were not configured. This is not represented as a PASS.

A live Vercel/Railway/GitHub/PageSpeed production loop was not executed from this environment because production credentials and deployment authority are not available here. Use `npm run verify:production` after deploying this exact build and configuring the scoped providers.
