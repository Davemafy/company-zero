# Company Zero API

Company Zero is usable as a product primitive, not only through the dashboard.

## Create an autonomous organization
`POST /api/organizations`
```json
{"mission": {"id":"...","title":"...","domain":"finance_ops","budget":6,"qualityFloor":0.95,"latencyCap":8,"constraints":[],"tools":[],"workload":[]}}
```
Returns an organization id and compiled organization.

## Operate and self-restructure
`POST /api/organizations`
```json
{"id":"<organization-id>","action":"operate"}
```
Returns execution, diagnosis, governor decision, evaluated candidate organizations, promotion, and the new snapshot.

## Change mission without resetting the organization
```json
{"id":"<organization-id>","action":"mission","preserveOrganization":true,"mission":{...}}
```

## Inspect
`GET /api/organizations?id=<organization-id>`

The API keeps model proposal and runtime proof separate. Serverless in-memory storage is intentionally replaceable; production deployments should use a durable store.
