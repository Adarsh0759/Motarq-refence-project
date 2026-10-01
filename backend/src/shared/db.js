import pg from 'pg';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { createClient } from '@clickhouse/client';
import { cfg } from './config.js';

export const pgPool = (max = 10) => new pg.Pool({ connectionString: cfg.pgUrl, max });
export const mongo = async () => { const c = new MongoClient(cfg.mongoUrl); await c.connect(); return c; };
export const redis = (opts = {}) => new Redis(cfg.redisUrl, { maxRetriesPerRequest: null, ...opts });
export const clickhouse = () => createClient({
  url: cfg.chUrl, username: cfg.chUser, password: cfg.chPass, database: cfg.chDb,
  clickhouse_settings: {
    date_time_input_format: 'best_effort',
    async_insert: 1, wait_for_async_insert: 1,          // server-side batching, ack after flush
    output_format_json_quote_64bit_integers: 0,
  },
});
