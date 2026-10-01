# Query optimisation: before / after (measured, `EXPLAIN (ANALYZE)`)

**Setup:** PostgreSQL 16, 100,000 vehicles, 500,000 alerts (95 % acknowledged, about 25K open), warm cache, sandbox machine, two runs each (first discarded). Reproduce with `make explain` (raw plans in `docs/perf/explain-output.txt`). Timings are for *relative* comparison; your hardware will differ.

| # | Query | Before (ms) | After (ms) | Change made |
|---|---|---|---|---|
| 1 | Open alerts for a tenant, newest first, `LIMIT 50` | **687.8** | **0.9** | Rewrote the query to resolve the tenant's fleet IDs first (`v.fleet_id = ANY($1)`, cached server-side) instead of joining `vehicle → fleet`; planner then walks the **partial index** `alert_open_idx (alert_id DESC) WHERE status='open'` and does 50 PK lookups. |
| 2 | Vehicle list, page at row 90,000 | **17.7** (`OFFSET 90000`) | **0.06** | Keyset pagination (`vehicle_id > :cursor ORDER BY vehicle_id LIMIT n`) on the PK. |
| 3 | Alert history for one vehicle, `ORDER BY raised_at DESC LIMIT 20` | **44.8** | **0.08** | Composite index `alert_vehicle_idx (vehicle_id, raised_at DESC)`. |

### An honest finding (kept on purpose)
For query 1 the partial index **alone did not help**: with the original join shape it measured 688 ms before and 769 ms after, because the planner started from a sequential scan of `vehicle` (it cannot know that all 3 fleets belong to the tenant). The 680×+ win came from the **query shape**. Once rewritten, the index took it from 1.6 ms to 0.9 ms; its benefit grows as the open-alert fraction shrinks (here 5 % of rows are open; at 0.5 % a plain PK scan would have to skip far more rows). Lesson recorded: *verify the plan uses the index; adding an index is not an optimisation until EXPLAIN says so.*

ClickHouse side: dashboards read `hourly_vehicle_stats` (AggregatingMergeTree materialised view), not raw `telemetry`. **Not yet measured** at scale (needs the full stack); capture `EXPLAIN`/`system.query_log` read_rows for raw vs rollup after `make sim` and paste here.
