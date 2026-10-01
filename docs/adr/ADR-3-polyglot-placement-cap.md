# ADR-3: Polyglot persistence and CAP/PACELC placement

| Data | Store | Why | CAP / PACELC choice |
|---|---|---|---|
| Tenants, users, fleets, vehicles, drivers, alerts, audit | PostgreSQL 16 (3NF) | transactions, FKs, RBAC joins, keyset pagination | **CP**; PC/EC (single primary, strong reads) |
| Raw telemetry + hourly rollups | ClickHouse | columnar scans/aggregates at 100K eps | **AP**-leaning; PA/EL (eventual merges; dashboards tolerate seconds of lag) |
| OEM mappings (versioned), dead letters, raw archive | MongoDB | schemaless, evolving per-OEM documents, TTL indexes | **CP** with majority writes in production; PC/EC |
| Latest vehicle state, dedup keys, rate limits, pub/sub | Redis | sub-ms reads, TTLs, atomic Lua | **AP**, loss-tolerant: everything in it is reconstructible from Kafka/ClickHouse |
| Event log | Redpanda (Kafka API) | replay, partitioned ordering | **CP** for acked writes (`acks=-1`) |

Rule of thumb used: **money/identity/compliance data is CP; derived/volatile data is AP.** Cross-store consistency is achieved by idempotent processing, not distributed transactions (ADR-4).
