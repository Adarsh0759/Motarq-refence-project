import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, getToken } from '../api.js';
import { IconTruck, IconBolt, IconAlert, IconWallet, IconMap, IconBell } from '../icons.jsx';

const fmt = (n) => Number(n || 0).toLocaleString();
const ago = (ts) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
};

function Kpi({ icon, tone, label, value, hint }) {
  return (
    <div className={`card kpi-card ${tone || ''}`}>
      <div className="kpi-icon">{icon}</div>
      <h3>{label}</h3>
      {value == null ? <div className="skeleton" style={{ width: '60%', height: 30 }} /> : <div className="kpi">{value}</div>}
      {hint && <div className="sub" style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [feed, setFeed] = useState([]);
  const map = useRef(null); const layer = useRef(null);

  useEffect(() => {
    map.current = L.map('map', { zoomControl: true }).setView([13.0, 78.0], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap', maxZoom: 18 }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => map.current.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [sum, live] = await Promise.all([api('/api/insights/summary'), api('/api/vehicles/live?limit=400')]);
        if (!alive) return;
        setS(sum); layer.current.clearLayers();
        live.data.forEach((v) => L.circleMarker([v.lat, v.lon], {
          radius: 4, weight: 1.5, fillOpacity: .9,
          color: v.engine_on ? (v.speed_kmh < 1 ? '#fbbf24' : '#34d399') : '#64748b',
          fillColor: v.engine_on ? (v.speed_kmh < 1 ? '#fbbf24' : '#34d399') : '#64748b',
        }).bindTooltip(`${v.vin} · ${Math.round(v.speed_kmh)} km/h`).addTo(layer.current));
      } catch { /* keep last known values on transient failure */ }
    };
    tick(); const id = setInterval(tick, 2000); return () => { alive = false; clearInterval(id); };
  }, []);

  useEffect(() => {
    const es = new EventSource(`/api/stream/alerts?token=${encodeURIComponent(getToken())}`);
    es.onmessage = (m) => setFeed((f) => [JSON.parse(m.data), ...f].slice(0, 12));
    return () => es.close();
  }, []);

  return (
    <div className="grid">
      <div className="grid k4">
        <Kpi icon={<IconTruck />} label="Active vehicles (2 min)" value={s && fmt(s.active_vehicles)} />
        <Kpi icon={<IconBolt />} label="Events / sec" value={s && fmt(s.events_per_sec)} />
        <Kpi icon={<IconAlert />} tone={s?.open_alerts > 0 ? 'bad' : 'ok'} label="Open alerts" value={s && fmt(s.open_alerts)} />
        <Kpi icon={<IconWallet />} tone="warn" label="Idle cost, 7 days" value={s && `₹${fmt(s.idle_cost_7d_inr)}`} hint="estimate, see assumptions in Insights" />
      </div>
      <div className="grid k2">
        <div className="card">
          <h3><IconMap /> Live fleet (latest 400)</h3>
          <div id="map" />
          <div className="map-legend">
            <span><i style={{ background: '#34d399' }} /> moving</span>
            <span><i style={{ background: '#fbbf24' }} /> idling</span>
            <span><i style={{ background: '#64748b' }} /> engine off</span>
          </div>
        </div>
        <div className="card">
          <h3><IconBell /> Live alerts</h3>
          {feed.length === 0
            ? <div className="empty-state"><IconBell /><div className="title">Waiting for alerts</div><div className="hint">New idling, harsh-braking and DTC alerts will stream in here in real time.</div></div>
            : feed.map((a) => (
              <div key={a.alert_id} className="feed-item">
                <span className={`feed-dot ${a.severity}`} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div><span className={`tag ${a.severity}`}>{a.code}</span></div>
                  <div className="sub" style={{ marginTop: 4 }}>{a.vin} · {ago(a.ts)}</div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
