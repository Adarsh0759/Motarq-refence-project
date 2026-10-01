# ADR-1: Kafka API (Redpanda) over RabbitMQ for ingestion

**Status:** accepted  **Context:** 100K+ vehicles emitting ~1 Hz telemetry (≈100K events/s), 5 OEM formats, need replay after bugs or new mappings, per-vehicle ordering, and horizontal consumer scaling.

**Decision:** Kafka-protocol log, deployed as Redpanda (single binary, no ZooKeeper, runs on a laptop). Topic `raw.telemetry`, 12 partitions, **key = VIN** so all events of one vehicle land on one partition (ordering + sticky consumer state for the rule engine).

**Alternatives rejected**
- *RabbitMQ:* queue semantics delete on ack, so no replay; per-key ordering needs one queue per shard; throughput per queue is single-threaded. Good for task routing, wrong for a replayable event log.
- *Direct HTTP → DB:* no buffer; a ClickHouse or processor outage would back-pressure devices directly.

**Consequences:** at-least-once delivery (see ADR-4); a partition cap of 12 limits consumer parallelism (raise partitions before scaling processors past 12); Redpanda and Kafka share the wire protocol, so moving to managed Kafka/MSK is a config change (`KAFKA_BROKERS`).
