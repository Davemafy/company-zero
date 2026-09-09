# Company Zero V1 Done Build

This build adds the first-class Deliverable Engine on top of the verdict build.

## What changed

- Every Studio-produced deliverable is persisted as an immutable artifact revision.
- Supabase Storage is used automatically in production through the existing Supabase service-role credential; no additional API key is required.
- Development-memory mode keeps files inline for local testing.
- Every file records MIME type, byte count, SHA-256 digest, and storage path or inline development body.
- Re-running production for the same operating session creates V2, V3, and so on; previous revisions are preserved and linked through `previousArtifactId`.
- The deliverable contract tracks the latest ready artifact/version.
- `/api/artifact` can preview websites, download any immutable revision as a ZIP, or return a safe manifest.
- The Work UI shows the latest version, real persisted files, download/open actions, and prior-version history.
- Added a five-prompt torture test across radically different input classes.

## Product completion test

The V1 contract is now:

1. Accept plain-language intent.
2. Infer low-risk ambiguity.
3. Produce concrete files instead of stopping at a plan.
4. Persist those files durably.
5. Expose the usable version to the user.
6. Preserve older versions when the approach changes.
7. Interrupt only at real authority boundaries.

## Verification

`npm run verify` passes the complete suite, including `deliverable-engine.test.mjs` and `v1-torture-test.mjs`.
