CREATE DATABASE IF NOT EXISTS fleetnorm;

-- Raw normalised telemetry. AP/eventually-consistent store, append-only.
-- Partition by day (cheap TTL/drops); order by (fleet, vin, ts) => per-vehicle range scans, and no write hot-spot
-- because inserts are spread across many vins and batched by the server (async_insert).
CREATE TABLE IF NOT EXISTS fleetnorm.telemetry (
  fleet_id  UInt32,
  vin       FixedString(17),
  ts        DateTime64(3, 'UTC'),
  lat       Float32,
  lon       Float32,
  speed_kmh Float32,
  odo_km    Float64,
  fuel_pct  Float32,
  engine_on UInt8,
  rpm       UInt16,
  dtc       Array(String),
  evt       LowCardinality(String),
  seq       UInt64,
  oem       LowCardinality(String)
) ENGINE = MergeTree
PARTITION BY toYYYYMMDD(ts)
ORDER BY (fleet_id, vin, ts)
TTL toDateTime(ts) + INTERVAL 365 DAY DELETE
SETTINGS non_replicated_deduplication_window = 1000;
-- Hot/warm/cold tiering (NVMe -> HDD -> S3) needs a storage policy: see docs/adr/ADR-2 for the TTL ... TO VOLUME clauses used in production.

-- Hourly rollup: powers idling-cost, utilisation and risk features without scanning raw rows.
CREATE TABLE IF NOT EXISTS fleetnorm.hourly_vehicle_stats (
  fleet_id        UInt32,
  vin             FixedString(17),
  hour            DateTime,
  event_count     SimpleAggregateFunction(sum, UInt64),
  idle_events     SimpleAggregateFunction(sum, UInt64),
  harsh_events    SimpleAggregateFunction(sum, UInt64),
  dtc_events      SimpleAggregateFunction(sum, UInt64),
  overspeed_events SimpleAggregateFunction(sum, UInt64),
  lowfuel_events  SimpleAggregateFunction(sum, UInt64),
  odo_min         SimpleAggregateFunction(min, Float64),
  odo_max         SimpleAggregateFunction(max, Float64),
  max_speed       SimpleAggregateFunction(max, Float32)
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(hour)
ORDER BY (fleet_id, vin, hour);

CREATE MATERIALIZED VIEW IF NOT EXISTS fleetnorm.hourly_vehicle_stats_mv TO fleetnorm.hourly_vehicle_stats AS
SELECT fleet_id, vin, toStartOfHour(ts) AS hour,
  count() AS event_count,
  countIf(engine_on = 1 AND speed_kmh < 1) AS idle_events,
  countIf(evt = 'HARSH_BRAKE') AS harsh_events,
  countIf(length(dtc) > 0) AS dtc_events,
  countIf(speed_kmh > 110) AS overspeed_events,
  countIf(fuel_pct < 10) AS lowfuel_events,
  min(odo_km) AS odo_min, max(odo_km) AS odo_max, max(speed_kmh) AS max_speed
FROM fleetnorm.telemetry
GROUP BY fleet_id, vin, hour;
