# FleetNorm: project rules
Role: senior engineer. Be terse. No explanations, no recaps. After each task print max 5 lines: what changed + how to run/test.
Never re-read files you just wrote. Never add features not in the task. Prefer small files (<200 lines).

## Product
Multi-OEM telemetry normalisation + fleet idling/utilisation cost insights. Simulated 100K+ vehicles. Synthetic data only.

## Stack (fixed, do not substitute)
Node 20, JavaScript ES modules, Express, Zod, Jest + supertest, kafkajs, ioredis, pg, mongodb driver, @clickhouse/client,
pino logger, prom-client, opossum (circuit breaker), jsonwebtoken, argon2, helmet, express-rate-limit (Redis store).
Web: React + Vite + Recharts + Leaflet. Infra: Docker Compose, Redpanda, Postgres 16, Mongo 7, ClickHouse, Redis 7,
Prometheus + Grafana. CI: GitHub Actions. IaC: Terraform (AWS). Helm chart minimal.

## Monorepo layout
services/simulator, services/ingest, services/processor, services/api, web, shared (canonical schema, vin.js, geohash.js, bloom.js, ewma.js),
infra/{compose,helm,terraform,k6,chaos}, docs/{adr,erd,arch,stride,sql,algorithms}, tests/

## Canonical event
{ vin, oem, ts(ISO UTC), lat, lon, speed_kmh, odo_km, fuel_pct|soc_pct, engine_on(bool), rpm, dtc:[P0301], evt, seq, schema_ver }

## Data placement (justify in ADRs)
Postgres: tenants, users, roles, fleets, vehicles, drivers, trips, alerts, subscriptions, audit_log (3NF, ACID, CP).
MongoDB: versioned OEM mapping configs, raw payload archive, dead-letter queue (flexible schema).
ClickHouse: telemetry (partition by day, order by fleet_id,vin,ts), hourly rollup materialised view, TTL hot/warm/cold (AP).
Redis: latest vehicle state, dedup keys (vin:seq TTL), rate limits, mapping hot-reload pub/sub.

## Non-negotiables
- Idempotent ingest (vin+seq), schema validation, dead-letter for invalid, back-pressure (429 + Retry-After), circuit breaker on Kafka producer.
- Every query scoped by tenant_id from JWT. RBAC roles: admin, manager, viewer (viewer gets location masked to 3 dp).
- Audit log for every data access and admin action.
- Keyset pagination only. No N+1. Composite + partial indexes documented with EXPLAIN ANALYZE before/after.
- Env via .env, no secrets in git. Health endpoints /healthz /readyz and /metrics on every service.
- Unit tests on shared/ algorithms and normaliser. Target 80% coverage.
- Never invent metrics. Only report numbers actually measured by scripts in this repo.

## Git
Sole author/owner: Adarsh Anand (adarshchotu09@gmail.com). Never mention Claude, Anthropic, or AI tooling in commit messages.
Commit after every phase: `git add -A && git commit -m "phase N: <what>"`.
