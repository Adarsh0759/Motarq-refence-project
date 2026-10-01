export type Role = 'admin' | 'manager' | 'viewer';

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  role: Role;
  tenant_id: number;
}

export interface Summary {
  active_vehicles: number;
  open_alerts: number;
  events_per_sec: number;
  idle_cost_7d_inr: number;
}

export interface LiveVehicle {
  vin: string;
  lat: number;
  lon: number;
  speed_kmh: number;
  engine_on: boolean;
}

export type Severity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'open' | 'ack' | 'closed';

export interface Alert {
  alert_id: number;
  severity: Severity;
  code: string;
  vin: string;
  raised_at: string;
  status: AlertStatus;
  detail: Record<string, unknown>;
}

export interface AlertsPage {
  data: Alert[];
  next_cursor: string | null;
}

export interface LiveAlertEvent {
  alert_id: number;
  tenant_id: number;
  vin: string;
  code: string;
  severity: Severity;
  ts: string;
  detail: Record<string, unknown>;
}

export interface IdlingCost {
  total: { cost_inr: number; idle_hours: number; idle_ratio: number };
  top_vehicles: { vin: string; cost_inr: number }[];
  by_fleet: { fleet_id: number; idle_hours: number; cost_inr: number }[];
  assumptions: { litres_per_idle_hour: number; inr_per_litre: number };
}

export interface Utilisation {
  vehicles: { vin: string; distance_km: number; active_hours: number; max_speed_kmh: number }[];
}

export interface RiskRanking {
  source: 'ml' | 'rules_fallback';
  vehicles: { vin: string; risk: number }[];
}

export interface OemMapping {
  oem: string;
  version: number;
  active: boolean;
}

export interface MappingPreview {
  ok: boolean;
  event?: Record<string, unknown>;
  reason?: string;
}

export interface DlqSummary {
  counts: Record<string, number>;
  recent: Record<string, unknown>[];
}
