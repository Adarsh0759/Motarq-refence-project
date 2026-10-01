// Idempotent seed: tenants, users, fleets, OEMs, alert types, 100K vehicles, drivers, mappings A-D. Synthetic data only.
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { pgPool, mongo } from '../src/shared/db.js';
import { cfg } from '../src/shared/config.js';
import { OEMS, oemForIndex, vinForIndex } from '../src/shared/fleetgen.js';

const N = Number(process.env.VEHICLES || process.argv[2] || 100000);
const pool = pgPool(2);
const q = (t, p) => pool.query(t, p);
const log = (...a) => console.log('[seed]', ...a);

const PASS = { admin: 'Admin@123', manager: 'Manager@123', viewer: 'Viewer@123' };

async function main() {
  await q("INSERT INTO role(code) VALUES ('admin'),('manager'),('viewer') ON CONFLICT DO NOTHING");
  await q("INSERT INTO tenant(name) VALUES ('Demo Logistics'),('Other Co') ON CONFLICT DO NOTHING");
  const tenants = Object.fromEntries((await q('SELECT tenant_id,name FROM tenant')).rows.map((r) => [r.name, r.tenant_id]));
  const roles = Object.fromEntries((await q('SELECT role_id,code FROM role')).rows.map((r) => [r.code, r.role_id]));
  const T = tenants['Demo Logistics'], T2 = tenants['Other Co'];

  for (const [role, pw] of Object.entries(PASS)) {
    await q('INSERT INTO app_user(tenant_id,role_id,email,password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING',
      [T, roles[role], `${role}@fleetnorm.dev`, bcrypt.hashSync(pw, 10)]);
  }
  // second tenant admin, used to prove tenant isolation
  await q('INSERT INTO app_user(tenant_id,role_id,email,password_hash) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING',
    [T2, roles.admin, 'admin@otherco.dev', bcrypt.hashSync('Other@123', 10)]);

  for (const f of ['Chennai Depot', 'Bengaluru Hub', 'Mumbai Yard']) await q('INSERT INTO fleet(tenant_id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING', [T, f]);
  await q("INSERT INTO fleet(tenant_id,name) VALUES ($1,'Other Fleet') ON CONFLICT DO NOTHING", [T2]);
  for (const o of OEMS) await q('INSERT INTO oem(code,name) VALUES ($1,$2) ON CONFLICT DO NOTHING', [o, `OEM ${o}`]);
  const types = [
    ['IDLING_EXCESSIVE', 'warning', 'Engine on and stationary beyond threshold'],
    ['HARSH_BRAKE_BURST', 'warning', 'Three or more harsh-brake events in 10 minutes'],
    ['DTC_REPEAT', 'critical', 'Same diagnostic trouble code repeated 3+ times in 1 hour'],
    ['OVERSPEED_ANOMALY', 'warning', 'Speed spike far above the vehicle baseline (EWMA z-score)'],
    ['LOW_FUEL', 'info', 'Fuel below 10 percent'],
  ];
  for (const t of types) await q('INSERT INTO alert_type(code,default_severity,description) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', t);
  await q("INSERT INTO subscription(tenant_id,plan,status) SELECT $1,'enterprise','active' WHERE NOT EXISTS (SELECT 1 FROM subscription WHERE tenant_id=$1)", [T]);

  const fleets = (await q('SELECT fleet_id FROM fleet WHERE tenant_id=$1 ORDER BY fleet_id', [T])).rows.map((r) => r.fleet_id);
  const oemIds = Object.fromEntries((await q('SELECT oem_id,code FROM oem')).rows.map((r) => [r.code, r.oem_id]));
  const models = ['Truck 3500', 'Van T6', 'Sedan X', 'SUV R', 'EV Cargo'], fuels = ['diesel', 'diesel', 'petrol', 'hybrid', 'electric'];

  const existing = Number((await q('SELECT count(*) c FROM vehicle')).rows[0].c);
  if (existing < N) {
    log(`inserting vehicles (have ${existing}, want ${N})`);
    const B = 5000;
    for (let s = 0; s < N; s += B) {
      const vin = [], fl = [], oe = [], mo = [], fu = [];
      for (let i = s; i < Math.min(N, s + B); i++) {
        vin.push(vinForIndex(i)); fl.push(fleets[i % fleets.length]); oe.push(oemIds[oemForIndex(i)]); mo.push(models[i % 5]); fu.push(fuels[i % 5]);
      }
      await q('INSERT INTO vehicle(vin,fleet_id,oem_id,model,fuel_type) SELECT * FROM unnest($1::char(17)[],$2::int[],$3::int[],$4::text[],$5::text[]) ON CONFLICT (vin) DO NOTHING', [vin, fl, oe, mo, fu]);
      if ((s / B) % 4 === 0) log(`  ${Math.min(N, s + B)} / ${N}`);
    }
  }
  const dcount = Number((await q('SELECT count(*) c FROM driver')).rows[0].c);
  if (dcount === 0) {
    const first = ['Asha', 'Ravi', 'Meera', 'Karthik', 'Divya', 'Imran', 'Priya', 'Arjun'], last = ['Nair', 'Kumar', 'Iyer', 'Singh', 'Reddy', 'Khan', 'Das', 'Menon'];
    const names = [], lic = [];
    for (let i = 0; i < 2000; i++) { names.push(`${first[i % 8]} ${last[(i >> 3) % 8]} ${i}`); lic.push(`TN${String(i).padStart(8, '0')}`); }
    await q('INSERT INTO driver(tenant_id,full_name,licence_no) SELECT $1,n,l FROM unnest($2::text[],$3::text[]) AS t(n,l)', [T, names, lic]);
    await q(`INSERT INTO vehicle_driver_assignment(vehicle_id,driver_id)
             SELECT v.vehicle_id, d.driver_id FROM (SELECT vehicle_id, row_number() OVER (ORDER BY vehicle_id) rn FROM vehicle LIMIT 2000) v
             JOIN (SELECT driver_id, row_number() OVER (ORDER BY driver_id) rn FROM driver) d USING (rn)`);
  }

  // Mongo: mappings (A-D active; E is onboarded live in the demo) + indexes
  if (process.env.SKIP_MONGO) { log('SKIP_MONGO set: skipping Mongo seed'); await pool.end(); return; }
  const m = await mongo(); const db = m.db(cfg.mongoDb);
  await db.collection('oem_mappings').createIndex({ oem: 1, version: 1 }, { unique: true });
  await db.collection('raw_archive').createIndex({ received_at: 1 }, { expireAfterSeconds: 7 * 86400 });
  await db.collection('dead_letter').createIndex({ at: 1 }, { expireAfterSeconds: 3 * 86400 });
  await db.collection('dead_letter').createIndex({ reason: 1, at: -1 });
  for (const o of ['A', 'B', 'C', 'D']) {
    const doc = JSON.parse(fs.readFileSync(new URL(`../mappings/oem-${o}.json`, import.meta.url)));
    await db.collection('oem_mappings').updateOne({ oem: o, version: 1 }, { $setOnInsert: { ...doc, version: 1, active: true, created_at: new Date(), created_by: 'seed' } }, { upsert: true });
  }
  await m.close();
  const c = (await q('SELECT count(*) c FROM vehicle')).rows[0].c;
  log(`done. vehicles=${c}. Logins: admin@fleetnorm.dev / Admin@123 ; manager@fleetnorm.dev / Manager@123 ; viewer@fleetnorm.dev / Viewer@123`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
