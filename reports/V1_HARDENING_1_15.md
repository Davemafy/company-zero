# Company Zero V1 hardening — catches 1–15

All fifteen audit catches were addressed in this build.

1. Added `db/005_deliverable_artifacts.sql`.
2. Added atomic PostgreSQL revision reservation using `pg_advisory_xact_lock`; development memory path is serialized too.
3. Artifact history/versioning is scoped by `deliverableContractId`, not operating session.
4. Product-created companies receive an HttpOnly owner session and artifact API enforces ownership.
5. Supabase Storage uploads are immutable (`x-upsert: false`) and revision-addressed.
6. Artifact files accept text, Buffer/Uint8Array and base64 binary payloads.
7. Safe relative directory paths are preserved; traversal and collisions are rejected.
8. Uploads use staging metadata, cleanup-on-failure, and stale staging reconciliation.
9. V1 readiness is explicit: a validated complete bundle is the completion unit.
10. Deliverable revision, artifact identity and artifact revision are separate durable concepts.
11. Core artifact metadata moved out of the generic record blob into dedicated normalized tables while the compatibility artifact record remains for existing UI/runtime surfaces.
12. Structural/content validation covers emptiness, size, placeholders, JSON, CSV and website entry requirements before readiness.
13. Added a five-category semantic quality contract test in addition to the route torture test.
14. `system_capability_gap` now resolves when coverage becomes sufficient and is superseded when the missing set changes.
15. Runtime no longer creates Storage buckets; explicit deployment provisioning is `npm run setup:artifacts`.

No new third-party API key is required. The artifact bucket uses the existing Supabase project.
