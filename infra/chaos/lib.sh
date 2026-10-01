# shared helpers for chaos scripts. Run from repo root.
DC="docker compose -f infra/docker-compose.yml"
prom() { curl -s "http://localhost:9090/api/v1/query" --data-urlencode "query=$1" | python3 -c "import sys,json; r=json.load(sys.stdin)['data']['result']; print(int(float(r[0]['value'][1])) if r else 0)"; }
ch()   { $DC exec -T clickhouse clickhouse-client --user fleet --password fleet -q "$1"; }
report() {
  ACC=$(prom 'sum(ingest_events_accepted_total)'); DUP=$(prom 'sum(processor_dedup_hits_total)'); DEAD=$(prom 'sum(processor_dead_letter_total)')
  STORED=$(ch "SELECT count() FROM fleetnorm.telemetry"); UNIQ=$(ch "SELECT uniqExact(vin, seq, ts) FROM fleetnorm.telemetry")
  echo "---------------- RESULT (measured) ----------------"
  echo "accepted by ingest (acked by broker) : $ACC"
  echo "stored in ClickHouse                 : $STORED"
  echo "dropped as duplicates                : $DUP"
  echo "dead-lettered                        : $DEAD"
  echo "accepted - (stored + dup + dead)     : $((ACC - STORED - DUP - DEAD))   (0 = every accepted event accounted for; >0 = possible loss or in-flight backlog; <0 = duplicate rows)"
  echo "duplicate rows in ClickHouse         : $((STORED - UNIQ))   (residual at-least-once duplicates; 0 is ideal)"
  echo "---------------------------------------------------"
  echo "Note: Prometheus counters reset when a container restarts; if the processor was restarted use the ClickHouse figures as the source of truth."
}
