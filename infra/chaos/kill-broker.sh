#!/usr/bin/env bash
# Chaos test 1: kill the Kafka-compatible broker mid-stream, restart it, and account for every event.
# Expect: ingest answers 503/429 while the broker is down (simulator backs off + retries), no crash, backlog drains after restart.
set -euo pipefail; cd "$(dirname "$0")/../.."; source infra/chaos/lib.sh
echo "[chaos] starting simulator (3000 eps, 60s)"; DURATION=60 RATE=3000 $DC --profile sim up -d simulator
sleep 15;  echo "[chaos] >>> KILLING broker";    $DC kill redpanda
sleep 15;  echo "[chaos] >>> RESTARTING broker"; $DC start redpanda
echo "[chaos] waiting for simulator to finish and backlog to drain (90s)"; sleep 90
$DC logs simulator --tail 3 || true
report
