# FleetNorm: multi-OEM telemetry normalisation + idling-cost intelligence

Connected Vehicle Intelligence Hackathon submission. **Synthetic data only.**

**The idea.** Every OEM sends telemetry in a different shape (field names, units, time formats). FleetNorm normalises five OEM formats into one canonical schema **using versioned, hot-reloadable mappings** (a new OEM is onboarded from the UI with no deploy), runs deterministic streaming rules on the result (idling, harsh braking, repeated DTCs, speed anomalies), and turns idling into rupees on a fleet dashboard. One small ML component ranks breakdown risk; everything else is rule-based and explainable.

```
simulator ─HTTPS NDJSON→ ingest ─Kafka API (key=VIN)→ processor ×N ─→ ClickHouse (telemetry + hourly rollup)
                                                          ├──→ Redis (latest state, dedup, pub/sub)
                                                          └──→ PostgreSQL 3NF (alerts) ; MongoDB (OEM mappings, dead letters)
React UI ←→ API (JWT · RBAC · tenant isolation · audit) ←→ ML service (FastAPI, circuit-breaker + rule fallback)
```
Diagrams: `docs/architecture.md`, `docs/erd.md`. Decisions: `docs/adr/` (5 ADRs). Threats: `docs/stride.md`.

## Quick start (needs Docker ≥ 24, ~8 GB RAM free)
```bash
make up        # build + start everything (first run pulls images; wait ~2-3 min)
make ps        # all services should be healthy
make seed      # 100,000 vehicles, 3 fleets, users, OEM mappings A-D
make sim       # simulator: 2,000 events/s across OEMs A-E (RATE=... VEHICLES=... to change)
```
Open **http://localhost:8080** · Grafana http://localhost:3000 (anonymous viewer) · Prometheus :9090

| Login | Role |
|---|---|
| admin@fleetnorm.dev / Admin@123 | admin (all, incl. OEM onboarding) |
| manager@fleetnorm.dev / Manager@123 | manager (can acknowledge alerts) |
| viewer@fleetnorm.dev / Viewer@123 | viewer (read-only, coordinates masked) |
| admin@otherco.dev / Other@123 | second tenant (proves isolation; sees no data) |


## What was verified, and what was not
**Verified by running it (in a sandbox, during the build):**
- 40 unit tests; 100 % line coverage of the pure-logic modules (`make coverage`, gate 80 %). *Scope disclosure: coverage covers `shared/`, `normalise`, `rules`, `parse`, `api/util`. The service entrypoints (Kafka/HTTP glue) are exercised by `make e2e`, not by unit tests.*
- Round-trip test for all 5 OEM wire formats; test shows the same payload fails before and passes after the OEM-E mapping.
- Simulator generates ≈105-115K events/s in one Node process (100K vehicles, dry run, includes duplicates and out-of-order).
- PostgreSQL 16 schema applies; seed loads 100K unique, check-digit-valid VINs in ~3 s and is idempotent.
- The API was run against real Postgres + Redis (Mongo/ClickHouse stubbed): 401 without token, login/refresh, RBAC (403), tenant isolation (404/empty, including ack), location masking, audit rows, login rate limit (429), helmet headers, ML-down fallback, mapping preview/create/activate, erasure.
- Redis Lua "set latest if newer", `ZADD GT`, and dedup checks against a real Redis.
- EXPLAIN ANALYZE before/after on 500K alerts (`docs/sql/optimisation.md`), including one optimisation that did not work until the query was rewritten.
- ML training + serving (metrics in `docs/ml/results.md`); frontend `vite build`.

**Since updated (2026-10-01): the full stack was run end-to-end and these are now verified, with real measured evidence in `docs/perf/`:**
- The full Docker stack end to end (Redpanda, ClickHouse, MongoDB, Kafka→processor→ClickHouse) — run repeatedly today; two real bugs found and fixed (`docs/perf/api-latency.md`).
- Load test at k6: 100K events/s does **not** hold on a single-laptop topology (honest numbers + root cause in `docs/perf/load-test.md`); real sustainable ceiling and API p95 (101ms, meets target) are measured, not guessed.
- Chaos test: broker killed mid-stream, zero data loss, zero duplicate rows (`docs/perf/chaos-test.md`).
- `terraform validate`/`plan` clean against a live AWS account, and `terraform apply` actually run (see `docs/perf/iac-validate.md`, `docs/perf/cloud-deploy.md`) — real EC2 deployment, seeded, verified reachable and logging in over the public internet. `helm lint`/`template` clean.
- CI pipeline runs on every push: coverage, frontend build, ML training all pass. **Still open:** the `security` (Semgrep/Trivy) and `e2e-dast` (OWASP ZAP) CI jobs are currently failing and have not yet been root-caused — disclosed honestly rather than hidden.
- Known gaps: alerts can duplicate on crash-replay; `trip` entities and geofencing are not implemented; one shared device API key; no refresh-token revocation; OAuth2/OIDC, mTLS and a secrets vault are documented as future work (ADRs/Solution Doc), not implemented.

## Layout
```
backend/   ingest, processor, api, simulator (Node 20 ESM, one image, four entrypoints)   tests/   db/   mappings/   scripts/seed.js
frontend/  React + Vite (nginx in Docker)
ml/        scikit-learn training + FastAPI serving
infra/     docker-compose, prometheus, grafana, k6, chaos, terraform, helm
docs/      adr/ architecture erd stride algorithms sql/ ml/ perf/ compliance SOLUTION_DOC_DRAFT
```

## Submission checklist
- [x] `make up && make seed && make sim` works end-to-end — run 2026-10-01, two real bugs found and fixed along the way (see `docs/perf/`)
- [x] `make coverage`, `make load`, `make chaos`: real outputs in `docs/perf/load-test.md`, `docs/perf/chaos-test.md`, `docs/perf/api-latency.md`. `make explain` output already in `docs/perf/explain-output.txt`
- [ ] Screenshots, 5-minute demo video, fill the Word template (`docs/SOLUTION_DOC_DRAFT.md` is pre-written and now has real numbers filled in)
- [x] Declare AI + open-source tools (below)
- [ ] `git tag v1.0-submission` on the final commit; submit **well before the 8 pm deadline**
- [x] Pushed to GitHub: https://github.com/Adarsh0759/Motarq-refence-project — CI runs on every push (`.github/workflows/ci.yml`: coverage gate, frontend build, ML training, SAST/Trivy/dependency-audit, e2e smoke + DAST)

## Declarations
**AI tools used:** An AI coding assistant was used for design discussion, code generation, test writing, documentation, and debugging. All code was reviewed and run by the team. **Open source:** Node.js, Express, kafkajs, zod, pino, prom-client, opossum, helmet, bcryptjs, jsonwebtoken, ioredis, pg, mongodb driver, @clickhouse/client, swagger-ui-express, React, TypeScript, Vite, Tailwind CSS, Radix UI, class-variance-authority, tailwind-merge, Framer Motion, TanStack Query, React Router, lucide-react, sonner, Recharts, Leaflet/OpenStreetMap tiles, Redpanda, PostgreSQL, MongoDB, ClickHouse, Redis, scikit-learn, FastAPI, Prometheus, Grafana, k6, Terraform, Helm.
