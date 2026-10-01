# Solution Document: pre-written draft (maps 1:1 to the Word template, sections 1-17)
> Rules for finishing this: **(1)** replace every `TODO:MEASURE` with a real number from your own run; **(2)** add sources where it says `TODO:CITE`; **(3)** delete anything you did not actually verify. Facts already measured during the build are marked ✅ with where they came from.

**Team / Problem space:** Connected-vehicle data normalisation + fleet cost intelligence (idling, utilisation, maintenance risk). **Repo:** TODO. **Video:** TODO. **Date:** 01/10/2026.

## 1. Executive Summary
Fleets that buy vehicles from several OEMs receive telemetry in incompatible formats (different field names, units, timestamps), so fleet managers cannot compare vehicles or act on idling and faults without building a custom integration per OEM. **FleetNorm** normalises five OEM wire formats into one canonical schema through versioned, hot-reloadable mappings (a sixth OEM is onboarded from the UI with no deploy), applies deterministic streaming rules, and converts idling into an estimated rupee cost on a tenant-isolated dashboard.
Results (fill from your runs): sustained ingest **TODO:MEASURE** events/s · p95 end-to-end latency **TODO:MEASURE** s · API p95 **TODO:MEASURE** ms · chaos: accepted-vs-stored accounting **TODO:MEASURE**. ✅ Simulator throughput ≈105-115K events/s (single process, dry run); 40 unit tests, 100 % line coverage of pure-logic modules; ✅ Query optimisations 688→0.9 ms, 17.7→0.06 ms, 44.8→0.08 ms.
Innovations: (1) config-driven normalisation with preview/activate/rollback and zero-downtime onboarding; (2) crash-safe check→store→mark dedup ordering with honest duplicate accounting; (3) an ML ranker that must beat a tuned rule baseline and degrades gracefully.

## 2. Problem Statement & Validation
**2.1** A **fleet manager** of a mixed-OEM fleet needs a way to *see idling, faults and utilisation across all vehicles in one place* because *each OEM exposes a different schema and portal*, which today costs *wasted fuel and unplanned downtime* (**TODO:MEASURE/CITE** size). Secondary: drivers, maintenance teams, finance, OEMs/dealers.
**2.2 Evidence & validation**
| Evidence / Assumption | Source or Method | What It Shows | Confidence |
|---|---|---|---|
| OEMs expose heterogeneous telemetry schemas | Brief (Motorq problem statement) + our 5 simulated formats differing in names, units, timestamps | Normalisation is a real prerequisite | Medium (simulated) |
| Idling wastes fuel | TODO:CITE (e.g. US DOE/Argonne idling fact sheets) | Order of magnitude of cost | Low until cited |
| Idle burn ≈ 0.8 L/h, ₹95/L | **Assumption**, configurable (`IDLE_LITRES_PER_HOUR`, `FUEL_INR_PER_LITRE`) | Cost model input | Low: shown in UI as an assumption |
Validation method: simulation with synthetic data only (no interviews). Alternatives (aftermarket dongles, OEM portals, aggregators such as Motorq Fuse): TODO: state what you verified about them; do not assert features you did not check.
**2.3 Impact & success metrics**
| Metric | Baseline | Target | How measured |
|---|---|---|---|
| Time to onboard a new OEM | code change + deploy (assumed) | minutes via UI | demo (video timestamp TODO) |
| Events normalised per second | n/a | 100K | k6 (TODO:MEASURE) |
| Event accounting under broker failure | n/a | every accepted event stored / deduped / dead-lettered | `make chaos` (TODO:MEASURE) |
Scale (10K vs 100K vehicles): **TODO:MEASURE** or state as estimate. Wider impact: fuel/CO₂ reduction from idling reduction (estimate only).

## 3. Solution Description
**3.1** Vehicle/gateway posts NDJSON → ingest authenticates and buffers to Kafka → processor normalises, validates (VIN check digit, unit and range bounds), dedups, stores, evaluates rules → alert appears live (SSE) → manager acknowledges → outcome audited. Screenshot: TODO (Dashboard, Onboarding, Insights).
**3.2** Job: control cost and uptime across OEMs. Pain relieved: no per-OEM integration. Gain: idling cost in rupees, risk ranking. Differentiation: onboarding without deploys; explainable rules first, ML second.
**3.3 Innovative ideas:** (1) mapping-as-data with preview/activate (evidence: `tests/normalise.test.js` before/after test + demo). (2) Dedup ordering designed around crash semantics (ADR-4). (3) Benchmarked ML vs tuned baseline with honest caveats (`docs/ml/results.md`).

## 4. Feature List
| ID | Feature | Priority | Status | Code path | Video |
|---|---|---|---|---|---|
| F-01 | Multi-OEM normalisation (A-E) via mappings | Must | Done | `backend/src/processor/normalise.js`, `backend/mappings/` | TODO |
| F-02 | Zero-downtime OEM onboarding UI | Must | Done* | `backend/src/api/index.js` (`/admin/oem-mappings`), `frontend/src/pages/Onboard.jsx` | TODO |
| F-03 | Device-authenticated ingest with back-pressure + circuit breaker | Must | Done* | `backend/src/ingest/index.js` | TODO |
| F-04 | Idempotent processing + out-of-order handling | Must | Done* | `backend/src/processor/index.js` | TODO |
| F-05 | Streaming rules (idling, harsh-brake, DTC, overspeed, low fuel) | Must | Done | `backend/src/processor/rules.js` | TODO |
| F-06 | Live dashboard (KPIs, map, SSE alerts) | Must | Done* | `frontend/src/pages/Dashboard.jsx` | TODO |
| F-07 | Idling-cost & utilisation insights | Must | Done* | `/api/insights/*`, `db/clickhouse/01-schema.sql` | TODO |
| F-08 | JWT auth, RBAC, tenant isolation, audit log | Must | Done | `backend/src/api/index.js` | TODO |
| F-09 | Right to erasure, location masking | Should | Done | `api/util.js`, `/admin/drivers/:id/erase` | TODO |
| F-10 | ML risk ranking with fallback | Should | Done* | `ml/`, `/api/insights/risk` | TODO |
| F-11 | Trips, geofencing | Could | Planned | not implemented | - |
\*Done = code written and logic verified in isolation; **full-stack run pending: set to Done only after you run it**.

## 5. Solution Architecture
**5.1** Diagrams in `docs/architecture.md` (C4 L1, L2; data flow). Latency per hop: TODO:MEASURE (Grafana `processor_e2e_latency_seconds`, `ingest_produce_seconds`).
**5.2 Stack**
| Layer | Choice | Why / rejected |
|---|---|---|
| Messaging | Redpanda (Kafka API) | replay + per-VIN ordering; rejected RabbitMQ (ADR-1) |
| Processing | Node consumers, partition-parallel | one language with the API; rejected Flink/Spark (operational weight for rule-level logic) |
| Stores | Postgres 3NF, ClickHouse, MongoDB, Redis | polyglot by access pattern (ADR-3); no vector store (ADR-5) |
| Backend/Frontend | Express; React + Vite | team strength (MERN), fast delivery |
| ML | scikit-learn + FastAPI | small tabular problem; no LLM needed |
| Infra | Docker Compose, Helm (unvalidated), Terraform (unvalidated), GitHub Actions, Prometheus/Grafana | |
**5.3 Data:** ER diagram `docs/erd.md` (3NF; no deliberate denormalisation). CAP map in ADR-3. **Capacity (estimate, label as such):** ~250 B/event JSON × 100K eps ≈ 25 MB/s ≈ 2.2 TB/day raw; ≈ 8.6 B rows/day; ClickHouse compressed size **TODO:MEASURE** (`system.parts`). Partition key: VIN (Kafka), day (ClickHouse). Retention: 365 d TTL implemented; hot/warm/cold in ADR-2.
Query optimisation table: `docs/sql/optimisation.md` ✅ (687.8→0.9 ms; 17.7→0.06 ms; 44.8→0.08 ms).
**5.4 Deployment:** Docker Compose locally; Helm chart with HPAs for stateless services (unvalidated); Terraform EC2 reference (unvalidated, **not applied**). Cloud-agnostic = containers + Helm + env-configured endpoints.

## 6. Low-Level Design
Layered: transport (`index.js`) → pure domain (`normalise`, `rules`, `util`) → shared algorithms → adapters (`db.js`). Domain code has no I/O. Folder structure: README. Principles: SRP (one service per concern), Open/Closed (new OEM = data, not code), fail-fast config. Patterns: Adapter (per-OEM mapping), Strategy (rules), Circuit Breaker (producer, ML), Pub/Sub (mapping reload, alerts), Idempotent Consumer, Repository-lite (SQL in handlers: state honestly). Algorithms: `docs/algorithms.md`.

## 7. NFRs & Benchmarks (fill with YOUR runs)
| NFR | Target | Measured | How |
|---|---|---|---|
| Ingest throughput | 100K events/s | TODO:MEASURE | `make load` |
| p95 ingest latency | < 500 ms | TODO:MEASURE | k6 |
| API p95 | < 200 ms | TODO:MEASURE | `k6 run infra/k6/api.js` |
| Availability under broker loss | no crash, 503/429 + recovery | TODO:MEASURE | `make chaos` |
| Soak | 30 min stable | TODO:MEASURE | `RATE=20 DURATION=30m` |
Bottleneck analysis: TODO (likely Redis ops/event and Docker VM CPU).

## 8. Security & Compliance
STRIDE: `docs/stride.md`. Implemented and verified: JWT + refresh separation, bcrypt, RBAC, tenant isolation, audit log, rate limiting, helmet, location masking, erasure (`docs/compliance.md`). SAST/DAST/Trivy: **TODO: run and paste results** (wired in `.github/workflows/ci.yml`).

## 9. Test Strategy
40 unit tests (`backend/tests`), ✅ 100 % line coverage on pure-logic modules, 80 % gate in CI; state the coverage *scope* honestly (README). Integration: `make e2e`. Load: k6. Chaos: 2 scripts. Result tables: TODO:MEASURE.

## 10. Observability
Prometheus metrics (ingest accepted/throttled/produce latency; processor events, dedup, dead-letter, e2e latency; API latency), Grafana dashboard `infra/grafana/dashboards/fleetnorm.json` (8 panels), structured JSON logs (pino), `/healthz` `/readyz`. Screenshot: TODO.

## 11. AI / ML Component
Gradient-boosting breakdown-risk ranker. ✅ Synthetic-data results vs tuned baseline: F1 0.473 vs 0.441, AUC 0.784 vs 0.737 (`docs/ml/results.md`). **Caveat (state it):** labels come from a hidden synthetic wear model; not evidence of real-world accuracy. Fallback to rules when ML is down (tested). AI tools used to build the project: declared in §16.

## 12. Decisions, Risks, Future
ADR-1..5 in `docs/adr/`. Risks: Redis as a hot-path dependency; alert duplication on crash-replay; single device key; ClickHouse tiering not enabled. Future: per-OEM keys/mTLS, Postgres RLS, trips + geofencing, time-based ML validation on real data.

## 13. Demo video (≤ 5 min): script in README. Timestamps → fill into §4.
## 14. Repository checklist: README checklist; tag `v1.0-submission`.
## 15. Conclusion: TODO (3 sentences; lead with measured results).
## 16. Declarations: AI tools (Claude), open-source list: README "Declarations".
## 17. Appendix: `docs/perf/explain-output.txt`, ADRs, ERD, STRIDE.
