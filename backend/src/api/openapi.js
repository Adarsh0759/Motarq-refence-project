// Hand-maintained OpenAPI 3.0 spec. Kept as a plain object (not swagger-jsdoc annotations) so the
// route handlers below stay terse; this is the single source of truth for documented shapes.
const bearerAuth = { bearerAuth: [] };
const errorSchema = { type: 'object', properties: { error: { type: 'string' }, request_id: { type: 'string' } } };

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'FleetNorm API',
    version: '1.0.0',
    description: 'Multi-OEM fleet telemetry normalisation, alerts, insights and OEM onboarding. JWT bearer auth, RBAC (admin/manager/viewer), tenant-isolated.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: errorSchema,
      LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } } },
      LoginResponse: { type: 'object', properties: { access_token: { type: 'string' }, refresh_token: { type: 'string' }, role: { type: 'string', enum: ['admin', 'manager', 'viewer'] }, tenant_id: { type: 'integer' } } },
      Alert: {
        type: 'object',
        properties: {
          alert_id: { type: 'integer' }, severity: { type: 'string', enum: ['critical', 'warning', 'info'] }, code: { type: 'string' },
          vin: { type: 'string' }, raised_at: { type: 'string', format: 'date-time' }, status: { type: 'string', enum: ['open', 'ack', 'closed'] }, detail: { type: 'object' },
        },
      },
      Summary: { type: 'object', properties: { active_vehicles: { type: 'integer' }, open_alerts: { type: 'integer' }, events_per_sec: { type: 'integer' }, idle_cost_7d_inr: { type: 'number' } } },
    },
  },
  security: [bearerAuth],
  paths: {
    '/healthz': { get: { summary: 'Liveness probe', security: [], responses: { 200: { description: 'ok' } } } },
    '/readyz': { get: { summary: 'Readiness probe (checks Postgres)', security: [], responses: { 200: { description: 'ready' }, 503: { description: 'not ready' } } } },
    '/metrics': { get: { summary: 'Prometheus metrics', security: [], responses: { 200: { description: 'text/plain exposition format' } } } },
    '/auth/login': {
      post: {
        summary: 'Log in', security: [], tags: ['auth'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } }, 401: { description: 'invalid_credentials' }, 429: { description: 'rate_limited (10/min)' } },
      },
    },
    '/auth/refresh': { post: { summary: 'Exchange a refresh token for a new access token', security: [], tags: ['auth'], responses: { 200: { description: 'OK' }, 401: { description: 'invalid_refresh' } } } },
    '/api/fleets': { get: { summary: 'List fleets for the caller\'s tenant', tags: ['fleets'], responses: { 200: { description: 'OK' } } } },
    '/api/vehicles': { get: { summary: 'List vehicles (keyset pagination)', tags: ['vehicles'], parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }, { name: 'cursor', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } } },
    '/api/vehicles/live': { get: { summary: 'Latest known position/state per vehicle (Redis-backed)', tags: ['vehicles'], parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 400 } }], responses: { 200: { description: 'OK' } } } },
    '/api/vehicles/{vin}/latest': { get: { summary: 'Latest telemetry row for one vehicle', tags: ['vehicles'], parameters: [{ name: 'vin', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } } },
    '/api/vehicles/{vin}/history': { get: { summary: 'Historical telemetry for one vehicle', tags: ['vehicles'], parameters: [{ name: 'vin', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } } },
    '/api/alerts': {
      get: {
        summary: 'List alerts (keyset pagination)', tags: ['alerts'],
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'ack', 'closed'] } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }, { name: 'cursor', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Alert' } }, next_cursor: { type: 'string', nullable: true } } } } } } },
      },
    },
    '/api/alerts/{id}/ack': { post: { summary: 'Acknowledge an open alert (admin/manager only)', tags: ['alerts'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, 403: { description: 'forbidden (viewer role)' }, 404: { description: 'not found or not open' } } } },
    '/api/stream/alerts': { get: { summary: 'Live alert stream (SSE), tenant-filtered. Auth via ?token= since EventSource cannot set headers.', tags: ['alerts'], responses: { 200: { description: 'text/event-stream' } } } },
    '/api/insights/summary': { get: { summary: 'Dashboard KPI summary', tags: ['insights'], responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Summary' } } } } } } },
    '/api/insights/idling-cost': { get: { summary: 'Idling cost estimate by vehicle and fleet', tags: ['insights'], parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 7 } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }], responses: { 200: { description: 'OK' } } } },
    '/api/insights/utilisation': { get: { summary: 'Distance/active-time utilisation ranking', tags: ['insights'], parameters: [{ name: 'days', in: 'query', schema: { type: 'integer' } }, { name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
    '/api/insights/risk': { get: { summary: 'Breakdown risk ranking (ML model, rule-based fallback)', tags: ['insights'], parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
    '/api/admin/oem-mappings': { get: { summary: 'List OEM mapping versions (admin only)', tags: ['onboarding'], responses: { 200: { description: 'OK' } } }, post: { summary: 'Save a new (inactive) mapping version (admin only)', tags: ['onboarding'], responses: { 200: { description: 'OK' } } } },
    '/api/admin/oem-mappings/preview': { post: { summary: 'Dry-run normalise a sample payload against a candidate mapping (admin only)', tags: ['onboarding'], responses: { 200: { description: 'OK' } } } },
    '/api/admin/oem-mappings/{oem}/activate/{version}': { post: { summary: 'Activate a mapping version; processors hot-reload via Redis pub/sub, no restart (admin only)', tags: ['onboarding'], parameters: [{ name: 'oem', in: 'path', required: true, schema: { type: 'string' } }, { name: 'version', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
    '/api/admin/dlq': {
      get: { summary: 'Dead-letter counters and recent rejected events (admin only)', tags: ['onboarding'], responses: { 200: { description: 'OK' } } },
      delete: { summary: 'Reset dead-letter counters (admin only)', tags: ['onboarding'], responses: { 200: { description: 'OK' } } },
    },
    '/api/drivers': { get: { summary: 'List drivers (admin/manager only)', tags: ['compliance'], responses: { 200: { description: 'OK' } } } },
    '/api/admin/drivers/{id}/erase': { delete: { summary: 'Right-to-erasure: scrub PII for a driver (admin only)', tags: ['compliance'], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } } },
    '/api/admin/audit': { get: { summary: 'Audit log (admin only)', tags: ['compliance'], responses: { 200: { description: 'OK' } } } },
  },
};
