# Deployment — Vercel

Company Zero is configured for Vercel. The product is served from `/`; the hackathon evidence console is `/evidence.html`; server functions live under `/api`.

## Deploy

1. Import the repository into Vercel.
2. Framework preset: **Other**.
3. Root directory: repository root.
4. No build command is required for the static product.
5. Add optional environment variables below, then deploy.

## Optional provider variables

- `TENSORMUX_BASE_URL`
- `TENSORMUX_API_KEY`
- `TENSORMUX_MODEL`
- `TENSORMUX_RUNTIME_MODEL`
- `NEATLOGS_WRITE_KEY`
- `NEATLOGS_API_KEY`
- `NEATLOGS_PROJECT`
- `NEATLOGS_INGEST_URL`

Without provider credentials, Company Zero uses the bounded reference runtime and labels that state rather than pretending a remote provider ran.

## Routes

- `/` — Company Zero product
- `/evidence.html` — benchmark / AO / hackathon evidence console
- `/api/health` — deployment/provider health
- `/api/brain` — organization brain
- `/api/runtime` — authoritative reference execution + optional live audit
- `/api/observe` — optional Neatlogs trace emission
- `/api/organizations` — programmatic organization lifecycle

## Persistence note

The browser product persists demo/company state in localStorage. `/api/organizations` currently uses process memory and therefore must not be treated as durable multi-tenant storage on serverless infrastructure. Replace it with a durable store before production multi-user use.
