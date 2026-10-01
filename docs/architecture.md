# Architecture

## C4 level 1: context
```mermaid
flowchart LR
  OEM[OEM clouds / vehicle gateways<br/>5 wire formats] -->|HTTPS NDJSON + API key| FN[(FleetNorm)]
  FM[Fleet manager / viewer / admin] -->|HTTPS + JWT| FN
  FN --> PROM[Prometheus + Grafana]
```

## C4 level 2: containers
```mermaid
flowchart LR
  SIM[Simulator<br/>100K vehicles] -->|HTTPS NDJSON| ING[Ingest<br/>Express]
  ING -->|Kafka protocol, key=VIN| RP[(Redpanda<br/>raw.telemetry x12)]
  RP --> PROC[Processor x N<br/>normalise · validate · dedup · rules]
  PROC -->|HTTP JSONEachRow| CH[(ClickHouse<br/>telemetry + hourly MV)]
  PROC -->|RESP| RD[(Redis<br/>latest · dedup · pubsub)]
  PROC -->|SQL| PG[(PostgreSQL 3NF<br/>alerts · users · vehicles)]
  MG[(MongoDB<br/>OEM mappings · DLQ)] -. hot reload via Redis pub/sub .-> PROC
  MG -. hot reload .-> ING
  API[API<br/>Express · JWT · RBAC] --> PG & CH & RD & MG
  API -->|HTTP, circuit breaker| ML[ML service<br/>FastAPI · sklearn]
  UI[React UI<br/>nginx] -->|HTTPS · SSE| API
  PROM[Prometheus] -.scrape.-> ING & PROC & API & RP
```

## Data flow of one event (latency budget, to be measured with Grafana `processor_e2e_latency_seconds`)
vehicle → ingest (parse, auth, produce ack) → Kafka → processor batch (normalise, dedup, ClickHouse flush, Redis, rules) → API read (`/vehicles/live`, SSE).

## Layers inside a service (dependency direction ↓ only)
`index.js` (transport: HTTP/Kafka) → `normalise.js` / `rules.js` / `util.js` (pure domain logic, 100% unit-tested, no I/O) → `shared/*` (algorithms, schema, config) → `db.js` (adapters). Domain logic never imports a database client.
