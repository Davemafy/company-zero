# Company Zero architecture

Company Zero is a general operating interface built above the existing durable organization control plane.

`natural-language outcome → goal contract → world model → strategy search/critique → strategy selection → organization revision → persisted operation plan → durable work → invocation evidence → external observations → independent verification → Governor`

## Universal layer

- **Goal Compiler:** desired/current state, success criteria, constraints, budget, authority and unknowns.
- **World Model:** entities, resources, systems, people, data, observable/controllable state, permissions and unknowns.
- **Capability Discovery:** reads the existing registry; missing access becomes an explicit persisted blocker.
- **Strategy Search:** compares multiple paths before an organization exists.
- **Organization Synthesis:** receives the goal contract, world model, selected strategy and actual capability records.
- **Outcome Verification:** keeps execution success separate from world change and requires grounded observations.
- **Governor:** classifies execution, strategy, organization and capability failures, plus an achieved outcome.

These concepts use `cz_records`, sharing the canonical optimistic concurrency, audit and Postgres durability model rather than introducing a second datastore.

## Authority boundary

**The model proposes. The runtime executes. The evaluator judges. The Governor promotes.**

TensorMux is the canonical production model gateway for contracts, strategies, organization proposals, operation plans, diagnosis, conversation interpretation and replanning. It cannot invoke capabilities, create evidence, declare an outcome achieved, settle budget or promote. The invocation journal, approval checkpoint, queue, transactional budget functions and atomic promotion RPC remain authoritative.

## Production topology

- **Vercel:** browser and asynchronous API.
- **Supabase/PostgreSQL:** records, queue, leases, invocations, approvals, evidence, experiments, budgets and atomic promotion.
- **Persistent worker host:** one long-running Node worker process with no authoritative local state. Railway is the current production deployment target; the runtime remains vendor-neutral.
- **TensorMux:** model proposals only.
- **Zyte:** bounded generic public-web observation.
- **Neatlogs:** semantic reasoning and runtime traces.

See `docs/PRODUCTION_INFRASTRUCTURE.md` for deployment and honest readiness status.

## Failure honesty

No capability means `awaiting_capabilities`, not a demo result. A successful HTTP response means execution succeeded, not that the mission succeeded. Outcome success requires an observation bound to the target metric. Ambiguous or unavailable evidence yields `insufficient_observation`.
