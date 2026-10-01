# STRIDE threat model

| Threat | Asset / surface | Mitigation in code | Residual risk / next step |
|---|---|---|---|
| **S**poofing | Device ingest endpoint | `x-api-key`, timing-safe compare; 401 otherwise | one shared key: move to per-OEM keys or mTLS |
| **S**poofing | User login | bcrypt, generic error, 10/min/IP limiter (Redis-backed), 15-min JWT + refresh, issuer check, refresh tokens rejected as access tokens | add MFA, refresh-token revocation list |
| **T**ampering | Telemetry payloads | schema validation (zod), VIN check digit, unit/range bounds, per-line dead-lettering | signed payloads from OEMs |
| **T**ampering | OEM mapping config | admin-only, versioned, preview before activate, audit log | two-person approval |
| **R**epudiation | Any data access or change | `audit_log` row for every `/api` request (user, action, resource, status) | ship to immutable store |
| **I**nformation disclosure | Cross-tenant data | every query joins through `fleet.tenant_id`; ClickHouse queries scoped by the tenant's fleet IDs; cross-tenant access returns 404 (verified in smoke test) | add Postgres row-level security as defence in depth |
| **I**nformation disclosure | Driver PII, precise location | viewers get coordinates rounded to 3 dp; erasure endpoint nulls PII; no PII in logs | field-level encryption at rest |
| **D**enial of service | Ingest | body cap 8 MB, line cap 5000, in-flight back-pressure → 429, circuit breaker → 503, Kafka buffering | WAF / per-device rate limits |
| **D**enial of service | API | global 600/min limiter, JSON body cap, keyset pagination, query clamping | per-tenant quotas |
| **E**levation of privilege | Admin routes | RBAC middleware (`admin`/`manager`/`viewer`), role read from signed token | re-check role from DB on sensitive routes |
Supply chain: `npm audit`, Trivy (fs + image), Semgrep in CI; non-root containers; no secrets in the repo (`.env.example` only; the server refuses to start in production with default secrets).
