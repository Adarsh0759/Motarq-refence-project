# ADR-4: At-least-once delivery + idempotent processing

**Decision:** producers retry; Kafka offsets are committed **only after** the ClickHouse flush; duplicates are removed by a key `vin:seq:ts` checked in Redis (TTL 1 h).

**Order of operations (deliberate):** check key → insert into ClickHouse → mark key → update latest state → evaluate rules → commit offset.
- Crash **before** the insert → message replays → processed normally. **No loss.**
- Crash **between insert and mark** → the batch replays; ClickHouse block-level insert deduplication (`non_replicated_deduplication_window`) absorbs an identical replay. If the replayed batch differs, a few duplicate rows can remain. The chaos scripts **measure and print** residual duplicates instead of claiming zero.
- Setting the key *before* the insert was rejected: a crash in between would mark events as seen without storing them, which is silent data loss.

**Out-of-order events:** latest-state updates use an atomic Lua "set if newer" script and `ZADD ... GT`; historical inserts are order-independent.
**Bloom filter:** implemented and tested in `shared/bloom.js`, but intentionally **not** on the hot path: a cold filter after a rebalance would wrongly say "new", and a false positive would silently drop a real event. Redis `MGET` is authoritative.
**Known gap:** alerts are not deduplicated across a crash-replay (a replayed batch can raise one alert twice; per-vehicle 15-minute cooldown limits the blast radius).
