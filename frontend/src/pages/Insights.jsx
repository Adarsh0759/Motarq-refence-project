import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '../api.js';
import { IconWallet, IconTruck, IconAlert } from '../icons.jsx';

const DAYS = [1, 7, 30];

export default function Insights() {
  const [idle, setIdle] = useState(null);
  const [util, setUtil] = useState(null);
  const [risk, setRisk] = useState(null);
  const [days, setDays] = useState(7);
  useEffect(() => {
    api(`/api/insights/idling-cost?days=${days}&limit=10`).then(setIdle).catch(() => {});
    api(`/api/insights/utilisation?days=${days}&limit=10`).then(setUtil).catch(() => {});
    api('/api/insights/risk?limit=10').then(setRisk).catch(() => {});
  }, [days]);
  const short = (v) => v.slice(-6);

  return (
    <div className="grid">
      <div className="page-head">
        <h2>Insights</h2>
        <span className="sp" />
        <div className="chip-toggle">{DAYS.map((d) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>last {d}d</button>)}</div>
      </div>

      <div className="grid k2">
        <div className="card">
          <h3><IconWallet /> Idling cost by vehicle, top 10</h3>
          {!idle ? <div className="skeleton" style={{ height: 240 }} /> : (
            <>
              <div className="kpi">₹{idle.total.cost_inr.toLocaleString()}</div>
              <div className="sub" style={{ marginBottom: 14 }}>{idle.total.idle_hours} idle hours · {(idle.total.idle_ratio * 100).toFixed(1)}% of engine samples</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={idle.top_vehicles.map((v) => ({ vin: short(v.vin), cost: v.cost_inr }))}>
                  <CartesianGrid stroke="#1a2033" vertical={false} />
                  <XAxis dataKey="vin" stroke="#5b6378" fontSize={11} tickLine={false} axisLine={{ stroke: '#232b3f' }} />
                  <YAxis stroke="#5b6378" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: '#161c2c', border: '1px solid #232b3f', borderRadius: 8, fontSize: 12.5 }} cursor={{ fill: '#ffffff08' }} />
                  <Bar dataKey="cost" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <p className="sub">Assumes {idle.assumptions.litres_per_idle_hour} L per idle hour at ₹{idle.assumptions.inr_per_litre}/L (configurable).</p>
            </>
          )}
        </div>
        <div className="card">
          <h3><IconWallet /> Idling cost by fleet</h3>
          <table><thead><tr><th>Fleet</th><th>Idle h</th><th>₹</th></tr></thead>
            <tbody>{idle?.by_fleet.map((f) => <tr key={f.fleet_id}><td>{f.fleet_id}</td><td>{f.idle_hours}</td><td>{f.cost_inr}</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="grid k2">
        <div className="card">
          <h3><IconTruck /> Utilisation: distance driven, top 10</h3>
          <table><thead><tr><th>VIN</th><th>km</th><th>Active h</th><th>Max km/h</th></tr></thead>
            <tbody>{util?.vehicles.map((v) => <tr key={v.vin}><td style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12.5 }}>{v.vin}</td><td>{v.distance_km}</td><td>{v.active_hours}</td><td>{v.max_speed_kmh}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="card">
          <h3><IconAlert /> Breakdown risk ranking {risk && <span className="sub" style={{ textTransform: 'none', fontWeight: 500, letterSpacing: 0 }}>({risk.source === 'ml' ? 'ML model' : 'rule fallback'})</span>}</h3>
          <table><thead><tr><th>VIN</th><th>Risk</th></tr></thead>
            <tbody>{risk?.vehicles.map((v) => <tr key={v.vin}><td style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 12.5 }}>{v.vin}</td><td>{(v.risk * 100).toFixed(1)}%</td></tr>)}</tbody>
          </table>
          <p className="sub" style={{ marginTop: 10 }}>Model trained on synthetic data; see docs/ml/results.md.</p>
        </div>
      </div>
    </div>
  );
}
