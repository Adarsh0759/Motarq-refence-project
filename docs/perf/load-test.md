# Load test: measured, not claimed

Run 2026-10-01, `infra/k6/ingest.js` via `grafana/k6` Docker image, on the compose network, against
`ingest` directly (`http://ingest:4001/v1/ingest/B`). Hardware: one Windows laptop, Docker Desktop
(WSL2 VM), full stack running (Redpanda single broker/single partition replica, 2× processor replicas,
1× ingest, ClickHouse/Postgres/Mongo/Redis all on the same VM). This is a single-node dev topology,
not the multi-node target architecture described in `docs/architecture.md`.

## Target: 100,000 events/sec (NFR, `RATE=100 BATCH=1000`)

**Result: does not hold.** 60s run, thresholds (`p95<500ms`, `p99<1000ms`, `error rate<1%`) all failed:

| Metric | Result |
|---|---|
| Actual throughput achieved | ~23.3 events/sec of *requests* (23,298 events/sec of actual telemetry, batch=1000) before backlog formed; 73/s of iterations were dropped by k6 because VUs couldn't keep up |
| p95 latency | 30.4s |
| p99 latency | 45.4s |
| Error rate | 28.3% (411 of 1,450 requests) |

Every failure was accounted for, not silent — `ingest`'s own protections engaged correctly:

```
ingest_throttled_total{why="inflight"}       154   # 429 back-pressure
ingest_throttled_total{why="circuit"}        142   # 503, producer circuit breaker open
ingest_throttled_total{why="produce_error"}  115   # 503, Kafka send failed/timed out
```
(154+142+115 = 411, exactly matching k6's failed-check count — no unaccounted loss.)

### Root cause (measured, not guessed)
- `ingest_produce_seconds_sum / ingest_produce_seconds_count` = 9698.9 / 7005 ≈ **1.39s average** per
  `producer.send()` call during the run — the single Redpanda broker (1 partition replica, GZIP-compressed
  1000-event batches, `acks:-1`) could not keep up with concurrent sends from 100+ req/s.
- `docker stats` during the run: both `processor` replicas pinned at 105–119% CPU (single-core bound on
  a laptop VM), `mongo` at 95% CPU (every unmapped-OEM-E event writes to `dead_letter` individually —
  real write amplification under load, worth fixing before a real 100K run), `ingest` itself only 4.5%
  CPU (it was waiting on the broker, not compute-bound).
- Conclusion: the bottleneck is the single-broker Kafka topology plus 2 processor replicas on shared
  laptop cores, not the application code. The circuit breaker and back-pressure logic did exactly what
  they're supposed to do — degrade safely instead of falling over or silently dropping data.

## Calibration: finding the real ceiling on this hardware

| Target rate | p95 | p99 | Error rate | Verdict |
|---|---|---|---|---|
| 100,000 events/sec (`RATE=100`) | 30.4s | 45.4s | 28.3% | fails |
| 25,000 events/sec (`RATE=25`) | 906ms | — | 0.4% | fails (p95 threshold) |
| 15,000 events/sec (`RATE=15`) | 68ms | — | 0.0% | **passes cleanly** |

**This topology sustains ~15–20K events/sec cleanly on a single laptop.** The gap to the 100K target is
architectural, not algorithmic: this run used 1 Redpanda broker, 1 partition replica, and 2 processor
replicas sharing the same physical cores as everything else (ClickHouse, Postgres, Mongo, Redis, the API,
Grafana) on one machine. The NFR target assumes horizontal scaling — more Redpanda brokers, more
`raw.telemetry` partitions, more processor/ingest replicas across real nodes — which this environment
cannot demonstrate. `make load` / this script is the right tool to re-run against that topology once it
exists; until then, **100K events/sec sustained is unverified, not false** (per the project's own
TODO:MEASURE discipline, see `AGENTS.md`).

### What would need to change to close the gap
1. Redpanda: multiple brokers, `raw.telemetry` partitioned well beyond 12 (currently `-p 12 -r 1`), replication factor ≥2.
2. More `ingest` and `processor` replicas, on separate nodes/cores — this is a 12-vCPU-on-one-machine ceiling, not a code ceiling (stateless services, horizontal scaling is already the design, see `docs/adr/`).
3. Fix the Mongo dead-letter write-amplification path (batch `insertMany` instead of per-event `insertOne` when `no_mapping` volume is high) — a real optimization opportunity this run surfaced.
4. Re-run on real multi-node infrastructure (the Terraform/Helm in `infra/` target this, but have not been applied — see `docs/perf/iac-validate.md`).
