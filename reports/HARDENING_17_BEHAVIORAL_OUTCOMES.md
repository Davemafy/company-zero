# Hardened 17 — Universal Behavioral Outcomes

This pass closes the gap between runtime correctness and useful arbitrary-goal behavior without adding prompt- or vertical-specific production branches.

## What changed

- Added `lib/work-compiler.mjs`, a universal model-backed work compiler.
- Any natural-language request is compiled into a work contract containing:
  - desired outcome
  - assumptions policy
  - question policy
  - semantic success definition
  - acceptance criteria
  - minimal causal deliverable set
  - authority boundaries
- Studio production now builds from that work contract instead of relying on a generic `build_deliverable` brief alone.
- Added a second model role: universal outcome critic.
- A model-generated bundle is not accepted merely because files exist. The critic gates directness, usefulness, completeness, truthfulness, and unsupported external claims.
- External outcomes remain evidence-gated. The compiler may produce useful non-external work immediately but cannot claim purchases, deployments, applications, revenue, measurements, customers, or other real-world effects without provider evidence.

## Non-hard-coded guarantee

The production compiler contains no special-case branches for the behavioral test prompts. `tests/behavioral-outcomes.test.mjs` explicitly scans the production implementation and fails if any exact test prompt is embedded in `lib/work-compiler.mjs`.

The five behavioral contract cases are:

- `make me dinner`
- `get me a software job`
- `I need a fashion company`
- `my store is not selling. fix it`
- `reduce my cloud bill by 20%`

The test exercises the same universal compile → build → semantic review path for every case.

## Important proof boundary

`behavioral-outcomes: PASS` proves the universal behavioral contract and the model integration path using a deterministic TensorMux test double. It does **not** claim that an untested live TensorMux model will always generate a high-quality answer for every arbitrary request. Production still uses the same generic prompts and quality gate, and live model quality must be verified against the deployed TensorMux configuration.

## Verification

`npm test` passes, including all prior tests plus:

`behavioral-outcomes: PASS`
