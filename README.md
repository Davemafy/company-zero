# Company Zero

Connect capabilities. Define an outcome. Company Zero builds, operates,
evaluates, and restructures the organization required to achieve it.

Company Zero optimizes the organization around agents rather than optimizing a single agent. A model may propose structure, but execution evidence and hard promotion gates decide whether the structure survives.

## Run locally

```bash
npm install --global vercel
vercel dev
```

Open `http://localhost:3000`. No package install is required because the project
has no runtime dependencies.

## Product

The product has seven connected surfaces:

- **Command** — outcome, economics, incident, and organization health
- **Work** — persistent operating ledger
- **Organization** — promoted executable structure and constitution
- **Experiments** — incumbent vs shadow challenger evaluation
- **Capabilities** — typed capability registry
- **Memory** — retained structural lessons and version history
- **Controls** — autonomy boundaries, revision safety, and kill switch

## Core mechanism

`outcome → organization → execution → evidence → diagnosis → challenger → shadow evaluation → promotion → memory`

The critical boundary is:

> **The model proposes. The runtime proves. The governor promotes.**

The same platform kernel ships three environments: Customer Support, Finance
Operations, and Software Engineering. Each has its own outcome, constraints,
capabilities, and organization.

## Evidence and verification

The evidence console at `/evidence.html` contains benchmark results, runtime
traces, restructuring evidence, and the AO evidence ledger. AO session history
must be genuine and is never fabricated by the application.

```bash
npm run verify
```

Verification covers syntax, adversarial mechanism checks, product lifecycle tests, all three environment adapters, capability discovery, shadow evaluation, promotion gates, stale-revision rejection, institutional memory, and the 220-case benchmark suite.

## Repository map

| Path | Purpose |
| --- | --- |
| `index.html`, `product-v5.*` | Main browser product |
| `evidence.html`, `main.js`, `styles.css` | Evidence console |
| `engine.js`, `missions.js` | Organization engine and mission definitions |
| `platform/`, `lib/` | Platform kernel, runtime, and observability |
| `api/` | Vercel server functions |
| `sdk/`, `product-api.mjs` | Programmatic interfaces |
| `data/`, `reports/`, `scripts/` | Benchmark inputs, output, and runner |
| `tests/` | Mechanism and product verification |
| `docs/` | API, architecture, deployment, evaluation, and threat model |

## Deployment

The repository is Vercel-native: the product is served from `/`, the evidence
console from `/evidence.html`, and server functions from `/api`. Optional
TensorMux and Neatlogs settings are documented in `.env.example` and
`docs/DEPLOYMENT.md`.
