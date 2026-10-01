import { z } from 'zod';
import { isValidVin } from './vin.js';

export const DTC_RE = /^[PBCU][0-3][0-9A-F]{3}$/; // OBD-II trouble code, e.g. P0301

export const CanonicalEvent = z.object({
  vin: z.string().refine(isValidVin, 'invalid_vin'),
  oem: z.string().min(1).max(20),
  ts: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid_ts'),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  speed_kmh: z.number().min(0).max(400),
  odo_km: z.number().min(0),
  fuel_pct: z.number().min(0).max(100).nullable().optional(),
  engine_on: z.boolean(),
  rpm: z.number().min(0).max(12000).nullable().optional(),
  dtc: z.array(z.string().regex(DTC_RE, 'invalid_dtc')),
  evt: z.string().max(32).nullable().optional(),
  seq: z.number().int().min(0),
  schema_ver: z.number().int().min(1),
});

const FieldSpec = z.object({
  path: z.string().min(1).max(100),
  unit: z.enum(['kmh', 'kph', 'mph', 'ms', 'km', 'mi']).optional(),
  scale: z.number().positive().optional(),
  format: z.enum(['epoch_ms', 'epoch_s', 'iso', 'ddmmyyyy_hms']).optional(),
  truthy: z.array(z.union([z.string(), z.number(), z.boolean()])).optional(),
  split: z.string().max(3).optional(),
});

// Versioned per-OEM mapping stored in MongoDB; hot-reloaded without restart.
export const MappingInput = z.object({
  oem: z.string().regex(/^[A-Z0-9_-]{1,20}$/),
  fields: z.object({
    vin: FieldSpec, ts: FieldSpec, lat: FieldSpec, lon: FieldSpec,
    speed_kmh: FieldSpec, odo_km: FieldSpec, seq: FieldSpec,
    fuel_pct: FieldSpec.optional(), engine_on: FieldSpec.optional(),
    rpm: FieldSpec.optional(), dtc: FieldSpec.optional(), evt: FieldSpec.optional(),
  }),
});
