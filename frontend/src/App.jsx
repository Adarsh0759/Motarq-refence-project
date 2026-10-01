import React, { useState } from 'react';
import { api, setToken, getToken } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Alerts from './pages/Alerts.jsx';
import Insights from './pages/Insights.jsx';
import Onboard from './pages/Onboard.jsx';
import { IconShield, IconAlert, IconLogout, IconSpinner } from './icons.jsx';

function Login({ onOk }) {
  const [email, setEmail] = useState('admin@fleetnorm.dev');
  const [pw, setPw] = useState('Admin@123');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email, password: pw } });
      setToken(r.access_token); localStorage.setItem('fn_role', r.role); onOk();
    } catch (x) {
      setErr(x.status === 429 ? 'Too many attempts — wait a minute and try again' : 'Invalid credentials');
    } finally { setBusy(false); }
  };

  return (
    <div className="login-shell">
      <form className="card login" onSubmit={go}>
        <div className="login-badge"><div className="brand-mark" style={{ width: 44, height: 44, borderRadius: 13, fontSize: 19 }}><IconShield width={22} height={22} /></div></div>
        <h2>FleetNorm</h2>
        <p className="sub">Multi-OEM fleet telemetry intelligence</p>
        <div className="field">
          <label className="field-label" htmlFor="email">Email</label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.dev" autoComplete="username" />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="pw">Password</label>
          <input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
        </div>
        <button className="btn" disabled={busy}>{busy ? <><IconSpinner width={15} height={15} /> Signing in…</> : 'Sign in'}</button>
        {err && <p className="err"><IconAlert width={15} height={15} /> {err}</p>}
        <div className="login-hint">Demo tenant · admin@fleetnorm.dev / Admin@123<br />viewer@fleetnorm.dev / Viewer@123</div>
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());
  const [tab, setTab] = useState('dash');
  const role = localStorage.getItem('fn_role') || 'viewer';
  if (!authed) return <Login onOk={() => setAuthed(true)} />;

  const tabs = [['dash', 'Dashboard'], ['alerts', 'Alerts'], ['ins', 'Insights'], ...(role === 'admin' ? [['oem', 'OEM Onboarding']] : [])];
  const signOut = () => { setToken(''); localStorage.removeItem('fn_role'); setAuthed(false); };

  return (
    <>
      <header>
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <h1>FleetNorm</h1>
            <div className="brand-sub">Multi-OEM fleet intelligence</div>
          </div>
        </div>
        <nav>{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
        <span className="sp" />
        <span className="role-chip"><IconShield width={12} height={12} /> {role}</span>
        <button className="btn alt" onClick={signOut}><IconLogout width={15} height={15} /> Sign out</button>
      </header>
      <main>
        {tab === 'dash' && <Dashboard />}
        {tab === 'alerts' && <Alerts role={role} />}
        {tab === 'ins' && <Insights />}
        {tab === 'oem' && <Onboard />}
      </main>
    </>
  );
}
