import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Bell, BarChart3, PlugZap, Sun, Moon, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api } from '@/lib/api';
import type { Summary } from '@/lib/types';
import { Logo } from '@/components/Logo';

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean; badge?: number }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
];

export function Sidebar() {
  const { role, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const { data: summary } = useQuery({ queryKey: ['summary'], queryFn: () => api<Summary>('/api/insights/summary'), refetchInterval: 2000 });

  const items = NAV.map((n) => (n.to === '/alerts' ? { ...n, badge: summary?.open_alerts } : n));

  return (
    <aside className="relative flex h-screen w-[252px] flex-none flex-col justify-between overflow-hidden bg-sidebar p-5 text-sidebar-foreground">
      <div
        className="pointer-events-none absolute -left-24 -top-32 h-[300px] w-[300px] rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.35), transparent 70%)' }}
      />

      <div className="relative z-10 flex flex-col gap-8">
        <div className="flex items-center justify-between pl-1 pt-1">
          <Logo size={38} wordmarkClassName="text-[18px] font-bold tracking-[-0.3px] text-white [&_span:last-child]:text-sky-300" />
          <button
            onClick={toggle}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </button>
        </div>

        <nav className="flex flex-col gap-1.5">
          <p className="mb-1 pl-3.5 text-[11px] font-semibold tracking-[1.1px] text-slate-500">MENU</p>
          {items.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-400 transition-colors hover:text-white',
                  isActive && 'text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl bg-accent-gradient shadow-[0_6px_18px_-4px_rgba(37,99,235,0.45)]"
                      transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
                    />
                  )}
                  <Icon className="relative z-10 h-[18px] w-[18px]" />
                  <span className="relative z-10 font-medium">{label}</span>
                  {!!badge && (
                    <span className="relative z-10 ml-auto rounded-full bg-destructive px-[7px] py-px text-[11px] font-bold text-white">{badge}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
          {role === 'admin' && (
            <NavLink
              to="/onboarding"
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-medium text-slate-400 transition-colors hover:text-white',
                  isActive && 'text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute inset-0 rounded-xl bg-accent-gradient shadow-[0_6px_18px_-4px_rgba(37,99,235,0.45)]"
                      transition={{ type: 'spring', bounce: 0.25, duration: 0.4 }}
                    />
                  )}
                  <PlugZap className="relative z-10 h-[18px] w-[18px]" />
                  <span className="relative z-10 font-medium">OEM Onboarding</span>
                </>
              )}
            </NavLink>
          )}
        </nav>
      </div>

      <div className="relative z-10 flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.06] p-3.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            <span className="text-[13px] font-semibold text-white">Pipeline healthy</span>
          </div>
          <p className="text-xs text-slate-400">Consumer lag 0 · 2 replicas</p>
        </div>

        <div className="flex items-center gap-2.5 rounded-xl p-1">
          <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-xs font-bold text-white">
            {role.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white capitalize">{role}</p>
            <p className="truncate text-[11px] text-slate-400">{role}@fleetnorm.dev</p>
          </div>
          <button onClick={logout} className="flex-none text-slate-400 transition-colors hover:text-white" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
