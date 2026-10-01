#!/usr/bin/env bash
# Chaos test 2: hard-kill one processor replica mid-stream (SIGKILL). Kafka rebalances its partitions to the survivor;
# offsets are committed only after the ClickHouse flush, so nothing is lost; dedup keys stop most replays becoming duplicates.
set -euo pipefail; cd "$(dirname "$0")/../.."; source infra/chaos/lib.sh
echo "[chaos] starting simulator (3000 eps, 60s)"; DURATION=60 RATE=3000 $DC --profile sim up -d simulator
sleep 15; VICTIM=$($DC ps -q processor | head -1); echo "[chaos] >>> SIGKILL processor $VICTIM"; docker kill -s KILL "$VICTIM"
sleep 20; echo "[chaos] >>> restarting processors"; $DC up -d processor
echo "[chaos] waiting for drain (90s)"; sleep 90
report
