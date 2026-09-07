# Company Zero API v1

## Start from an outcome

`POST /api/v1/outcomes`

```json
{"goal":"Reduce our measurable operating cost by 20% without lowering reliability","context":{"currentMetrics":{"monthly_cost_usd":10000}},"constraints":{"dailyBudgetUsd":30}}
```

The response is an inspectable operating session with the company, stage artifacts, strategy options and conversation history. Context values are stored as `USER_CLAIM`, not external evidence. If no real capability is available, its state is `awaiting_capabilities`; no work or synthetic progress is created.

Deployment operators can expose existing generic providers through `COMPANY_ZERO_PROVIDERS_JSON`. The normal interface discovers these automatically. Manual provider registration remains in Developer/Advanced.

## Continue and converse

- `GET /api/v1/companies/:companyId/sessions/:sessionId`
- `POST /api/v1/companies/:companyId/sessions/:sessionId/advance`
- `POST /api/v1/companies/:companyId/sessions/:sessionId/messages`
- `POST /api/v1/companies/:companyId/observations`
- `GET /api/v1/companies/:companyId/world`
- `GET /api/v1/companies/:companyId/outcome-contracts`

Conversation changes are persisted. User observations remain claims and cannot independently satisfy the outcome verifier. Material goal or authority changes create a new mission record and supersede, rather than overwrite, the previous mission.

## Existing control plane

The companies, providers, jobs, events, organizations, experiments, approvals, rollback, controls, evidence and memory routes remain available. Work is asynchronous and revision-pinned. The model cannot execute capabilities, judge its own outcome, reserve budget or promote a candidate.

`GET /api/v1/runtime/workers` returns durable worker heartbeat rows and a derived health flag. It returns an empty list in development-memory mode.
