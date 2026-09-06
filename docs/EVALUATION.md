# Evaluation protocol

Company Zero separates proposal from proof.

1. Compile the current organization from mission constraints and available tools.
2. Execute every case through the actual role/tool chain.
3. Score only observable outcomes against a held-out expected result.
4. Diagnose failures from failed evidence IDs and raw execution traces.
5. Propose multiple structural mutations.
6. Reject mutations that use unavailable capabilities or ungrounded evidence.
7. Compile every surviving candidate into an executable organization.
8. Rerun the identical workload for every candidate.
9. Apply hard constitution gates: quality, budget, latency.
10. Promote only the best candidate that passes all hard constraints.

The LLM can propose structure and diagnosis but does not provide the success score used for promotion.

## Included benchmark suites

- `data/benchmarks/finance-120.json`: 120 invoice cases with duplicates, missing POs, high-value exceptions, and total-integrity drift.
- `data/benchmarks/support-100.json`: 100 support cases with ordinary requests, email PII, and sensitive payment data.
- `reports/benchmark-report.json`: generated benchmark output from the current engine.

Run `npm run benchmark` to regenerate the report.
