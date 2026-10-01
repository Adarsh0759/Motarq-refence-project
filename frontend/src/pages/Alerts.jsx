import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { IconAlert, IconInbox, IconCheck } from '../icons.jsx';

const STATUSES = ['open', 'ack', 'closed'];

export default function Alerts({ role }) {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [status, setStatus] = useState('open');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async (reset) => {
    const r = await api(`/api/alerts?status=${status}&limit=25${!reset && cursor ? `&cursor=${cursor}` : ''}`);
    setRows((p) => (reset ? r.data : [...p, ...r.data])); setCursor(r.next_cursor);
  };
  useEffect(() => {
    setCursor(null); setLoading(true);
    load(true).catch((e) => setMsg(e.message)).finally(() => setLoading(false));
    /* eslint-disable-next-line */
  }, [status]);

  const ack = async (id) => {
    try { await api(`/api/alerts/${id}/ack`, { method: 'POST' }); setRows((p) => p.filter((x) => x.alert_id !== id)); }
    catch (e) { setMsg(e.status === 403 ? 'Your role cannot acknowledge alerts' : e.message); }
  };

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Alerts</h3>
        <span className="sp" />
        <div className="chip-toggle">
          {STATUSES.map((st) => <button key={st} className={status === st ? 'on' : ''} onClick={() => setStatus(st)}>{st}</button>)}
        </div>
      </div>
      {msg && <div className="err-banner"><IconAlert width={15} height={15} /> {msg}</div>}
      {loading ? (
        <div className="grid" style={{ gap: 8 }}>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 36 }} />)}</div>
      ) : rows.length === 0 ? (
        <div className="empty-state"><IconInbox /><div className="title">No {status} alerts</div><div className="hint">Nothing to show for this status right now.</div></div>
      ) : (
        <>
          <table>
            <thead><tr><th>#</th><th>Severity</th><th>Type</th><th>VIN</th><th>Raised</th><th>Detail</th><th /></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.alert_id}>
                  <td className="sub">{a.alert_id}</td>
                  <td><span className={`tag ${a.severity}`}>{a.severity}</span></td>
                  <td>{a.code}</td>
                  <td style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12.5 }}>{a.vin}</td>
                  <td className="sub">{new Date(a.raised_at).toLocaleString()}</td>
                  <td className="sub">{JSON.stringify(a.detail)}</td>
                  <td>{status === 'open' && role !== 'viewer' && <button className="btn alt" onClick={() => ack(a.alert_id)}><IconCheck width={13} height={13} /> Ack</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {cursor && <p style={{ marginTop: 14 }}><button className="btn alt" onClick={() => load(false)}>Load more</button></p>}
        </>
      )}
    </div>
  );
}
