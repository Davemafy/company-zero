# Company Zero architecture

Company Zero optimizes an organization, not a single prompt.

Mission contract -> Organization Brain -> executable organization -> Runtime -> independent evaluator -> evidence diagnosis -> Governor -> competing mutations -> same-workload reruns -> constitution gate -> promotion -> institutional memory.

## Authority boundaries

The model may propose organization structures, diagnoses, and mutations. It cannot create evidence IDs, execute hidden tools, set runtime costs, declare itself successful, or promote a candidate. Those are runtime-owned.

## Runtime

Each organization is a sequence of specialized roles backed by executable tools. Every case generates stage-level inputs/outputs, tool cost, latency, final decision, and pass/fail evidence. `/api/runtime` is the deployment execution path.

Reference mode is deterministic for demo reliability. Live mode keeps the tool runtime authoritative and asks TensorMux to audit the resulting trace. This makes model use visible without allowing the model to rewrite evaluation outcomes.

## Restructuring

A diagnosis must cite only failed evidence IDs produced by the current run. Mutations must be grounded in those diagnosis IDs and use only tools available to the mission. Every valid candidate is compiled into a real organization and rerun on the same workload. The Governor promotes only a candidate satisfying quality, budget, and latency constraints.

## Continuous change

The finance demo has two distinct failure regimes. The initial organization lacks cross-case comparison. After that is fixed, changed operating conditions introduce invoice-total integrity failures. Company Zero keeps the existing organization, diagnoses the new failure, and must restructure a second time.
