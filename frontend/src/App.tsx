import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useAuth } from '@/lib/auth';
import { AppShell } from '@/components/layout/AppShell';
import { Login } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { Alerts } from '@/pages/Alerts';
import { Insights } from '@/pages/Insights';
import { Onboard } from '@/pages/Onboard';

export default function App() {
  const { authed, role } = useAuth();

  return (
    <>
      <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', color: 'hsl(var(--popover-foreground))' } }} />
      {!authed ? (
        <Login />
      ) : (
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="insights" element={<Insights />} />
            <Route path="onboarding" element={role === 'admin' ? <Onboard /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </>
  );
}
