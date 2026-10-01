import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { IconUpload, IconCheck, IconAlert, IconRefresh, IconInbox } from '../icons.jsx';

const MAP_E = { oem: 'E', fields: { vin: { path: 'chassis' }, ts: { path: 'unixTime', format: 'epoch_ms' }, lat: { path: 'coords.y' }, lon: { path: 'coords.x' }, speed_kmh: { path: 'kph', unit: 'kph' },
  odo_km: { path: 'odometer', unit: 'km' }, fuel_pct: { path: 'fuel', scale: 100 }, engine_on: { path: 'running', truthy: ['Y'] }, rpm: { path: 'revs' }, dtc: { path: 'dtcList' }, evt: { path: 'event' }, seq: { path: 'counter' } } };
const SAMPLE_E = { chassis: '1HGCM82633A004352', unixTime: 1790000000000, coords: { y: 13.08, x: 80.27 }, kph: 64.2, odometer: 18234.7, fuel: 0.41, running: 'Y', revs: 2100, dtcList: ['P0301'], event: 'HARSH_BRAKE', counter: 88412 };

export default function Onboard() {
  const [mapping, setMapping] = useState(JSON.stringify(MAP_E, null, 2));
  const [payload, setPayload] = useState(JSON.stringify(SAMPLE_E, null, 2));
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState('');
  const [list, setList] = useState([]);
  const [dlq, setDlq] = useState({ counts: {} });

  const refresh = () => { api('/api/admin/oem-mappings').then((r) => setList(r.data)).catch(() => {}); api('/api/admin/dlq').then(setDlq).catch(() => {}); };
  useEffect(() => { refresh(); const id = setInterval(refresh, 2000); return () => clearInterval(id); }, []);

  const parse = (t) => { try { return JSON.parse(t); } catch { setMsg('Invalid JSON'); return null; } };
  const doPreview = async () => {
    const m = parse(mapping), p = parse(payload); if (!m || !p) return; setMsg('');
    try { setPreview(await api('/api/admin/oem-mappings/preview', { method: 'POST', body: { mapping: m, payload: p } })); }
    catch (e) { setPreview({ ok: false, reason: JSON.stringify(e.data?.issues || e.message) }); }
  };
  const save = async () => {
    const m = parse(mapping); if (!m) return;
    try { const r = await api('/api/admin/oem-mappings', { method: 'POST', body: m }); setMsg(`Saved ${r.oem} v${r.version} (inactive)`); refresh(); }
    catch (e) { setMsg(`Save failed: ${e.message}`); }
  };
  const activate = async (oem, v) => { await api(`/api/admin/oem-mappings/${oem}/activate/${v}`, { method: 'POST' }); setMsg(`Activated ${oem} v${v} — processors reload instantly, no restart`); refresh(); };
  const dl = Object.entries(dlq.counts);

  return (
    <div className="grid">
      <div className="page-head">
        <h2>OEM Onboarding</h2>
      </div>
      <div className="two">
        <div className="card">
          <h3>1. Mapping (JSON)</h3>
          <textarea rows={22} value={mapping} onChange={(e) => setMapping(e.target.value)} spellCheck={false} />
        </div>
        <div className="card">
          <h3>2. Sample raw payload from the new OEM</h3>
          <textarea rows={12} value={payload} onChange={(e) => setPayload(e.target.value)} spellCheck={false} />
          <p className="row" style={{ marginTop: 12 }}>
            <button className="btn alt" onClick={doPreview}><IconRefresh width={14} height={14} /> Preview normalisation</button>
            <button className="btn" onClick={save}><IconUpload width={14} height={14} /> Save as new version</button>
          </p>
          {preview && (
            <pre className={preview.ok ? 'ok' : 'err'}>{JSON.stringify(preview.ok ? preview.event : preview.reason, null, 2)}</pre>
          )}
          {msg && <div className="ok-banner" style={{ marginTop: 10, marginBottom: 0 }}><IconCheck width={14} height={14} /> {msg}</div>}
        </div>
      </div>
      <div className="two">
        <div className="card">
          <h3>Mapping versions</h3>
          {list.length === 0 ? (
            <div className="empty-state"><IconInbox /><div className="title">No mappings yet</div></div>
          ) : (
            <table><thead><tr><th>OEM</th><th>Version</th><th>Status</th><th /></tr></thead>
              <tbody>{list.map((m) => (
                <tr key={`${m.oem}${m.version}`}>
                  <td>{m.oem}</td><td>v{m.version}</td>
                  <td>{m.active ? <span className="tag info">active</span> : <span className="sub">inactive</span>}</td>
                  <td>{!m.active && <button className="btn alt" onClick={() => activate(m.oem, m.version)}>Activate</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3><IconAlert /> Dead-letter counters (events rejected)</h3>
          {dl.length === 0
            ? <div className="empty-state"><IconCheck /><div className="title">None</div></div>
            : <table><tbody>{dl.map(([k, n]) => <tr key={k}><td>{k}</td><td>{n.toLocaleString()}</td></tr>)}</tbody></table>}
          <p className="sub" style={{ marginTop: 12 }}>Demo: events from OEM E land here as <b>no_mapping</b> until you activate its mapping; the counter then stops growing.</p>
          <button className="btn alt" style={{ marginTop: 10 }} onClick={() => api('/api/admin/dlq', { method: 'DELETE' }).then(refresh)}><IconRefresh width={14} height={14} /> Reset counters</button>
        </div>
      </div>
    </div>
  );
}
