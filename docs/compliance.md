# Security, privacy & compliance notes
- **Synthetic data only.** No real VINs, locations or people. Driver names/licence numbers are generated.
- **Data minimisation & masking:** viewers see coordinates rounded to 3 decimals (~110 m); managers/admins see full precision. Covered by unit test + smoke test.
- **Right to erasure:** `DELETE /api/admin/drivers/:id/erase` nulls name/licence and stamps `erased_at` (audit-logged; idempotent: second call returns 404). Telemetry carries no driver identity by design.
- **Retention:** ClickHouse TTL 365 d; Mongo dead-letter 3 d, raw archive 7 d (TTL indexes).
- **Audit:** every `/api` call is recorded (`audit_log`).
- **Secrets:** none committed; production start-up refuses default secrets.
