# Company Zero Hardening 16

This pass removes code-side catches that could make the production proof misleading or unsafe.

## Changes

1. Added per-company browser-session access control for protected companies across `/api/v1/companies/:id/**` routes.
2. Filtered company listings so protected companies are not disclosed to unrelated browser sessions.
3. Production-created low-level companies receive an owner session automatically; legacy unowned companies remain migration-only in production unless explicitly enabled.
4. The production golden-path verifier now preserves the owner-session cookie it receives when creating the fresh mission.
5. `CZ_GOLDEN_AUTO_APPROVE` is restricted to approvals belonging to jobs/runs in the fresh verification session. It no longer approves unrelated pending approvals for the company.
6. Production proof duplicate-side-effect detection now uses canonical input serialization instead of object insertion order.
7. A failed production golden-path verdict now exits non-zero, so CI/deployment automation cannot report a successful command when the proof failed.
8. Added `preflight:production`, checking public API health, durable Supabase storage, reasoning, observation, action, verification provider configuration, and a healthy durable worker before running the golden path.
9. Strengthened the worker-claim proof so a healthy unrelated worker alone is insufficient; mission runtime evidence must also exist.
10. Added regression tests for company access isolation and production-proof lineage/duplicate/verdict behavior.

## Verification

`npm run verify`: PASS

Added passing tests:
- `company-access-boundary: PASS`
- `production-proof: PASS`

`npm run test:integration`: `integration: SKIPPED (database credentials not configured)`

No live production verdict is claimed from this environment. `npm run verify:production` now performs preflight first and exits non-zero unless the fresh real production mission passes every proof check.
