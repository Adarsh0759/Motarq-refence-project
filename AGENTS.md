# FleetNorm: project guide for coding agents
Node 20 ESM backend (ingest/processor/api/simulator share `backend/`), React+Vite frontend, Python ML service. Synthetic data only.

## Commands
`make up|seed|sim|test|coverage|load|chaos|e2e|explain|logs|ps|down|clean` (see Makefile). Backend tests: `cd backend && npm test`.

## Rules
- Minimal diffs. No refactors unless asked. Never delete or weaken tests to get green; coverage gate is 80% (`npm run coverage`).
- Pure logic lives in `backend/src/shared`, `processor/normalise.js`, `processor/rules.js`, `api/util.js` (no I/O). Keep it that way.
- Every query must be tenant-scoped (fleet IDs derived from the JWT tenant). Never trust a tenant/fleet id from the client.
- Dedup ordering matters (ADR-4): check -> ClickHouse insert -> mark key -> commit offset. Do not mark before insert.
- NEVER invent metrics. Numbers in docs come from real runs; leave `TODO:MEASURE` if unknown. Do not claim cloud deployment, scans, or 100K eps until measured.
- Secrets: none in git. `NODE_ENV=production` refuses default secrets (compose runs in development mode on purpose).
- Shell scripts need bash; Makefile recipes need tabs.

## Status (2026-10-01)
Full docker stack, ClickHouse/Kafka path, k6/chaos scripts, Terraform (validated + applied to real AWS), Helm — all run, see `docs/perf/`. Still open: CI `security`/`e2e-dast` jobs failing (not root-caused), demo video, Word-template Solution Doc.

## Git
Sole author/owner: Adarsh Anand (adarshchotu09@gmail.com). Never mention any AI tool, model, or vendor name in commit messages, PR descriptions, or contributor metadata.
