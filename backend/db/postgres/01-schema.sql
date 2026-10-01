-- FleetNorm relational core (3NF). Loaded automatically on first postgres start.
CREATE TABLE tenant (
  tenant_id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE role (
  role_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code    text NOT NULL UNIQUE CHECK (code IN ('admin','manager','viewer'))
);
CREATE TABLE app_user (
  user_id       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     integer NOT NULL REFERENCES tenant,
  role_id       integer NOT NULL REFERENCES role,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE fleet (
  fleet_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenant,
  name      text NOT NULL,
  UNIQUE (tenant_id, name)
);
CREATE TABLE oem (
  oem_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code   text NOT NULL UNIQUE,
  name   text NOT NULL
);
CREATE TABLE vehicle (
  vehicle_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vin        char(17) NOT NULL UNIQUE,
  fleet_id   integer NOT NULL REFERENCES fleet,
  oem_id     integer NOT NULL REFERENCES oem,
  model      text NOT NULL,
  fuel_type  text NOT NULL CHECK (fuel_type IN ('petrol','diesel','hybrid','electric')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_fleet_idx ON vehicle (fleet_id, vehicle_id);

-- driver holds (synthetic) PII -> supports right-to-erasure
CREATE TABLE driver (
  driver_id  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id  integer NOT NULL REFERENCES tenant,
  full_name  text NOT NULL,
  licence_no text,
  erased_at  timestamptz
);
CREATE TABLE vehicle_driver_assignment (
  vehicle_id    integer NOT NULL REFERENCES vehicle,
  driver_id     integer NOT NULL REFERENCES driver,
  assigned_from timestamptz NOT NULL DEFAULT now(),
  assigned_to   timestamptz,
  PRIMARY KEY (vehicle_id, assigned_from)
);

CREATE TABLE alert_type (
  alert_type_id    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             text NOT NULL UNIQUE,
  default_severity text NOT NULL CHECK (default_severity IN ('info','warning','critical')),
  description      text NOT NULL
);
CREATE TABLE alert (
  alert_id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  vehicle_id    integer NOT NULL REFERENCES vehicle,
  alert_type_id integer NOT NULL REFERENCES alert_type,
  severity      text NOT NULL CHECK (severity IN ('info','warning','critical')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','closed')),
  raised_at     timestamptz NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}',
  acked_by      integer REFERENCES app_user,
  acked_at      timestamptz
);
-- Query-driven indexes (see docs/sql/optimisation.md for EXPLAIN ANALYZE before/after)
CREATE INDEX alert_open_idx   ON alert (alert_id DESC) WHERE status = 'open';   -- partial: dashboard "open alerts" keyset scan
CREATE INDEX alert_vehicle_idx ON alert (vehicle_id, raised_at DESC);           -- composite: per-vehicle history

CREATE TABLE subscription (
  subscription_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id       integer NOT NULL REFERENCES tenant,
  plan            text NOT NULL,
  status          text NOT NULL CHECK (status IN ('active','past_due','cancelled')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  ends_at         timestamptz
);
CREATE TABLE audit_log (
  audit_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id integer,
  user_id   integer,
  action    text NOT NULL,
  resource  text,
  status    integer,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant_at_idx ON audit_log (tenant_id, at DESC);
