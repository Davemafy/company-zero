# Deliverable Engine

Company Zero treats the requested outcome as something that must become a durable, usable version rather than a stream of reasoning text.

## Contract

Every product-mode session creates a `deliverable_contract`. Studio production output is persisted by `lib/deliverable-engine.mjs` as an append-only `artifact` revision. Version 1 is never overwritten by Version 2.

## Persistence

When Supabase is configured, file bodies are stored in the private `company-zero-artifacts` Supabase Storage bucket using the existing service-role credential. Artifact records keep file names, MIME types, byte counts, SHA-256 hashes, storage paths, revision links, and a manifest. No additional API key is required.

Development-memory mode stores file content inline so the same runtime can be tested locally without external infrastructure.

## Serving

`GET /api/artifact?id=<artifact-id>` returns the selected immutable revision as a ZIP. `mode=preview` opens website artifacts. `mode=manifest` returns safe metadata and hashes, never the service-role key or raw storage credentials.

## Revision rule

A subsequent successful production pass for the same operating session creates V2, points back to V1 through `previousArtifactId`, and updates the deliverable contract's `latestArtifactId`. Prior revisions remain available.

## Product invariant

Ambiguity may change assumptions, but it must not prevent creation of the strongest reversible V1 that the available capabilities can truthfully produce. Missing system capabilities stay internal; only user authority boundaries interrupt the user.


## V1 hardening contract

Production artifact bytes live in a private Supabase Storage bucket. Provision it explicitly with `npm run setup:artifacts`; runtime jobs never create infrastructure. `db/005_deliverable_artifacts.sql` adds separate deliverable revisions, artifact identities, artifact revisions, and file metadata. Version allocation is serialized in PostgreSQL with an advisory transaction lock. Storage objects are immutable and revision-addressed; uploads never use upsert.

Artifact paths preserve safe relative directories, binary payloads are first-class, and generated website previews execute inside an opaque-origin sandbox rather than the Company Zero application origin. Failed/stale staged revisions are cleaned and reconciled instead of being presented as ready. A V1 contract uses `completionPolicy=single_validated_bundle`: the whole validated bundle is the unit of readiness, so one partial file cannot complete the deliverable.

Product-created companies are bound to an HttpOnly same-origin browser session. Artifact download/preview requires that owner session, preventing an artifact UUID from acting as authorization. This is session isolation rather than account identity; a future account system can replace the session owner without changing artifact ownership checks.
