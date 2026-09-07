# Production runtime verification — 2026-09-07

Session: `dd4883a5-4bdb-44de-a127-6ac2a9550d57`  
Company: `764fa905-9649-4777-900c-5152719d145a`

Created through `startOperatingSession` in a separate local production-mode process using real Supabase and TensorMux, with Scrapy, Zyte, and configured-provider variables removed. Initial capability count was zero. All queued stages and the operation were claimed by the deployed `company-zero-railway-1` worker. No local worker executed those jobs.

| Check | Result | Durable evidence |
| --- | --- | --- |
| Provider persisted by worker | PASS | `c260a171-25a9-45b4-b75e-9c9addfea6bb`, adapter `scrapy-cloud` |
| World includes `observe_public_web` | PASS | World `f99bfde2-c717-4e7e-8f1a-42d0bcc8fb42`, capability `38b6f2c0-af5c-4f12-9ab4-9f37fcab1877` |
| Strategy binds capability | PASS | Selection `03c94bbc-aa82-46d6-9cfa-a1309dfd766c` requires that capability |
| Validated operation plan | PASS after one explicit queue retry | TensorMux plan `4e63ca6e-b184-465c-843f-2fcfe581eec7` uses the same capability and selection |
| Automatic Scrapy launch | PASS | New `generic_observer` job `877155/1/3`, started 14:24:29 UTC, matching the queued operation and target |
| Automatic result retrieval | FAIL | Runtime trace `e0a678b2-e0fd-4c61-a3f0-b037699ac23f` records `scrapy_cloud_run_http_400` |
| EXTERNAL_OBSERVATION persisted | FAIL | No external observation or external world fact exists for this company |
| Session past equipping | PASS | `producing_progress`, state `operating`; this does not mean its run succeeded |

Operation job: `b909ceb2-bbea-4ee3-9b45-0dee48bddf97`. Run: `b73ad44d-b228-4043-9c23-a0d0db1d9845`, state `failed`. Its durable queue entry also ended `failed`.

## Remaining failures

The first planner attempt ended `awaiting_operation_plan` with no persisted planner response. An independent request with identical persisted inputs returned a valid TensorMux plan. One explicitly queued Railway retry produced the real validated plan; no plan was manually injected.

The automatically launched Scrapy job finished with one item and zero errors. Its last update was 14:25:15 UTC, approximately 46 seconds after starting. The adapter's default wait is 45 seconds. `invokeHttpCapability` retries the entire Scrapy adapter on a 504, which launches a new job rather than continuing to retrieve the existing one. The final persisted error is HTTP 400 from launch; the initial error and remote job ID were not persisted. Timeout followed by a failed relaunch is consistent with these observations, but cannot be conclusively established from the retained worker trace.

A separate, explicitly identified local transport probe launched `877155/1/5`; it finished in approximately 39 seconds and the unchanged adapter retrieved 127 characters of page text successfully. This probe is not counted as production observation persistence or as success for the failed Railway operation.

The old predeployment session `37670da9-b96f-445d-846d-005a5cbcd67f` remains blocked; redeploying does not requeue its already-completed stage jobs.

## Validation

All 17 tests in `npm test` passed. Diagnostic scripts passed syntax checks. No runtime fix was made or deployed during this verification, and no capability success or observation was fabricated.

Repeat the read-only check with:

```sh
node --env-file=.env scripts/verify-runtime-session.mjs 764fa905-9649-4777-900c-5152719d145a
```
