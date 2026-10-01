# ADR-5: No vector store (and an LLM-free core)

**Decision:** the product deliberately contains no vector database and no LLM in the request path.

**Why:** the problem is structured, high-volume numeric telemetry. Every feature (normalisation, dedup, idling, harsh-braking, DTC repetition, EWMA anomalies, utilisation) is deterministic and explainable, cheap at 100K eps, and testable. A vector index would add cost and an unexplainable component without serving a query this product has.
**Where AI is used:** one small, isolated component: a gradient-boosting breakdown-risk ranker behind a circuit breaker, with a transparent rule-based fallback (`/api/insights/risk` → `source: rules_fallback`). See `docs/ml/results.md` for honest, synthetic-data metrics.
**Revisit when:** free-text inputs appear (technician notes, driver complaints, manuals). Then add semantic search (pgvector is the first step, separate dedicated store only at scale).
