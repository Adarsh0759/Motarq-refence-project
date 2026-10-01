#!/usr/bin/env bash
# Before/after EXPLAIN ANALYZE for the "open alerts" dashboard query. Loads 500K synthetic alerts, then compares plans with and without the index.
set -euo pipefail; cd "$(dirname "$0")/.."
PSQL="docker compose -f infra/docker-compose.yml exec -T postgres psql -U fleet -d fleetnorm -v ON_ERROR_STOP=1"
OUT=docs/perf/explain-output.txt
$PSQL -q <<'SQL' | tee /dev/null
INSERT INTO alert(vehicle_id, alert_type_id, severity, raised_at, detail)
SELECT 1 + (random()*99999)::int, 1 + (random()*4)::int, 'warning', now() - (random()*86400*30) * interval '1 second', '{}'
FROM generate_series(1, 500000)
WHERE (SELECT count(*) FROM alert) < 400000;
UPDATE alert SET status = 'ack' WHERE random() < 0.95 AND status = 'open';   -- realistic: most alerts are acknowledged
ANALYZE alert;
SQL
Q="SELECT a.alert_id, v.vin, t.code, a.severity, a.raised_at FROM alert a JOIN vehicle v ON v.vehicle_id=a.vehicle_id JOIN fleet f ON f.fleet_id=v.fleet_id JOIN alert_type t ON t.alert_type_id=a.alert_type_id WHERE f.tenant_id=1 AND a.status='open' ORDER BY a.alert_id DESC LIMIT 50"
{
  echo "===== BEFORE: partial index dropped ====="; $PSQL -q -c "DROP INDEX IF EXISTS alert_open_idx; ANALYZE alert;"; $PSQL -c "EXPLAIN (ANALYZE, BUFFERS) $Q"
  echo; echo "===== AFTER: partial index alert_open_idx recreated ====="; $PSQL -q -c "CREATE INDEX alert_open_idx ON alert (alert_id DESC) WHERE status = 'open'; ANALYZE alert;"; $PSQL -c "EXPLAIN (ANALYZE, BUFFERS) $Q"
} | tee "$OUT"
echo "saved to $OUT"
