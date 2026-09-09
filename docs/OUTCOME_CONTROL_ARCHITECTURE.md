# Company Zero Outcome Control Architecture

Company Zero is an outcome-driven, event-sourced, graph-planned durable control system. The Mission is the root object; organizations and agents are execution mechanisms, not the center of the model.

## Canonical loop

```text
user desire
  -> outcome contract
  -> success conditions
  -> deliverable DAG
  -> organization synthesis
  -> capability binding
  -> durable operations
  -> external receipts / observations
  -> evaluation
  -> Governor
  -> keep | retry | rollback | replan | restructure | promote
  -> repeat
```

The runtime law remains:

> The model proposes. The runtime executes. The evaluator judges. The Governor promotes.

Model output may create hypotheses, plans, deliverables, and organizational proposals. It never independently proves that an external action happened or an outcome improved.

## Domain spine

The append-only `cz_records` store now contains first-class:

- `mission`
- `outcome_contract`
- `success_condition`
- `deliverable_graph`
- `deliverable`
- `deliverable_dependency`
- `deliverable_artifact`
- `organization_revision`
- `operation_plan`
- `job` / durable queue
- `invocation`
- `outcome_observation`
- `outcome_verification`
- `evaluation`
- `governor_decision`
- `experiment`
- `promotion_decision`
- `runtime_event`

Every external operation can therefore be traced from mission -> deliverable -> organization revision -> operation -> invocation -> evidence -> evaluation -> Governor decision.

## Deliverable graph

Company Zero first works backwards from the success conditions and derives what must exist, change, or be measured. Deliverables form a DAG and use universal kinds:

`knowledge | decision | creative | product | operation | pipeline | measurement | evidence`

A deliverable contains dependencies, semantic state domains, required capability modes, capability bindings, lifecycle state, operations, and evidence IDs.

Lifecycle:

```text
proposed -> ready -> producing/executing -> produced/executed
                                  -> verifying -> verified -> observed -> evaluated
                 -> blocked | failed | cancelled
```

Non-side-effecting decision/knowledge deliverables may be produced by the reasoning layer, but remain `MODEL_PROPOSAL`. External success still requires evidence from runtime capabilities.

## Capability plane

Capabilities declare what state they observe/change/verify. Binding is semantic, not merely `operationKind` matching.

Current production-capable adapters include:

- Scrapy Cloud / Zyte: bounded public-web observation
- GitHub repository: bounded one-file repository mutation with approval and idempotency
- Vercel deployment verification: waits for a deployment tied to a Git SHA to reach `READY`
- PageSpeed Insights: independent webpage performance measurement
- public HTTP probe: independent public-resource status/content verification
- generic HTTP/MCP/human providers through the existing registry

## Durable execution

Vercel accepts user/API work. Supabase/PostgreSQL owns durable state and the queue. A persistent Railway worker claims leased work, checkpoints it, renews leases, journals external invocations, enforces approvals/budgets, and resumes safely after interruption.

Provider success is not outcome success. A typical production web loop is:

```text
PageSpeed baseline
 -> bounded GitHub change
 -> Vercel deployment READY receipt
 -> PageSpeed after measurement
 -> outcome verification
 -> Governor
```

## Evidence boundary

External claims require external evidence. Important receipts include:

- repository commit SHA
- deployment ID / URL / READY state
- baseline measurement
- after measurement
- public observation reference
- invocation ID / trace ID
- outcome verification record

A model-generated sentence may guide work. It cannot prove work succeeded.

## Evolution

Real evaluations feed the existing Governor. The Governor may keep, replan, rollback, or restructure. Experiments compare candidate organization revisions under the same evidence contract. Promotion remains atomic and requires the existing hard gates; a candidate cannot be promoted on model preference alone.

## Production proof

`npm run verify:production` creates a fresh mission against the deployed API and verifies the mission, outcome contract, success conditions, deliverable graph, operation plan, worker, external action, independent observation, evaluation, Governor, evidence lineage, and duplicate-side-effect boundary.

A local green suite is not a production PASS. The production verifier must capture real provider receipts before Company Zero is described as end-to-end live.
