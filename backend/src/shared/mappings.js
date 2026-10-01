// In-memory cache of active OEM mappings; reloads on Redis pub/sub "mapping:updated" (zero-downtime onboarding).
import { logger } from './logger.js';
export const MAPPING_CHANNEL = 'mapping:updated';

export class MappingCache {
  constructor(mongoDb, subscriber) { this.col = mongoDb.collection('oem_mappings'); this.sub = subscriber; this.map = new Map(); }
  async load() {
    const docs = await this.col.find({ active: true }).toArray();
    this.map = new Map(docs.map((d) => [d.oem, d]));
    logger.info({ oems: [...this.map.keys()] }, 'mappings loaded');
  }
  async start() {
    await this.load();
    if (this.sub) {
      await this.sub.subscribe(MAPPING_CHANNEL);
      this.sub.on('message', (ch) => { if (ch === MAPPING_CHANNEL) this.load().catch((e) => logger.error(e)); });
    }
  }
  get(oem) { return this.map.get(oem); }
}
