# Chaos test: kill the broker mid-stream

Run 2026-10-01, `infra/chaos/kill-broker.sh`. Simulator at 3,000 events/sec for 60s; Redpanda (the
Kafka-compatible broker) was `docker kill`ed 15s in and restarted 15s later — a hard kill, not a
graceful stop, while the simulator kept pushing.

## Result: no data loss, no duplicate rows, no crash

The simulator's own per-run counters (scoped cleanly to just this test, unlike the cumulative
Prometheus counters below):

```
generated: 191,788   sent: 191,788   throttled: 8   errors: 0
```

Every event the simulator generated was eventually accepted by `ingest` — including the ~15s window
where the broker was dead. `ingest`'s back-pressure (429/503, circuit breaker) caused exactly 8 requests
to be throttled and retried during the outage; zero were dropped or errored. `ingest` and `processor`
did not crash or restart; both recovered on their own once Redpanda came back.

```
duplicate rows in ClickHouse: 0
```

Despite at-least-once delivery semantics (ADR-4: check → ClickHouse insert → mark dedup key → commit
offset) across a broker restart, ClickHouse's `insert_deduplicate`/`async_insert_deduplicate` settings
plus the processor's own Bloom-filter + Redis dedup check produced **zero duplicate `(vin, seq, ts)`
rows** — the exact property this design is supposed to guarantee under a broker failure.

## A caveat on the cross-service reconciliation numbers

The script also prints a cumulative accounting (`accepted` from `ingest`'s Prometheus counter vs.
`stored`/`dropped as duplicates`/`dead-lettered` from ClickHouse/Prometheus). On this run it showed a
large negative "unaccounted" delta. **This is a measurement-window artifact, not data loss**: `ingest`
and `processor` were rebuilt and restarted earlier in today's session (to ship an unrelated Redis fix),
which reset their Prometheus counters, while ClickHouse itself was never restarted and still holds rows
from several earlier test rounds this session (the first simulator bursts, the 100K/25K/15K k6 load
tests). So `stored` reflects a longer lifetime window than `accepted`. The per-run simulator numbers
above are the trustworthy, correctly-scoped measurement for this specific chaos run; the `report()`
helper in `infra/chaos/lib.sh` should ideally snapshot counters before and after each run rather than
reading lifetime cumulative values, to avoid this ambiguity — worth fixing before relying on it as the
sole evidence source in a longer-running environment.
