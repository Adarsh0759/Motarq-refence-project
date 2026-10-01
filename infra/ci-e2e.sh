#!/usr/bin/env bash
# End-to-end smoke for CI: bring the stack up, seed, run the simulator briefly, assert data flows through every layer.
set -euo pipefail; cd "$(dirname "$0")/.."
DC="docker compose -f infra/docker-compose.yml"
$DC up -d --build --wait --wait-timeout 300
$DC run --rm api node scripts/seed.js 20000
$DC restart processor && sleep 10          # reload vehicle reference data
DURATION=40 RATE=1000 VEHICLES=20000 $DC --profile sim run --rm simulator
sleep 10
N=$($DC exec -T clickhouse clickhouse-client --user fleet --password fleet -q "SELECT count() FROM fleetnorm.telemetry")
echo "telemetry rows: $N"; [ "$N" -gt 10000 ] || { echo "FAIL: too few rows"; exit 1; }
TOK=$(curl -sf -XPOST localhost:4000/auth/login -H 'content-type: application/json' -d '{"email":"admin@fleetnorm.dev","password":"Admin@123"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -sf localhost:4000/api/insights/summary -H "authorization: Bearer $TOK"; echo
curl -sf "localhost:4000/api/insights/risk?limit=3" -H "authorization: Bearer $TOK" | head -c 300; echo
echo "E2E OK"
