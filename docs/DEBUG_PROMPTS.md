# Debugging prompts (terse, minimal tokens)

Start: `cd fleetnorm` (AGENTS.md is the project guide).

1. **Bring-up:** `Run "make up", then "make ps". For any unhealthy service read its logs and fix the root cause. Change the smallest thing. Stop when all are healthy.`
2. **Seed + flow:** `Run "make seed" then "make sim" for 60 s. Query ClickHouse: SELECT count() FROM fleetnorm.telemetry. If 0, trace ingest -> kafka -> processor and fix.`
3. **Processor:** `Read docker logs of processor. Explain each error in one line and fix it. Do not refactor.`
4. **ClickHouse insert issues:** `Check backend/src/processor/index.js ch.insert settings against the clickhouse-js docs and the telemetry DDL. Fix any type mismatch.`
5. **UI:** `cd frontend && npm run dev, open each tab with the running stack, list console/network errors, fix.`
6. **Tests:** `Run "make coverage". Keep >= 80%. Do not delete tests to make them pass.`
7. **Load:** `Run "make load" at RATE=20 for 1 min first, then 50, then 100. Report p95, 429 rate, and where the bottleneck is (CPU of ingest, processor lag, Redis, ClickHouse).`
8. **Chaos:** `Run "make chaos" and "make chaos-proc"; paste the RESULT blocks into docs/perf/chaos.md without editing the numbers.`
9. **Measure, don't claim:** `Fill the TODO:MEASURE markers in docs/SOLUTION_DOC_DRAFT.md using real outputs only. If a number is unavailable, leave the marker.`
10. **Final:** `Run lint/tests, git tag v1.0-submission.`

Tips: ask for a plan first on anything > 3 files; say "minimal diff"; paste the exact error, not a description.
