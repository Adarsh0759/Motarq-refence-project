# ADR-2: ClickHouse for telemetry and rollups

**Status:** accepted  **Context:** ~8.6 B rows/day at 100K eps; queries are per-vehicle time ranges and fleet-level aggregates (idling cost, utilisation, risk features).

**Decision:** ClickHouse `MergeTree`, `PARTITION BY toYYYYMMDD(ts)`, `ORDER BY (fleet_id, vin, ts)`; server-side `async_insert` batching (ack after flush); an `AggregatingMergeTree` materialised view (`hourly_vehicle_stats`) so dashboards never scan raw rows.

**Why not:** PostgreSQL/Timescale (row store, write amplification and index bloat at this rate); MongoDB time-series (weaker analytical aggregation); Cassandra (no cheap ad-hoc aggregates).

**Retention (hot / warm / cold).** Implemented in the repo: 365-day TTL delete. Production tiering (not enabled in the compose file because it needs a storage policy):
```sql
-- with a storage policy 'tiered' = [nvme (hot), hdd (warm), s3 (cold)]
TTL toDateTime(ts) + INTERVAL 7 DAY  TO VOLUME 'hdd',
    toDateTime(ts) + INTERVAL 90 DAY TO VOLUME 's3',
    toDateTime(ts) + INTERVAL 365 DAY DELETE
```
**Write hot-spot avoidance:** the sort key leads with `fleet_id, vin` (high cardinality), inserts are spread across parts by the server's async buffer rather than one partition key per second.
**Consequences:** eventual consistency for merges; `UPDATE/DELETE` are heavy mutations, so right-to-erasure applies to PII held in Postgres, not to telemetry (which has no driver identity).
