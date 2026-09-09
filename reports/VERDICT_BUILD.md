# Company Zero — Verdict Build

Canonical base: `company-zero-backend-end-to-end.zip`.

This build keeps the stronger outcome-control backend intact and ports the Universal V1 product contract on top.

## Preserved from backend-end-to-end

- outcome → success conditions → deliverable DAG
- PageSpeed measurement
- Vercel deployment verification
- durable execution / leases / queue
- external evidence and independent outcome verification
- Governor / experiments / promotion / rollback
- `db/004_outcome_control.sql`
- all backend end-to-end tests

## Added from Universal V1

- every product-submitted outcome starts with `v1Mode: true`
- durable `deliverable_contract` created immediately
- built-in Company Zero Studio registered for universal V1 work
- `build_deliverable` is a declared change capability with a mission-envelope contract
- ambiguous inputs infer reversible assumptions and create a concrete V1 instead of defaulting to a plan
- incomplete system capability coverage becomes `system_capability_gap` when Studio can still produce V1; it does not become a user access blocker
- user-facing Work surface centers Version 1 and actual artifact files
- raster organism brand assets and the current product shell

## Safety / truth boundary

V1 creation may synthesize artifacts, but it must not fabricate external research, customers, revenue, legal status, deployments, measurements, or completed real-world actions. Missing external authority/capability remains explicit in runtime evidence.

## Verification

`npm run verify` passes the full canonical suite plus `tests/universal-v1-product.test.mjs`.
