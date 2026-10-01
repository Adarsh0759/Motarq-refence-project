# Relational core (3NF)

```mermaid
erDiagram
  TENANT ||--o{ APP_USER : has
  ROLE ||--o{ APP_USER : grants
  TENANT ||--o{ FLEET : owns
  TENANT ||--o{ DRIVER : employs
  TENANT ||--o{ SUBSCRIPTION : has
  FLEET ||--o{ VEHICLE : contains
  OEM ||--o{ VEHICLE : builds
  VEHICLE ||--o{ VEHICLE_DRIVER_ASSIGNMENT : "assigned via"
  DRIVER ||--o{ VEHICLE_DRIVER_ASSIGNMENT : "drives via"
  VEHICLE ||--o{ ALERT : raises
  ALERT_TYPE ||--o{ ALERT : classifies
  APP_USER ||--o{ ALERT : acknowledges
  TENANT { int tenant_id PK  text name UK }
  APP_USER { int user_id PK  int tenant_id FK  int role_id FK  text email UK  text password_hash }
  FLEET { int fleet_id PK  int tenant_id FK  text name }
  VEHICLE { int vehicle_id PK  char17 vin UK  int fleet_id FK  int oem_id FK  text model  text fuel_type }
  DRIVER { int driver_id PK  int tenant_id FK  text full_name  text licence_no  timestamptz erased_at }
  ALERT { bigint alert_id PK  int vehicle_id FK  int alert_type_id FK  text severity  text status  timestamptz raised_at  jsonb detail }
```
**3NF notes.** Every non-key attribute depends on the key only: OEM and role are lookup tables (no repeated strings), a vehicle↔driver many-to-many is resolved by `vehicle_driver_assignment` with history. **Deliberate denormalisation: none in PostgreSQL.** `alert.severity` is an instance attribute (a rule may escalate), not a copy of `alert_type.default_severity`. Tenant scoping is derived through `vehicle → fleet → tenant`, never duplicated on `alert`.
**Audit trail:** `audit_log(tenant, user, action, resource, status, at)` records every `/api` call.
