const e = process.env;
export const cfg = {
  env: e.NODE_ENV || 'development',
  kafkaBrokers: (e.KAFKA_BROKERS || 'localhost:19092').split(','),
  topic: e.KAFKA_TOPIC || 'raw.telemetry',
  pgUrl: e.PG_URL || 'postgres://fleet:fleet@localhost:5432/fleetnorm',
  mongoUrl: e.MONGO_URL || 'mongodb://localhost:27017',
  mongoDb: e.MONGO_DB || 'fleetnorm',
  chUrl: e.CH_URL || 'http://localhost:8123',
  chUser: e.CH_USER || 'default',
  chPass: e.CH_PASS || '',
  chDb: e.CH_DB || 'fleetnorm',
  redisUrl: e.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: e.JWT_SECRET || 'dev-secret-change-me',
  deviceKey: e.DEVICE_API_KEY || 'dev-device-key',
  corsOrigin: e.CORS_ORIGIN || 'http://localhost:8080',
  mlUrl: e.ML_URL || 'http://localhost:8000',
  idleAlertMinutes: Number(e.IDLE_ALERT_MINUTES || 10),
  sampleSeconds: Number(e.SAMPLE_SECONDS || 1),       // seconds represented by one event (1 Hz)
  idleLitresPerHour: Number(e.IDLE_LITRES_PER_HOUR || 0.8),
  fuelInrPerLitre: Number(e.FUEL_INR_PER_LITRE || 95),
  maxInflight: Number(e.MAX_INFLIGHT_MSGS || 200000),
};
if (cfg.env === 'production' && (cfg.jwtSecret === 'dev-secret-change-me' || cfg.deviceKey === 'dev-device-key')) {
  throw new Error('Refusing to start in production with default secrets');
}
