# Threat model

Company Zero assumes the organization brain may be wrong, overconfident, or hallucinate.

Controls:

- Evidence IDs in diagnoses must correspond to actual failed cases.
- Proposed tools must exist in the mission allowlist.
- Duplicate capabilities are rejected before compilation.
- The model never owns runtime cost accounting.
- The model never owns the final evaluation score.
- Every candidate is executed on the same workload before promotion.
- Budget, latency and quality are hard gates rather than soft preferences.
- Human-review roles remain explicit for material exceptions.
- Live provider failure degrades to an inspectable deterministic reference path rather than fabricating a successful model call.
- Neatlogs export is optional and failure to emit telemetry never changes execution results.
